# employee_productivity.py
import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime
from datetime import datetime, timedelta
import json

@frappe.whitelist()
def get_employee_productivity_data(filters=None):
    """دریافت داده‌های بهره‌وری کارمندان"""
    if not filters:
        filters = {}
    
    filters = frappe._dict(filters)
    
    # تاریخ پیش‌فرض اگر تعریف نشده باشد
    if not filters.from_date:
        filters.from_date = frappe.utils.add_days(frappe.utils.nowdate(), -30)
    if not filters.to_date:
        filters.to_date = frappe.utils.nowdate()
    
    # گرفتن داده‌های اصلی
    job_cards_data = get_job_cards_data(filters)
    employee_paths = get_employee_work_paths(filters)
    employee_attendance = get_employee_attendance(filters)
    
    # محاسبه امتیازات
    productivity_scores = calculate_productivity_scores(job_cards_data)
    
    return {
        'job_cards': job_cards_data,
        'employee_paths': employee_paths,
        'attendance': employee_attendance,
        'productivity_scores': productivity_scores,
        'summary': get_productivity_summary(productivity_scores)
    }

def get_job_cards_data(filters):
    """گرفتن اطلاعات کارت‌های کار"""
    conditions = []
    values = {}
    
    if filters.get('employee'):
        conditions.append("jc.employee = %(employee)s")
        values['employee'] = filters.employee
    
    if filters.get('from_date'):
        conditions.append("DATE(jc.posting_date) >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("DATE(jc.posting_date) <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    if filters.get('workstation'):
        conditions.append("jc.workstation = %(workstation)s")
        values['workstation'] = filters.workstation
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
        SELECT 
            jc.name,
            jc.employee,
            jc.operation,
            jc.workstation,
            jc.work_order,
            jc.completed_qty,
            jc.for_quantity,
            jc.posting_date,
            jc.status,
            wo.priority as work_order_priority,
            ro.time_in_mins as standard_time,
            (SELECT SUM(TIMESTAMPDIFF(MINUTE, from_time, to_time)) 
             FROM `tabTime Log` tl 
             WHERE tl.reference_name = jc.name AND tl.reference_type = 'Job Card') as actual_time_mins,
            (SELECT COUNT(*) FROM `tabTime Log` tl 
             WHERE tl.reference_name = jc.name AND tl.reference_type = 'Job Card') as time_log_count
        FROM 
            `tabJob Card` jc
        LEFT JOIN 
            `tabWork Order` wo ON jc.work_order = wo.name
        LEFT JOIN 
            `tabRouting Operation` ro ON jc.operation = ro.operation
        WHERE 
            jc.docstatus = 1 {where_clause}
        ORDER BY 
            jc.employee, jc.posting_date, jc.creation
    """
    
    return frappe.db.sql(query, values, as_dict=1)

def get_employee_work_paths(filters):
    """گرفتن مسیر کار کارمندان"""
    conditions = []
    values = {}
    
    if filters.get('employee'):
        conditions.append("tl.employee = %(employee)s")
        values['employee'] = filters.employee
    
    if filters.get('from_date'):
        conditions.append("DATE(tl.from_time) >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("DATE(tl.from_time) <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
        SELECT 
            tl.employee,
            tl.reference_name as job_card,
            tl.from_time,
            tl.to_time,
            jc.operation,
            jc.workstation,
            TIMESTAMPDIFF(MINUTE, tl.from_time, tl.to_time) as duration_mins
        FROM 
            `tabTime Log` tl
        LEFT JOIN 
            `tabJob Card` jc ON tl.reference_name = jc.name
        WHERE 
            tl.reference_type = 'Job Card' 
            AND tl.docstatus = 1 {where_clause}
        ORDER BY 
            tl.employee, tl.from_time
    """
    
    time_logs = frappe.db.sql(query, values, as_dict=1)
    
    # گروه‌بندی بر اساس کارمند
    employee_paths = {}
    for log in time_logs:
        employee = log.employee
        if employee not in employee_paths:
            employee_paths[employee] = []
        
        employee_paths[employee].append({
            'job_card': log.job_card,
            'operation': log.operation,
            'workstation': log.workstation,
            'from_time': log.from_time,
            'to_time': log.to_time,
            'duration_mins': log.duration_mins
        })
    
    return employee_paths

def get_employee_attendance(filters):
    """گرفتن اطلاعات حضور و غیاب کارمندان"""
    conditions = []
    values = {}
    
    if filters.get('employee'):
        conditions.append("employee = %(employee)s")
        values['employee'] = filters.employee
    
    if filters.get('from_date'):
        conditions.append("attendance_date >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("attendance_date <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
        SELECT 
            employee,
            attendance_date,
            status,
            in_time,
            out_time,
            late_entry,
            early_exit
        FROM 
            `tabAttendance`
        WHERE 
            docstatus = 1 {where_clause}
        ORDER BY 
            employee, attendance_date
    """
    
    return frappe.db.sql(query, values, as_dict=1)

def calculate_productivity_scores(job_cards_data):
    """محاسبه امتیازات بهره‌وری"""
    productivity_scores = {}
    
    for jc in job_cards_data:
        employee = jc.employee
        if employee not in productivity_scores:
            productivity_scores[employee] = {
                'employee': employee,
                'total_score': 0,
                'efficiency_score': 0,
                'quality_score': 0,
                'attendance_score': 0,
                'collaboration_score': 0,
                'job_cards_count': 0,
                'total_output': 0,
                'badges': []
            }
        
        # محاسبه امتیاز کارت
        card_score = calculate_job_card_score(jc)
        productivity_scores[employee]['total_score'] += card_score
        productivity_scores[employee]['job_cards_count'] += 1
        productivity_scores[employee]['total_output'] += flt(jc.completed_qty)
    
    # محاسبه میانگین امتیازات
    for employee, scores in productivity_scores.items():
        if scores['job_cards_count'] > 0:
            scores['average_score'] = scores['total_score'] / scores['job_cards_count']
            
            # محاسبه امتیازات جزئی
            scores['efficiency_score'] = calculate_efficiency_score(employee, job_cards_data)
            scores['quality_score'] = calculate_quality_score(employee, job_cards_data)
            scores['attendance_score'] = 85  # موقت - باید از attendance محاسبه شود
            scores['collaboration_score'] = 75  # موقت
            
            # محاسبه امتیاز نهایی
            scores['final_score'] = (
                0.4 * scores['efficiency_score'] +
                0.3 * scores['quality_score'] +
                0.2 * scores['attendance_score'] +
                0.1 * scores['collaboration_score']
            )
            
            # تعیین نشان‌ها
            scores['badges'] = determine_badges(employee, scores, job_cards_data)
    
    return productivity_scores

def calculate_job_card_score(job_card):
    """محاسبه امتیاز یک کارت کار"""
    completed_qty = flt(job_card.completed_qty)
    standard_time = flt(job_card.standard_time) or 60  # پیش‌فرض 60 دقیقه
    actual_time = flt(job_card.actual_time_mins) or standard_time
    
    # ضریب اولویت
    priority_factors = {
        'High': 1.5,
        'Medium': 1.0,
        'Low': 0.8
    }
    priority_factor = priority_factors.get(job_card.work_order_priority, 1.0)
    
    # ضریب سختی (موقت - باید از BOM گرفته شود)
    difficulty_weight = 1.0
    
    # محاسبه امتیاز پایه
    base_score = (completed_qty * difficulty_weight * priority_factor) / (standard_time / 60)
    
    # ضریب زمان
    time_efficiency = standard_time / actual_time if actual_time > 0 else 1
    
    final_score = base_score * time_efficiency
    
    return final_score

def calculate_efficiency_score(employee, job_cards_data):
    """محاسبه امتیاز کارایی"""
    employee_cards = [jc for jc in job_cards_data if jc.employee == employee]
    
    if not employee_cards:
        return 0
    
    total_efficiency = 0
    valid_cards = 0
    
    for jc in employee_cards:
        if jc.standard_time and jc.actual_time_mins:
            efficiency = (flt(jc.standard_time) / flt(jc.actual_time_mins)) * 100
            total_efficiency += efficiency
            valid_cards += 1
    
    return total_efficiency / valid_cards if valid_cards > 0 else 0

def calculate_quality_score(employee, job_cards_data):
    """محاسبه امتیاز کیفیت"""
    # موقت - در آینده باید از Quality Inspection گرفته شود
    return 95  # درصد کیفیت پیش‌فرض

def determine_badges(employee, scores, job_cards_data):
    """تعیین نشان‌های کارمند"""
    badges = []
    
    # سریع‌ترین اجرا
    if scores['efficiency_score'] > 120:
        badges.append({'name': 'Fastest Finish', 'icon': '⚡', 'color': 'gold'})
    
    # بیشترین تولید
    if scores['total_output'] > 500:
        badges.append({'name': 'Top Producer', 'icon': '🏭', 'color': 'blue'})
    
    # کیفیت عالی
    if scores['quality_score'] > 98:
        badges.append({'name': 'Zero Defect', 'icon': '💎', 'color': 'green'})
    
    # همکاری تیمی
    if scores['collaboration_score'] > 90:
        badges.append({'name': 'Team Player', 'icon': '🤝', 'color': 'purple'})
    
    return badges

def get_productivity_summary(productivity_scores):
    """خلاصه عملکرد کلی"""
    if not productivity_scores:
        return {}
    
    all_scores = list(productivity_scores.values())
    
    # رتبه‌بندی
    sorted_employees = sorted(all_scores, key=lambda x: x.get('final_score', 0), reverse=True)
    
    # آماری کلی
    total_employees = len(all_scores)
    avg_efficiency = sum(emp.get('efficiency_score', 0) for emp in all_scores) / total_employees if total_employees > 0 else 0
    top_performer = sorted_employees[0] if sorted_employees else None
    
    return {
        'total_employees': total_employees,
        'average_efficiency': avg_efficiency,
        'top_performer': top_performer,
        'rankings': sorted_employees[:10]  # تاپ 10
    }

@frappe.whitelist()
def get_employee_list():
    """لیست کارمندان برای فیلتر"""
    return frappe.db.sql("""
        SELECT DISTINCT employee as value, employee as label
        FROM `tabJob Card`
        WHERE employee IS NOT NULL AND employee != ''
        ORDER BY employee
    """, as_dict=1)

@frappe.whitelist()
def get_workstation_list():
    """لیست ایستگاه‌های کار برای فیلتر"""
    return frappe.db.sql("""
        SELECT name as value, workstation_name as label
        FROM `tabWorkstation`
        ORDER BY workstation_name
    """, as_dict=1)