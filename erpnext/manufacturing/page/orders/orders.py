# employee_productivity.py
import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime
from frappe.utils import now_datetime, today, add_days, get_datetime

from datetime import datetime, timedelta,date
import json

@frappe.whitelist()
def get_employee_productivity_data(filters=None):
    """
    دریافت مسیر کاری کارمندان
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}
    
    try:
        #حذف فیلتر تاریخ برای دیدن همه داده‌ها
        date_filter = ""
        # if filters.get('from_date') and filters.get('to_date'):
        #     date_filter = f"AND DATE(tl.from_time) BETWEEN '{filters['from_date']}' AND '{filters['to_date']}'"
        # elif filters.get('from_date'):
        #     date_filter = f"AND DATE(tl.from_time) >= '{filters['from_date']}'"
        
        # فیلتر پیش‌فرض: 30 روز گذشته
        date_filter = "AND DATE(tl.from_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
        
        employee_filter = ""
        if filters.get('employee') and filters.get('employee').strip():
            employee_filter = f"AND tl.employee = '{filters['employee']}'"
            
        workstation_filter = ""
        if filters.get('workstation'):
            workstation_filter = f"AND jc.workstation = '{filters['workstation']}'"
        
        query = f"""
        SELECT
            tl.employee,
            jc.workstation,
            jc.operation,
            jc.name as job_card,
            tl.from_time,
            tl.to_time,
            tl.time_in_mins as duration_mins,
            tl.completed_qty,
            jc.production_item
        FROM `tabJob Card Time Log` tl
        INNER JOIN `tabJob Card` jc ON jc.name = tl.parent
        WHERE tl.docstatus < 2 
        AND jc.docstatus = 1
        AND tl.employee IS NOT NULL
        AND tl.from_time IS NOT NULL
        {date_filter}
        {employee_filter}
        {workstation_filter}
        ORDER BY tl.employee, tl.from_time
        """
        
        time_logs = frappe.db.sql(query, as_dict=True)
        
        # گروه‌بندی بر اساس کارمند
        employee_paths = {}
        for log in time_logs:
            employee = log['employee']
            if employee not in employee_paths:
                employee_paths[employee] = []
            employee_paths[employee].append(log)
        
        # دریافت Job Cards
        job_cards = get_job_cards_data(filters)
        
        # محاسبه productivity scores
        productivity_scores = calculate_productivity_scores(job_cards)
        
        # دریافت خلاصه
        summary = get_productivity_summary(productivity_scores)
        
        return {
            "employee_paths": employee_paths,
            "job_cards": job_cards,
            "productivity_scores": productivity_scores,
            "summary": summary
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_employee_productivity_data: {str(e)}")
        return {
            "employee_paths": {},
            "job_cards": [],
            "productivity_scores": {},
            "summary": {}
        }
def get_job_cards_data(filters):
    """گرفتن اطلاعات کارت‌های کار (ERPNext v15 compatible)"""
    conditions = []
    values = {}
    
    if filters.get('employee') and filters.get('employee').strip():
        conditions.append("tl.employee = %(employee)s")
        values['employee'] = filters['employee']
    
    if filters.get('from_date'):
        conditions.append("DATE(jc.posting_date) >= %(from_date)s")
        values['from_date'] = filters['from_date']
    
    if filters.get('to_date'):
        conditions.append("DATE(jc.posting_date) <= %(to_date)s")
        values['to_date'] = filters['to_date']
    
    if filters.get('workstation'):
        conditions.append("jc.workstation = %(workstation)s")
        values['workstation'] = filters['workstation']
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
        SELECT 
            jc.name,
            tl.employee,
            jc.operation,
            jc.workstation,
            jc.work_order,
            tl.completed_qty,
            jc.for_quantity,
            jc.posting_date,
            jc.status,
            wop.time_in_mins as standard_time,
            tl.time_in_mins as actual_time_mins,
            COUNT(tl.name) as time_log_count
        FROM 
            `tabJob Card` jc
        LEFT JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        LEFT JOIN `tabWork Order` wo ON jc.work_order = wo.name
        LEFT JOIN `tabWork Order Operation` wop 
            ON wop.parent = jc.work_order 
           AND wop.operation = jc.operation
        WHERE 
            jc.docstatus = 1
            {where_clause}
        GROUP BY 
            jc.name, tl.employee, jc.operation, jc.workstation, jc.work_order,
            tl.completed_qty, jc.for_quantity, jc.posting_date, jc.status, wop.time_in_mins, tl.time_in_mins
        ORDER BY 
            tl.employee, jc.posting_date, jc.creation
    """
    
    result = frappe.db.sql(query, values, as_dict=1)
    return result

def get_employee_work_paths(filters):
    """گرفتن مسیر کار کارمندان"""
    conditions = []
    values = {}
    
    if filters.get('employee'):
        conditions.append("jctl.employee = %(employee)s")
        values['employee'] = filters.employee
    
    if filters.get('from_date'):
        conditions.append("DATE(jctl.from_time) >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("DATE(jctl.from_time) <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
        SELECT 
            jctl.employee,
            jctl.parent as job_card,
            jctl.from_time,
            jctl.to_time,
            jc.operation,
            jc.workstation,
            TIMESTAMPDIFF(MINUTE, jctl.from_time, jctl.to_time) as duration_mins
        FROM 
            `tabJob Card Time Log` jctl
        LEFT JOIN 
            `tabJob Card` jc ON jctl.parent = jc.name
        WHERE 
            jc.docstatus = 1 {where_clause}
        ORDER BY 
            jctl.employee, jctl.from_time
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
    """
    گرفتن اطلاعات حضور و غیاب کارمندان از روی Job Cardها
    فقط با frappe.utils.getdate و get_time و get_datetime
    """
    conditions = []
    values = {}

    if filters.get('employee'):
        conditions.append("jctl.employee = %(employee)s")
        values['employee'] = filters['employee']
    if filters.get('from_date'):
        conditions.append("DATE(jctl.from_time) >= %(from_date)s")
        values['from_date'] = frappe.utils.getdate(filters['from_date'])
    if filters.get('to_date'):
        conditions.append("DATE(jctl.from_time) <= %(to_date)s")
        values['to_date'] = frappe.utils.getdate(filters['to_date'])
    if filters.get('workstation'):
        conditions.append("jc.workstation = %(workstation)s")
        values['workstation'] = filters['workstation']

    where_clause = " AND " + " AND ".join(conditions) if conditions else ""

    query = f"""
        SELECT 
            jctl.employee,
            emp.employee_name,
            DATE(jctl.from_time) as attendance_date,
            MIN(TIME(jctl.from_time)) as in_time,
            MAX(CASE 
                WHEN jctl.to_time IS NOT NULL 
                THEN TIME(jctl.to_time) 
                ELSE TIME(DATE_ADD(jctl.from_time, INTERVAL jctl.time_in_mins/60 HOUR))
            END) as out_time,
            SUM(jctl.time_in_mins)/60 as total_hours,
            COUNT(DISTINCT jc.name) as job_cards_worked,
            GROUP_CONCAT(DISTINCT jc.work_order ORDER BY jctl.from_time) as work_orders,
            GROUP_CONCAT(DISTINCT jc.operation ORDER BY jctl.from_time) as operations,
            GROUP_CONCAT(DISTINCT jc.workstation ORDER BY jctl.from_time) as workstations
        FROM 
            `tabJob Card` jc
        INNER JOIN 
            `tabJob Card Time Log` jctl ON jc.name = jctl.parent
        LEFT JOIN
            `tabEmployee` emp ON jctl.employee = emp.name
        WHERE 
            jc.docstatus = 1 
            AND jctl.completed_qty > 0 
            AND jctl.employee IS NOT NULL {where_clause}
        GROUP BY 
            jctl.employee, DATE(jctl.from_time)
        ORDER BY 
            jctl.employee, attendance_date
    """

    job_card_logs = frappe.db.sql(query, values, as_dict=1)
    attendance_records = []

    start_time = frappe.utils.get_time("08:00:00")
    end_time = frappe.utils.get_time("17:00:00")

    for record in job_card_logs:
        # تبدیل رشته زمان به time
        in_time = frappe.utils.get_time(record.in_time) if record.in_time else None
        out_time = frappe.utils.get_time(record.out_time) if record.out_time else None

        late_entry = 0
        early_exit = 0

        if in_time and in_time > start_time:
            in_dt = frappe.utils.get_datetime(f"{record.attendance_date} {in_time}")
            start_dt = frappe.utils.get_datetime(f"{record.attendance_date} 08:00:00")
            late_entry = max(0, (in_dt - start_dt).total_seconds() / 60)

        if out_time and out_time < end_time:
            out_dt = frappe.utils.get_datetime(f"{record.attendance_date} {out_time}")
            end_dt = frappe.utils.get_datetime(f"{record.attendance_date} 17:00:00")
            early_exit = max(0, (end_dt - out_dt).total_seconds() / 60)

        status = "Present"
        if record.total_hours < 2:
            status = "Half Day"
        elif record.total_hours < 4:
            status = "Half Day"

        attendance_records.append({
            'employee': record.employee,
            'employee_name': record.employee_name,
            'attendance_date': record.attendance_date,
            'status': status,
            'in_time': in_time,
            'out_time': out_time,
            'late_entry': late_entry,
            'early_exit': early_exit,
            'total_hours': record.total_hours,
            'job_cards_worked': record.job_cards_worked,
            'work_orders': record.work_orders,
            'operations': record.operations,
            'workstations': record.workstations
        })

    return attendance_records

def get_absent_employees(filters):
    """پیدا کردن کارمندانی که Job Card ندارند (غایب هستند)"""
    import frappe
    from datetime import datetime, timedelta
    
    # گرفتن لیست همه کارمندان فعال
    active_employees = frappe.db.sql("""
        SELECT name, employee_name 
        FROM `tabEmployee` 
        WHERE status = 'Active'
    """)

    # گرفتن کارمندانی که Job Card دارند
    conditions = []
    values = {}
    
    if filters.get('from_date'):
        conditions.append("DATE(jctl.from_time) >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("DATE(jctl.from_time) <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    employees_with_job_cards = frappe.db.sql(f"""
        SELECT DISTINCT jctl.employee, DATE(jctl.from_time) as work_date
        FROM `tabJob Card` jc
        INNER JOIN `tabJob Card Time Log` jctl ON jc.name = jctl.parent
        WHERE jc.docstatus = 1 
        AND jctl.completed_qty > 0 
        AND jctl.employee IS NOT NULL {where_clause}
    """, values, as_dict=1)
    
    # تبدیل به set برای جستجوی سریع‌تر
    worked_combinations = {(emp.employee, emp.work_date) for emp in employees_with_job_cards}
    
    # پیدا کردن کارمندان غایب
    absent_records = []
    
    from_date = datetime.strptime(filters.get('from_date', str(datetime.now().date())), '%Y-%m-%d').date()
    to_date = datetime.strptime(filters.get('to_date', str(datetime.now().date())), '%Y-%m-%d').date()
    
    current_date = from_date
    while current_date <= to_date:
        # چک کردن اینکه آیا روز کاری هست یا نه (شنبه تا پنج‌شنبه)
        if current_date.weekday() < 5:  # 0=دوشنبه، 4=جمعه، 5=شنبه
            for employee in active_employees:
                if filters.get('employee') and employee.name != filters.employee:
                    continue
                    
                if (employee.name, current_date) not in worked_combinations:
                    absent_records.append({
                        'employee': employee.name,
                        'employee_name': employee.employee_name,
                        'attendance_date': current_date,
                        'status': 'Absent',
                        'in_time': None,
                        'out_time': None,
                        'late_entry': 0,
                        'early_exit': 0,
                        'total_hours': 0,
                        'job_cards_worked': 0,
                        'work_orders': None,
                        'operations': None,
                        'workstations': None
                    })
        
        current_date += timedelta(days=1)
    
    return absent_records


def get_work_order_productivity(filters):
    """گرفتن گزارش بهره‌وری کارت کارها"""
    import frappe
    
    conditions = []
    values = {}
    
    if filters.get('employee'):
        conditions.append("jctl.employee = %(employee)s")
        values['employee'] = filters.employee
    
    if filters.get('from_date'):
        conditions.append("DATE(jctl.from_time) >= %(from_date)s")
        values['from_date'] = filters.from_date
    
    if filters.get('to_date'):
        conditions.append("DATE(jctl.from_time) <= %(to_date)s")
        values['to_date'] = filters.to_date
    
    if filters.get('workstation'):
        conditions.append("jc.workstation = %(workstation)s")
        values['workstation'] = filters.workstation
    
    where_clause = " AND " + " AND ".join(conditions) if conditions else ""
    
    query = f"""
    SELECT 
        jc.work_order,
        MAX(wo.production_item) AS item_code,
        MAX(wo.item_name) AS item_name,
        jc.operation,
        jc.workstation,
        jctl.employee,
        MAX(emp.employee_name) AS employee_name,
        DATE(jctl.from_time) as work_date,
        SUM(jctl.completed_qty) as completed_qty,
        SUM(jctl.time_in_mins)/60 as hours_spent,
        AVG(jctl.completed_qty / (jctl.time_in_mins/60)) as productivity_per_hour,
        MAX(wo.qty) as target_qty,
        SUM(wop.time_in_mins)/60 as expected_hours
    FROM 
        `tabJob Card` jc
    INNER JOIN 
        `tabJob Card Time Log` jctl ON jc.name = jctl.parent
    LEFT JOIN 
        `tabWork Order` wo ON jc.work_order = wo.name
    LEFT JOIN
        `tabEmployee` emp ON jctl.employee = emp.name
    LEFT JOIN
        `tabWork Order Operation` wop 
            ON wop.parent = jc.work_order AND wop.operation = jc.operation
    WHERE 
        jc.docstatus = 1 
        AND jctl.completed_qty > 0 
        AND jctl.employee IS NOT NULL
        {where_clause}
    GROUP BY 
        jc.work_order, jc.operation, jc.workstation, jctl.employee, DATE(jctl.from_time)
    ORDER BY 
        work_date DESC, jctl.employee, jc.work_order;
    """
    return frappe.db.sql(query, values, as_dict=1)


def get_complete_attendance_report(filters):
    """گزارش کامل حضور و غیاب (ترکیب حاضرین و غایبین)"""
    present_employees = get_employee_attendance(filters)
    absent_employees = get_absent_employees(filters)
    
    # ترکیب دو لیست
    complete_report = present_employees + absent_employees
    
    # مرتب سازی بر اساس نام کارمند و تاریخ
    complete_report.sort(key=lambda x: (x['employee'], x['attendance_date']))
    
    return complete_report

def calculate_productivity_scores(job_cards_data):
    """محاسبه امتیازات بهره‌وری"""
    productivity_scores = {}
    
    for jc in job_cards_data:
        employee = jc.get('employee')
        if not employee:
            continue
            
        if employee not in productivity_scores:
            productivity_scores[employee] = {
                'employee': employee,
                'employee_id': employee,
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
        productivity_scores[employee]['total_output'] += flt(jc.get('completed_qty', 0))
    
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
    completed_qty = flt(job_card.get('completed_qty', 0))
    standard_time = flt(job_card.get('standard_time', 0)) or 60  # پیش‌فرض 60 دقیقه
    actual_time = flt(job_card.get('actual_time_mins', 0)) or standard_time
    
    if completed_qty <= 0:
        return 0
    
    # ضریب اولویت
    priority_factors = {
        'High': 1.5,
        'Medium': 1.0,
        'Low': 0.8
    }
    priority_factor = priority_factors.get(job_card.get('work_order_priority', 'Medium'), 1.0)
    
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

@frappe.whitelist()
def get_workstation_efficiency(filters=None):
    import json
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}

    data = frappe.db.sql("""
        SELECT 
            jc.workstation,
            SUM(jc.time_required) as total_required,
            SUM(tl.time_in_mins) as total_actual
        FROM `tabJob Card` jc
        JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        WHERE jc.docstatus = 1
        {date_filter}
        GROUP BY jc.workstation
    """.format(
        date_filter=get_date_filter_sql(filters, "jc.creation")
    ), as_dict=True)

    # محاسبه بهره‌وری
    for row in data:
        if row.total_actual and row.total_actual > 0:
            row['efficiency'] = round((row.total_required / row.total_actual) * 100, 2)
        else:
            row['efficiency'] = 0

    return data



@frappe.whitelist()
def get_time_analysis_data(filters=None):
    import json
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}

    # تعریف بازه‌های ساعتی
    time_ranges = [
        (6, 8),
        (8, 10),
        (10, 12),
        (12, 14),
        (14, 16),
        (16, 18)
    ]

    results = []
    for start, end in time_ranges:
        data = frappe.db.sql("""
            SELECT 
                SUM(jc.time_required) as total_required,
                SUM(tl.time_in_mins) as total_actual
            FROM `tabJob Card` jc
            JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE jc.docstatus = 1
              AND HOUR(jc.creation) >= %s
              AND HOUR(jc.creation) < %s
        """, (start, end), as_dict=True)

        total_required = data[0].total_required or 0
        total_actual = data[0].total_actual or 0

        efficiency = round((total_required / total_actual) * 100, 2) if total_actual > 0 else 0
        results.append(efficiency)

    labels = ['6-8', '8-10', '10-12', '12-14', '14-16', '16-18']
    return {'labels': labels, 'values': results}

@frappe.whitelist()
def calculate_quality_score(employee, job_cards_data):
    """محاسبه امتیاز کیفیت"""
    # موقت - در آینده باید از Quality Inspection گرفته شود
    return 95  # درصد کیفیت پیش‌فرض

@frappe.whitelist()

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
        return {
            'total_employees': 0,
            'average_efficiency': 0,
            'top_performer': None,
            'rankings': []
        }
    
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
        SELECT DISTINCT jctl.employee as value, jctl.employee as label
        FROM `tabJob Card Time Log` jctl
        WHERE jctl.employee IS NOT NULL AND jctl.employee != ''
        ORDER BY jctl.employee
    """, as_dict=1)
    
@frappe.whitelist()
def get_workstation_list():
    """لیست ایستگاه‌های کار برای فیلتر"""
    return frappe.db.sql("""
        SELECT name as value, workstation_name as label
        FROM `tabWorkstation`
        ORDER BY workstation_name
    """, as_dict=1)
    
    

@frappe.whitelist()
def get_realtime_employee_status():
    """دریافت وضعیت لحظه‌ای کارمندان"""
    
    current_time = frappe.utils.now_datetime()
    today = frappe.utils.getdate()
    
    # دریافت همه کارمندان فعال
    employees = frappe.get_all("Employee", 
        filters={"status": "Active"}, 
        fields=["name", "employee_name", "image", "department", "designation"]
    )
    
    employee_status_list = []
    status_summary = {"working": 0, "idle": 0, "on_break": 0, "offline": 0}
    
    for emp in employees:
        # بررسی تمام کارهای امروز کارمند (نه فقط فعال!)
        today_jobs = frappe.db.sql("""
            SELECT jc.name as job_card, jc.workstation, jc.operation,
                tl.from_time, tl.to_time, tl.employee,
                tl.completed_qty, jc.status,
                CASE 
                    WHEN tl.to_time IS NULL THEN TIMESTAMPDIFF(MINUTE, tl.from_time, %s)
                    ELSE TIMESTAMPDIFF(MINUTE, tl.from_time, tl.to_time)
                END as duration_mins,
                CASE 
                    WHEN tl.to_time IS NULL THEN 'ongoing'
                    ELSE 'completed'
                END as job_status
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE tl.employee = %s 
            AND jc.docstatus = 1
            AND DATE(tl.from_time) = %s
            AND tl.from_time IS NOT NULL
            ORDER BY tl.from_time DESC
        """, (current_time, emp.name, today), as_dict=True)
        
        # تعیین وضعیت کارمند
        employee_status = determine_employee_status_improved(emp, today_jobs, current_time, today)
        employee_status_list.append(employee_status)
        
        # بروزرسانی خلاصه وضعیت
        status_key = employee_status.get("status")
        if status_key:
            status_summary[status_key] = status_summary.get(status_key, 0) + 1
    
    # دریافت وضعیت ایستگاه‌های کاری
    workstations = get_workstation_status_enhanced()
    
    return {
        "employees": employee_status_list,
        "status_summary": status_summary,
        "workstations": workstations,
        "last_update": current_time
    }


def determine_employee_status_improved(employee, today_jobs, current_time, today):
    """تعیین وضعیت کارمند با منطق بهبود یافته"""
    
    status = "offline"
    current_job = None
    idle_duration = None
    
    # نام کارمند
    employee_name = employee.get("employee_name") or employee.get("name")
    
    # اگر امروز کار کرده (حداقل یک Job Card داره)
    if today_jobs and len(today_jobs) > 0:
        # آخرین کار رو بگیر
        latest_job = today_jobs[0]
        
        current_job = {
            "job_card": latest_job.get("job_card"),
            "workstation": latest_job.get("workstation"),
            "operation": latest_job.get("operation"),
            "from_time": latest_job.get("from_time"),
            "to_time": latest_job.get("to_time"),
            "status": latest_job.get("status"),
            "completed_qty": latest_job.get("completed_qty", 0),
            "duration": f"{latest_job.get('duration_mins', 0)} دقیقه"
        }
        
        # اگر آخرین کار هنوز تموم نشده (to_time خالیه)
        if latest_job.get("job_status") == "ongoing":
            duration_mins = latest_job.get("duration_mins", 0)
            if duration_mins <= 15:
                status = "working"  # تازه شروع کرده
            else:
                status = "idle"     # خیلی وقته شروع کرده اما تموم نکرده
                idle_duration = f"{duration_mins} دقیقه"
        else:
            # آخرین کار تموم شده، چک کن چقدر وقت پیش
            if latest_job.get("to_time"):
                end_time = frappe.utils.get_datetime(latest_job.get("to_time"))
                minutes_since_end = time_diff_in_minutes(current_time, end_time)
                
                if minutes_since_end <= 15:
                    status = "working"  # تازه کار تمام کرده
                elif minutes_since_end <= 60:
                    status = "idle"     # کمی وقت پیش کار تمام کرده
                    idle_duration = f"{minutes_since_end} دقیقه پیش"
                else:
                    status = "offline"  # خیلی وقت پیش کار تمام کرده
            else:
                # نباید اینجا برسه اما احتیاط
                status = "idle"
        
        # اگر کارمند امروز کار کرده، حداقل باید idle باشه نه offline
        if status == "offline" and len(today_jobs) > 0:
            status = "idle"
            # محاسبه آخرین فعالیت
            last_activity = max([job.get("to_time") or job.get("from_time") for job in today_jobs])
            if last_activity:
                last_time = frappe.utils.get_datetime(last_activity)
                minutes_ago = time_diff_in_minutes(current_time, last_time)
                idle_duration = f"{minutes_ago} دقیقه پیش"
    else:
        # هیچ کار امروز نکرده - offline
        status = "offline"
    
    return {
        "employee_name": employee_name,
        "employee_id": employee["name"],
        "image": employee.get("image"),
        "department": employee.get("department"),
        "designation": employee.get("designation"),
        "status": status,
        "current_job": current_job,
        "idle_duration": idle_duration
    }



'''
@frappe.whitelist()
def get_workstation_status():
    """دریافت وضعیت ایستگاه‌های کاری"""
    
    workstations = frappe.get_all("Workstation", 
        fields=["name", "workstation_name", "production_capacity"]
    )
    
    workstation_status = []
    
    for ws in workstations:
        # کارمندان فعال در ایستگاه
        active_employees = frappe.db.sql("""
            SELECT DISTINCT e.employee_name, e.name as employee_id
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            JOIN `tabEmployee` e ON e.name = tl.employee
            WHERE jc.workstation = %s 
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND tl.from_time IS NOT NULL
            AND (tl.to_time IS NULL OR tl.to_time > NOW())
        """, (ws.name,), as_dict=True)
        
        # کارهای فعال
        active_jobs_count = frappe.db.sql("""
            SELECT COUNT(DISTINCT jc.name)
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE jc.workstation = %s
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND tl.from_time IS NOT NULL
            AND (tl.to_time IS NULL OR tl.to_time > NOW())
        """, (ws.name,))[0][0]

        active_jobs = active_jobs_count
        # صف انتظار
        queue_length = frappe.db.count("Job Card", {
            "workstation": ws.name,
            "docstatus": 1,
            "status": "Open"
        })
        
        # محاسبه درصد استفاده
        max_capacity = ws.production_capacity or 1
        utilization = min(100, (len(active_employees) / max_capacity) * 100)
        
        workstation_status.append({
            "name": ws.workstation_name or ws.name,
            "active_employees": len(active_employees),
            "active_jobs": active_jobs,
            "queue_length": queue_length,
            "utilization": round(utilization, 1),
            "employees": active_employees
        })
    
    return workstation_status


@frappe.whitelist()
def get_realtime_employee_status():
    """دریافت وضعیت لحظه‌ای کارمندان"""
    
    current_time = now_datetime()
    today = getdate()
    
    # دریافت همه کارمندان فعال
    employees = frappe.get_all("Employee", 
        filters={"status": "Active"}, 
        fields=["name", "employee_name", "image", "department", "designation"]
    )
    
    employee_status_list = []
    status_summary = {"working": 0, "idle": 0, "on_break": 0, "offline": 0}
    
    for emp in employees:
        # بررسی Job Card فعال
        active_job = frappe.db.sql("""
            SELECT jc.name as job_card, jc.workstation, jc.operation,
                tl.from_time, tl.to_time, tl.employee,
                TIMESTAMPDIFF(MINUTE, tl.from_time, %s) as duration_mins,
                jc.status
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE tl.employee = %s 
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND tl.from_time IS NOT NULL
            AND (tl.to_time IS NULL OR tl.to_time > %s)
            ORDER BY tl.from_time DESC
            LIMIT 1
        """, (current_time, emp.name, current_time), as_dict=True)
        
        # بررسی Employee Checkin برای تشخیص حضور
        last_checkin = frappe.db.sql("""
            SELECT log_type, time, 
                   TIMESTAMPDIFF(MINUTE, time, %s) as minutes_ago
            FROM `tabEmployee Checkin`
            WHERE employee = %s AND DATE(time) = %s
            ORDER BY time DESC
            LIMIT 1
        """, (current_time, emp.name, today), as_dict=True)
        
        # تعیین وضعیت کارمند
        employee_status = determine_employee_status(emp, active_job, last_checkin, current_time)
        employee_status_list.append(employee_status)
        
        # بروزرسانی خلاصه وضعیت
        status_summary[employee_status["status"]] += 1
    
    # دریافت وضعیت ایستگاه‌های کاری
    workstations = get_workstation_status()
    
    return {
        "employees": employee_status_list,
        "status_summary": status_summary,
        "workstations": workstations,
        "last_update": current_time
    }

def determine_employee_status(employee, active_job, last_checkin, current_time):
    """تعیین وضعیت کارمند بر اساس داده‌های موجود"""
    
    status = "offline"
    current_job = None
    idle_duration = None
    
    # اگر Job Card فعال دارد
    if active_job:
        job_info = active_job[0]
        current_job = {
            "job_card": job_info.job_card,
            "workstation": job_info.workstation,
            "operation": job_info.operation,
            "duration": f"{job_info.duration_mins} دقیقه" if job_info.duration_mins else "نامشخص",
            "from_time": job_info.from_time,
            "to_time": job_info.to_time,
            "status": job_info.status
        }
        
        # اگر کمتر از 15 دقیقه است که کار شروع شده
        if job_info.duration_mins and job_info.duration_mins <= 15:
            status = "working"
        # اگر بیشتر از 15 دقیقه بدون فعالیت
        elif job_info.duration_mins and job_info.duration_mins > 15:
            # بررسی آخرین فعالیت در Job Card
            last_activity = frappe.db.sql("""
                SELECT MAX(tl.modified) as last_modified
                FROM `tabJob Card Time Log` tl
                WHERE tl.parent = %s AND tl.employee = %s
            """, (job_info.job_card, employee.name), as_dict=True)


            if last_activity and last_activity[0].last_modified:
                minutes_since_activity = time_diff_in_minutes(current_time, last_activity[0].last_modified)
                if minutes_since_activity > 15:
                    status = "idle"
                    idle_duration = f"{minutes_since_activity} دقیقه"
                else:
                    status = "working"
            else:
                status = "idle"
                idle_duration = f"{job_info.duration_mins} دقیقه"
    
    # بررسی حضور و غیاب
    elif last_checkin:
        checkin_info = last_checkin[0]
        
        # اگر چک‌این کرده ولی Job Card فعال ندارد
        if checkin_info.log_type == "IN" and checkin_info.minutes_ago < 480:  # کمتر از 8 ساعت
            # بررسی Break Entry
            on_break = frappe.db.get_value("Break Entry", {
                "employee": employee.name,
                "break_start_time": [">=", add_to_date(current_time, hours=-2)],
                "break_end_time": ["is", "not set"]
            })
            
            if on_break:
                status = "break"
            else:
                status = "idle"
                idle_duration = f"{checkin_info.minutes_ago} دقیقه"
        else:
            status = "offline"
    
    return {
        "name": employee.employee_name or employee.name,
        "employee_id": employee.name,
        "image": employee.image,
        "department": employee.department,
        "designation": employee.designation,
        "status": status,
        "current_job": current_job,
        "idle_duration": idle_duration
    }


def get_workstation_status():
    """دریافت وضعیت ایستگاه‌های کاری"""
    
    workstations = frappe.get_all("Workstation", 
        fields=["name", "workstation_name", "production_capacity"]
    )
    
    workstation_status = []
    
    for ws in workstations:
        # کارمندان فعال در ایستگاه
        active_employees = frappe.db.sql("""
            SELECT DISTINCT e.employee_name, e.name as employee_id
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            JOIN `tabEmployee` e ON e.name = tl.employee
            WHERE jc.workstation = %s 
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND tl.from_time IS NOT NULL
            AND (tl.to_time IS NULL OR tl.to_time > NOW())
        """, (ws.name,), as_dict=True)
        
        # کارهای فعال
        active_jobs_count = frappe.db.sql("""
            SELECT COUNT(DISTINCT jc.name)
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE jc.workstation = %s
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND tl.from_time IS NOT NULL
            AND (tl.to_time IS NULL OR tl.to_time > NOW())
        """, (ws.name,))[0][0]

        active_jobs = active_jobs_count
        # صف انتظار
        queue_length = frappe.db.count("Job Card", {
            "workstation": ws.name,
            "docstatus": 1,
            "status": "Open"
        })
        
        # محاسبه درصد استفاده
        max_capacity = ws.production_capacity or 1
        utilization = min(100, (len(active_employees) / max_capacity) * 100)
        
        workstation_status.append({
            "name": ws.workstation_name or ws.name,
            "active_employees": len(active_employees),
            "active_jobs": active_jobs,
            "queue_length": queue_length,
            "utilization": round(utilization, 1),
            "employees": active_employees
        })
    
    return workstation_status
'''


def time_diff_in_minutes(end_time, start_time):
    """محاسبه تفاوت زمان به دقیقه"""
    if isinstance(end_time, str):
        end_time = get_datetime(end_time)
    if isinstance(start_time, str):
        start_time = get_datetime(start_time)
    
    diff = end_time - start_time
    return int(diff.total_seconds() / 60)


@frappe.whitelist()
def get_enhanced_productivity_data(filters=None):
    """دریافت داده‌های کامل بهره‌وری برای تحلیل‌ها"""
    
    if not filters:
        filters = {}
    elif isinstance(filters, str):
        import json
        filters = json.loads(filters)
        
    base_data = get_employee_productivity_data(filters)
    
    # اضافه کردن داده‌های تحلیلی
    base_data.update({
        "time_analysis": get_time_analysis_data(filters),
        "weekly_analysis": get_weekly_analysis_data(filters),
        "quality_metrics": get_quality_metrics_data(filters),
        "workstation_performance": get_workstation_performance_data(filters),
        "productivity_distribution": get_productivity_distribution_data(filters)
    })
    
    return base_data

# file: your_app/erpnext/manufacturing/page/orders/orders.py

import frappe
from frappe import _

@frappe.whitelist()
def get_productivity_scores(filters=None):
    """
    محاسبه بهره‌وری کارمندان بر اساس کارت‌های کار
    خروجی: {'employee': ..., 'efficiency_score': ...}
    """
    import json
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}

    query = """
        SELECT 
            tl.employee,
            SUM(jc.time_required) / SUM(tl.time_in_mins) * 100 as efficiency_score
        FROM `tabJob Card` jc
        JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        WHERE jc.docstatus = 1
        GROUP BY tl.employee
    """
    data = frappe.db.sql(query, as_dict=True)
    return data


@frappe.whitelist()
def get_weekly_analysis_data(filters=None):
    """
    محاسبه بهره‌وری و میانگین ساعات کارکرد روزهای هفته بر اساس کارت‌های کار
    خروجی: {'labels': [...], 'efficiency': [...], 'avg_hours': [...]}
    """
    import json
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}

    # روزهای هفته (شنبه تا جمعه)
    weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
    efficiency_results = []
    avg_hours_results = []

    for i in range(7):
        data = frappe.db.sql("""
            SELECT 
                SUM(jc.time_required) as total_required,
                SUM(tl.time_in_mins) as total_actual,
                COUNT(DISTINCT tl.employee) as num_employees
            FROM `tabJob Card` jc
            JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE jc.docstatus = 1
              AND WEEKDAY(jc.creation) = %s
        """, (i,), as_dict=True)

        total_required = data[0].total_required or 0
        total_actual = data[0].total_actual or 0
        num_employees = data[0].num_employees or 1

        # میانگین بهره‌وری
        efficiency = round((total_required / total_actual) * 100, 2) if total_actual > 0 else 0
        efficiency_results.append(efficiency)

        # میانگین ساعت کارکرد در روز
        avg_hours = round((total_actual / 60) / num_employees, 2) if num_employees > 0 else 0
        avg_hours_results.append(avg_hours)

    return {
        'labels': weekdays,
        'efficiency': efficiency_results,
        'avg_hours': avg_hours_results
    }



def get_quality_metrics_data(filters):
    """شاخص‌های کیفیت"""
    
    # ابتدا ستون‌های موجود در Quality Inspection را بررسی کنید
    # معمولاً ستون‌های صحیح عبارتند از:
    # - inspected_by
    # - sample_size  
    # - status ('Accepted', 'Rejected', 'Submitted')
    
    quality_data = frappe.db.sql("""
        SELECT 
            tl.employee,
            AVG(
                CASE 
                    WHEN qi.status = 'Accepted' THEN 100
                    WHEN qi.status = 'Rejected' THEN 0
                    ELSE 95  -- فرض کیفیت پایه برای وضعیت‌های دیگر
                END
            ) as quality_score,
            COUNT(qi.name) as total_inspections
        FROM `tabJob Card` jc
        JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        LEFT JOIN `tabQuality Inspection` qi ON qi.reference_name = jc.name
        WHERE jc.docstatus = 1
        {date_filter}
        {employee_filter}
        GROUP BY tl.employee
    """.format(
        date_filter=get_date_filter_sql(filters, "jc.creation"),
        employee_filter=f"AND jc.employee = '{filters.get('employee')}'" if filters.get('employee') else ""
    ), as_dict=True)
    
    return quality_data


def get_workstation_performance_data(filters):
    """عملکرد ایستگاه‌های کاری"""
    
    workstation_data = frappe.db.sql("""
        SELECT 
            jc.workstation,
            COUNT(jc.name) as total_jobs,
            AVG(
                CASE 
                    WHEN jc.total_time_in_mins > 0 
                    THEN (jc.total_completed_qty / jc.for_quantity) * 100
                    ELSE 0 
                END
            ) as avg_efficiency,
            AVG(jc.total_time_in_mins) as avg_time,
            SUM(jc.total_completed_qty) as total_output
        FROM `tabJob Card` jc
        WHERE jc.docstatus = 1
        {date_filter}
        {workstation_filter}
        GROUP BY jc.workstation
        ORDER BY avg_efficiency DESC
    """.format(
        date_filter=get_date_filter_sql(filters, "jc.creation"),
        workstation_filter=f"AND jc.workstation = '{filters.get('workstation')}'" if filters.get('workstation') else ""
    ), as_dict=True)
    
    return workstation_data

def get_productivity_distribution_data(filters):
    """توزیع سطح عملکرد با جلوگیری از NaN و محاسبه بهره‌وری واقعی"""
    
    import frappe

    # بررسی و تبدیل filters اگر رشته بود
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)
    if not filters:
        filters = {}

    # تابع کمکی برای فیلتر تاریخ
    def get_date_filter_sql(filters, field_name):
        conditions = []
        if filters.get("from_date"):
            conditions.append(f"{field_name} >= '{filters['from_date']}'")
        if filters.get("to_date"):
            conditions.append(f"{field_name} <= '{filters['to_date']}'")
        if conditions:
            return " AND " + " AND ".join(conditions)
        return ""

    date_filter = get_date_filter_sql(filters, "jc.creation")
    employee_filter = f"AND jc.employee = '{filters.get('employee')}'" if filters.get("employee") else ""

    # استخراج داده‌ها از Job Card
    productivity_levels = frappe.db.sql(f"""
        SELECT 
            CASE 
                WHEN avg_efficiency >= 90 THEN 'عالی (90%+)'
                WHEN avg_efficiency >= 70 THEN 'خوب (70-90%)'
                WHEN avg_efficiency >= 50 THEN 'متوسط (50-70%)'
                ELSE 'ضعیف (<50%)'
            END as performance_level,
            COUNT(*) as employee_count
        FROM (
            SELECT 
                tl.employee,
                SUM(jc.time_required) / NULLIF(SUM(tl.time_in_mins), 0) * 100 as avg_efficiency
            FROM `tabJob Card` jc
            JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE jc.docstatus = 1
              AND tl.completed_qty > 0
              {date_filter}
              {employee_filter}
            GROUP BY tl.employee
        ) as employee_efficiency
        GROUP BY performance_level
    """, as_dict=True)
    
    # اگر خروجی خالی بود، default بساز
    if not productivity_levels:
        productivity_levels = [
            {'performance_level': 'عالی (90%+)', 'employee_count': 0},
            {'performance_level': 'خوب (70-90%)', 'employee_count': 0},
            {'performance_level': 'متوسط (50-70%)', 'employee_count': 0},
            {'performance_level': 'ضعیف (<50%)', 'employee_count': 0},
        ]
    
    # مطمئن شدن از اینکه employee_count عددی است
    for lvl in productivity_levels:
        if lvl.get('employee_count') is None:
            lvl['employee_count'] = 0
    
    return productivity_levels



# erpnext/manufacturing/page/orders/orders.py

def get_workstation_status_enhanced():
    """دریافت وضعیت بهبود یافته ایستگاه‌های کاری"""
    
    today = frappe.utils.getdate()
    current_time = frappe.utils.now_datetime()
    
    workstations = frappe.get_all("Workstation", 
        fields=["name", "workstation_name", "production_capacity"]
    )
    
    workstation_status = []
    
    for ws in workstations:
        # کارمندان فعال در ایستگاه (امروز کار کرده‌اند)
        active_employees = frappe.db.sql("""
            SELECT DISTINCT 
                e.employee_name, 
                e.name as employee_id,
                e.department,
                MIN(tl.from_time) as start_time,
                MAX(CASE WHEN tl.to_time IS NOT NULL THEN tl.to_time ELSE %s END) as end_time,
                COUNT(DISTINCT jc.name) as jobs_count,
                SUM(tl.completed_qty) as total_completed
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            JOIN `tabEmployee` e ON e.name = tl.employee
            WHERE jc.workstation = %s 
            AND jc.docstatus = 1
            AND DATE(tl.from_time) = %s
            AND tl.completed_qty > 0
            GROUP BY e.name, e.employee_name, e.department
            ORDER BY start_time
        """, (current_time, ws.name, today), as_dict=True)
        
        # کارهای فعال (در حال انجام)
        active_jobs = frappe.db.sql("""
            SELECT 
                jc.name as job_card,
                jc.operation,
                jc.work_order,
                tl.employee,
                e.employee_name,
                tl.from_time,
                tl.to_time
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            JOIN `tabEmployee` e ON e.name = tl.employee
            WHERE jc.workstation = %s
            AND jc.docstatus = 1
            AND jc.status IN ('Work In Progress', 'In Process')
            AND DATE(tl.from_time) = %s
            AND tl.to_time IS NULL
        """, (ws.name, today), as_dict=True)
        
        # صف انتظار
        queue_jobs = frappe.db.sql("""
            SELECT 
                name as job_card,
                operation,
                work_order,
                expected_start_date
            FROM `tabJob Card`
            WHERE workstation = %s
            AND docstatus = 1
            AND status = 'Open'
            ORDER BY expected_start_date
        """, (ws.name,), as_dict=True)
        
        # محاسبه درصد استفاده
        max_capacity = ws.production_capacity or 1
        current_active = len([emp for emp in active_employees if not emp.get('end_time') or emp.get('end_time') > current_time])
        utilization = min(100, (current_active / max_capacity) * 100)
        
        # تعیین وضعیت ایستگاه
        if len(active_jobs) > 0:
            station_status = "active"
        elif len(active_employees) > 0:
            station_status = "recently_active"
        else:
            station_status = "idle"
        
        workstation_status.append({
            "name": ws.workstation_name or ws.name,
            "workstation_id": ws.name,
            "status": station_status,
            "active_employees": len(active_employees),
            "current_active": current_active,
            "active_jobs": len(active_jobs),
            "queue_length": len(queue_jobs),
            "utilization": round(utilization, 1),
            "employees": active_employees,
            "active_job_details": active_jobs,
            "queue_details": queue_jobs[:5],  # فقط 5 کار اول صف
            "total_work_hours": sum([emp.total_hours or 0 for emp in employees_worked]),
            "total_items_produced": sum([emp.total_completed or 0 for emp in employees_worked]),
            "workstation_efficiency": round((sum([emp.total_hours or 0 for emp in employees_worked]) / 8) * 100, 1) if len(employees_worked) > 0 else 0
        })
    
    return workstation_status



"""
برگردوندن وضعیت کارمندان بخش تولید بر اساس Job Card امروز
"""

@frappe.whitelist()
def get_employee_daily_details(employee_id, date):
    """دریافت جزئیات روزانه کارمند"""
    
    target_date = frappe.utils.getdate(date) if isinstance(date, str) else date
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    # تمام کارهای انجام شده در آن روز
    jobs_detail = frappe.db.sql("""
        SELECT 
            jc.name as job_card,
            jc.work_order,
            jc.operation,
            jc.workstation,
            tl.from_time,
            tl.to_time,
            tl.completed_qty,
            tl.time_in_mins,
            jc.status
        FROM `tabJob Card` jc
        INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        WHERE tl.employee = %(employee_id)s 
        AND DATE(tl.from_time) = %(target_date)s
        AND jc.docstatus = 1
        AND tl.completed_qty > 0
        ORDER BY tl.from_time
    """, {
        'employee_id': employee_id,
        'target_date': target_date_str
    }, as_dict=True)
    
    if not jobs_detail:
        return {
            "employee_id": employee_id,
            "date": target_date_str,
            "total_hours": 0,
            "jobs_count": 0,
            "first_in": None,
            "last_out": None,
            "jobs": [],
            "status": "absent"
        }
    
    # محاسبات کلی
    total_minutes = sum(job.get("time_in_mins", 0) for job in jobs_detail)
    total_hours = round(total_minutes / 60, 2)
    
    first_in = min(job.get("from_time") for job in jobs_detail if job.get("from_time"))
    last_out = max(job.get("to_time") for job in jobs_detail if job.get("to_time"))
    
    productivity_data = calculate_employee_productivity(employee_id, target_date_str)
    return {
        "productivity": productivity_data,
        "employee_id": employee_id,
        "date": target_date_str,
        "total_hours": total_hours,
        "jobs_count": len(jobs_detail),
        "first_in": first_in,
        "last_out": last_out,
        "jobs": jobs_detail,
        "status": "present" if total_hours > 0 else "absent"
    }


@frappe.whitelist()
def get_manufacturing_employees_status(filters=None):
    """دریافت وضعیت کارمندان با پشتیبانی از فیلتر تاریخ"""
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    if not filters:
        filters = {}
    
    # تعیین تاریخ هدف
    target_date = filters.get('date', date.today().strftime("%Y-%m-%d"))
    if isinstance(target_date, str):
        target_date = frappe.utils.getdate(target_date)
    
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    # دریافت کارمندان فعال
    manufacturing_employees = frappe.get_all("Employee",
        filters={"status": "Active", "department": "تولید"},
        fields=["name", "employee_name", "user_id", "image", "department", "designation"]
    )
    
    employee_status = []
    
    for emp in manufacturing_employees:
        # دریافت Job Card های کارمند برای آن روز
        employee_job_cards = frappe.db.sql("""
            SELECT DISTINCT
                jc.name as job_card,
                jc.status,
                jc.operation,
                jc.workstation,
                jc.work_order,
                tl.from_time,
                tl.to_time,
                tl.time_in_mins,
                tl.completed_qty
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            WHERE tl.employee = %(employee)s
            AND jc.docstatus < 2
            AND DATE(tl.from_time) = %(target_date)s
            ORDER BY tl.from_time DESC
        """, {
            'employee': emp.name,
            'target_date': target_date_str
        }, as_dict=True)
        
        # تعیین وضعیت کارمند
        status = "offline"
        current_job = None
        idle_duration = None
        
        if employee_job_cards:
            # گرفتن آخرین فعالیت
            latest_job = employee_job_cards[0]
            
            if not latest_job.to_time:
                # در حال کار
                status = "working"
                
                # محاسبه مدت زمان از شروع کار
                start_time = frappe.utils.get_datetime(latest_job.from_time)
                now = frappe.utils.now_datetime()
                duration_mins = int((now - start_time).total_seconds() / 60)
                
                current_job = {
                    "job_card": latest_job.job_card,
                    "operation": latest_job.operation,
                    "workstation": latest_job.workstation,
                    "work_order": latest_job.work_order,
                    "duration": f"{duration_mins} دقیقه",
                    "from_time": latest_job.from_time,
                    "to_time": None,
                    "status": latest_job.status
                }
                
                # اگر بیش از 15 دقیقه بدون حرکت باشه، بیکار محسوب می‌شه
                if duration_mins > 5:
                    # چک کردن آخرین فعالیت (modified time)
                    last_activity = frappe.db.get_value("Job Card Time Log", {
                        "parent": latest_job.job_card,
                        "employee": emp.name
                    }, "modified")
                    
                    if last_activity:
                        last_activity_time = frappe.utils.get_datetime(last_activity)
                        idle_mins = int((now - last_activity_time).total_seconds() / 60)
                        
                        if idle_mins > 15:
                            status = "idle"
                            idle_duration = f"{idle_mins} دقیقه"
                
            else:
                # کار تمام شده، چک کنیم چقدر وقت پیش
                end_time = frappe.utils.get_datetime(latest_job.to_time)
                now = frappe.utils.now_datetime()
                idle_mins = int((now - end_time).total_seconds() / 60)
                
                if idle_mins < 30:
                    status = "on_break"  # اصلاح: باید on_break باشه نه break
                elif idle_mins < 480:  # کمتر از 8 ساعت
                    status = "idle"
                    idle_duration = f"{idle_mins} دقیقه"
                else:
                    status = "offline"
                
                # اطلاعات آخرین کار
                duration_mins = latest_job.time_in_mins or 0
                current_job = {
                    "job_card": latest_job.job_card,
                    "operation": latest_job.operation,
                    "workstation": latest_job.workstation,
                    "work_order": latest_job.work_order,
                    "duration": f"{duration_mins} دقیقه",
                    "from_time": latest_job.from_time,
                    "to_time": latest_job.to_time,
                    "status": latest_job.status
                }
        
        # اضافه کردن به لیست
        employee_status.append({
            "employee_name": emp.employee_name,  # اصلاح: employee_name باشه نه name
            "employee_id": emp.name,
            "image": emp.image,
            "department": emp.department,
            "designation": emp.designation,
            "status": status,
            "current_job": current_job,
            "idle_duration": idle_duration
        })
    
    # محاسبه خلاصه وضعیت
    status_summary = {
        "working": len([e for e in employee_status if e["status"] == "working"]),
        "idle": len([e for e in employee_status if e["status"] == "idle"]),
        "on_break": len([e for e in employee_status if e["status"] == "on_break"]),
        "offline": len([e for e in employee_status if e["status"] == "offline"])
    }
    
    # دریافت وضعیت ایستگاه‌ها
    workstations = get_workstation_status_for_date(target_date_str)
    
    return {
        "employees": employee_status,
        "status_summary": status_summary,
        "workstations": workstations,
        "last_update": frappe.utils.now_datetime(),
        "target_date": target_date_str
    }


def get_workstation_status_for_date(target_date):
    """دریافت وضعیت ایستگاه‌های کاری برای تاریخ مشخص"""
    
    workstations = frappe.get_all("Workstation", 
        fields=["name", "workstation_name", "production_capacity"]
    )
    
    workstation_status = []
    
    for ws in workstations:
        # کارمندان که در آن روز روی این ایستگاه کار کرده‌اند
        employees_worked = frappe.db.sql("""
            SELECT DISTINCT 
                e.employee_name, 
                e.name as employee_id,
                e.department,
                MIN(tl.from_time) as first_start,
                MAX(CASE WHEN tl.to_time IS NOT NULL THEN tl.to_time ELSE NOW() END) as last_end,
                COUNT(DISTINCT jc.name) as jobs_count,
                SUM(tl.completed_qty) as total_completed,
                SUM(tl.time_in_mins) as total_minutes,
                ROUND(SUM(tl.time_in_mins) / 60, 2) as total_hours
            FROM `tabJob Card` jc
            INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
            JOIN `tabEmployee` e ON e.name = tl.employee
            WHERE jc.workstation = %(workstation)s 
            AND jc.docstatus < 2
            AND DATE(tl.from_time) = %(target_date)s
            AND tl.completed_qty > 0
            GROUP BY e.name, e.employee_name, e.department
            ORDER BY first_start
        """, {
            'workstation': ws.name,
            'target_date': target_date
        }, as_dict=True)
        
        # کارهای فعال (در حال انجام) - فقط برای امروز معنا داره
        active_jobs = []
        if target_date == date.today().strftime("%Y-%m-%d"):
            active_jobs = frappe.db.sql("""
                SELECT 
                    jc.name as job_card,
                    jc.operation,
                    jc.work_order,
                    tl.employee,
                    e.employee_name,
                    tl.from_time
                FROM `tabJob Card` jc
                INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
                JOIN `tabEmployee` e ON e.name = tl.employee
                WHERE jc.workstation = %(workstation)s
                AND jc.docstatus = 1
                AND jc.status IN ('Work In Progress', 'In Process')
                AND DATE(tl.from_time) = %(target_date)s
                AND tl.to_time IS NULL
            """, {
                'workstation': ws.name,
                'target_date': target_date
            }, as_dict=True)
        
        # صف انتظار
        queue_jobs = frappe.db.sql("""
            SELECT 
                name as job_card,
                operation,
                work_order,
                expected_start_date
            FROM `tabJob Card`
            WHERE workstation = %(workstation)s
            AND docstatus = 1
            AND status = 'Open'
            ORDER BY expected_start_date
            LIMIT 10
        """, {'workstation': ws.name}, as_dict=True)
        
        # محاسبه درصد استفاده
        max_capacity = ws.production_capacity or 1
        current_active = len(active_jobs)
        utilization = min(100, (current_active / max_capacity) * 100) if target_date == date.today().strftime("%Y-%m-%d") else 0
        
        # تعیین وضعیت ایستگاه
        if len(active_jobs) > 0:
            station_status = "active"
        elif len(employees_worked) > 0:
            station_status = "recently_active"
        else:
            station_status = "idle"
        
        workstation_status.append({
            "name": ws.workstation_name or ws.name,
            "workstation_id": ws.name,
            "status": station_status,
            "active_employees": len(employees_worked),
            "current_active": current_active,
            "active_jobs": len(active_jobs),
            "queue_length": len(queue_jobs),
            "utilization": round(utilization, 1),
            "employees": employees_worked,
            "active_job_details": active_jobs,
            "queue_details": queue_jobs
        })
    # فقط ایستگاه‌هایی که کارمند داشته‌اند نمایش داده شوند
    workstation_status = [ws for ws in workstation_status if ws["active_employees"] > 0]
    return workstation_status


def calculate_employee_productivity(employee_id, target_date):
    """محاسبه بهره‌وری کارمند برای یک روز خاص"""
    
    # دریافت تمام Job Card های کارمند در آن روز
    job_logs = frappe.db.sql("""
        SELECT 
            jc.name as job_card,
            jc.time_required,
            tl.time_in_mins,
            tl.completed_qty,
            jc.for_quantity
        FROM `tabJob Card` jc
        INNER JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
        WHERE tl.employee = %(employee_id)s 
        AND DATE(tl.from_time) = %(target_date)s
        AND jc.docstatus = 1
        AND tl.completed_qty > 0
        AND jc.time_required > 0
    """, {
        'employee_id': employee_id,
        'target_date': target_date
    }, as_dict=True)
    
    if not job_logs:
        return {
            "productivity_percent": 0,
            "total_standard_time": 0,
            "total_actual_time": 0,
            "total_produced": 0,
            "efficiency_rating": "نامشخص"
        }
    
    total_standard_time = 0  # زمان استاندارد (دقیقه)
    total_actual_time = 0    # زمان واقعی (دقیقه)
    total_produced = 0       # تعداد تولید شده
    
    for log in job_logs:
        # زمان استاندارد برای تعداد تولید شده
        required_per_unit = log.time_required / (log.for_quantity or 1)  # زمان لازم برای هر واحد
        standard_time_for_produced = required_per_unit * log.completed_qty
        
        total_standard_time += standard_time_for_produced
        total_actual_time += log.time_in_mins or 0
        total_produced += log.completed_qty or 0
    
    # محاسبه بهره‌وری (درصد)
    if total_actual_time > 0:
        productivity_percent = (total_standard_time / total_actual_time) * 100
    else:
        productivity_percent = 0
    
    # تعیین رتبه عملکرد
    if productivity_percent >= 100:
        efficiency_rating = "عالی"
    elif productivity_percent >= 80:
        efficiency_rating = "خوب" 
    elif productivity_percent >= 60:
        efficiency_rating = "متوسط"
    else:
        efficiency_rating = "ضعیف"
    
    return {
        "productivity_percent": round(productivity_percent, 1),
        "total_standard_time": round(total_standard_time, 1),
        "total_actual_time": round(total_actual_time, 1),
        "total_produced": total_produced,
        "efficiency_rating": efficiency_rating
    }    


def get_date_filter_sql(filters, field_name):
    """تولید شرط فیلتر تاریخ برای SQL"""
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}
    
    conditions = []
    
    if filters.get('from_date'):
        conditions.append(f"AND {field_name} >= '{filters['from_date']}'")
    
    if filters.get('to_date'):
        conditions.append(f"AND {field_name} <= '{filters['to_date']}'")
    
    return ' '.join(conditions)


@frappe.whitelist()
def get_workstation_status_summary(filters=None):
    """
    خلاصه آماری سریع برای dashboard - بهینه‌شده
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}
    
    try:
        # فیلتر تاریخ
        date_filter = get_date_filter_sql(filters, 'jc.creation')
        
        # کوئری یکجا برای همه آمارها
        query = f"""
            SELECT 
                -- وضعیت‌ها
                COUNT(CASE WHEN jc.status = 'Open' THEN 1 END) as total_pending_jobs,
                COUNT(CASE WHEN jc.status = 'Work In Progress' THEN 1 END) as total_in_progress,
                COUNT(DISTINCT CASE 
                    WHEN jc.expected_end_date < NOW() 
                    AND jc.status NOT IN ('Completed','Cancelled') 
                    THEN jc.name END) as total_stuck_jobs,
                COUNT(CASE 
                    WHEN jc.status = 'Completed' 
                    AND DATE(jc.modified) = CURDATE() 
                    THEN 1 END) as total_completed_today,

                -- ساعت کاری تخمینی از Work Order Operation
                COALESCE(SUM(
                    CASE WHEN jc.status = 'Open' 
                    THEN COALESCE(wop.time_in_mins, 120) / 60.0 
                    ELSE 0 END
                ), 0) as total_pending_hours,

                -- تاخیرات
                COUNT(CASE 
                    WHEN jc.status != 'Completed' 
                    AND jc.expected_end_date < NOW() 
                    THEN 1 END) as total_delayed_jobs,
                COALESCE(AVG(
                    CASE 
                        WHEN jc.status != 'Completed' 
                        AND jc.expected_end_date < NOW() 
                        THEN TIMESTAMPDIFF(HOUR, jc.expected_end_date, NOW()) 
                        ELSE NULL END
                ), 0) as avg_delay_hours

            FROM `tabJob Card` jc
            LEFT JOIN `tabWork Order Operation` wop 
                ON wop.parent = jc.work_order 
            AND wop.operation = jc.operation
            WHERE jc.docstatus < 2 {date_filter}
        """
        result = frappe.db.sql(query, as_dict=True)[0]
        
        # محاسبات اضافی
        total_active_jobs = result['total_pending_jobs'] + result['total_in_progress'] + result['total_stuck_jobs']
        completion_rate = 0
        if total_active_jobs > 0:
            completion_rate = (result['total_completed_today'] / (total_active_jobs + result['total_completed_today'])) * 100
        
        return {
            "summary": {
                "total_pending_hours": float(result['total_pending_hours']),
                "total_pending_jobs": result['total_pending_jobs'],
                "total_in_progress": result['total_in_progress'],
                "total_stuck_jobs": result['total_stuck_jobs'],
                "total_completed_today": result['total_completed_today'],
                "total_delayed_jobs": result['total_delayed_jobs'],
                "avg_delay_hours": float(result['avg_delay_hours']),
                "completion_rate": round(completion_rate, 1),
                "efficiency_score": max(0, 100 - (result['total_stuck_jobs'] * 10) - (result['total_delayed_jobs'] * 5))
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_workstation_status_summary: {str(e)}")
        return {
            "summary": {
                "total_pending_hours": 0.0,
                "total_pending_jobs": 0,
                "total_in_progress": 0,
                "total_stuck_jobs": 0,
                "total_completed_today": 0,
                "total_delayed_jobs": 0,
                "avg_delay_hours": 0.0,
                "completion_rate": 0.0,
                "efficiency_score": 0
            }
        }


@frappe.whitelist()
def get_departments_with_workstations(filters=None):
    """
    departments با workstation های غیرخالی - بهینه‌شده
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    if not filters:
        filters = {}
    
    try:
        # فیلتر تاریخ
        date_filter = get_date_filter_sql(filters, 'jc.creation')
        

        query = f"""
        SELECT 
            COALESCE(wt.name, 'نامشخص') AS department_name,
            COUNT(DISTINCT w.name) AS workstation_count,
            COUNT(CASE WHEN jc.status = 'Open' THEN 1 END) AS total_pending,
            COUNT(CASE WHEN jc.status = 'Work In Progress' THEN 1 END) AS total_active,
            COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) AS total_stuck,
            COUNT(CASE WHEN jc.status = 'Completed' AND DATE(jc.modified) = CURDATE() THEN 1 END) AS total_completed_today,
            COALESCE(SUM(
                CASE WHEN jc.status IN ('Open', 'Work In Progress') 
                THEN jc.time_required / 60  -- تبدیل دقیقه به ساعت
                ELSE 0 END
            ), 0) AS total_workload,
            COUNT(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN 1 END) AS total_delayed,
            COALESCE(AVG(
                CASE WHEN jc.status IN ('Open', 'Work In Progress') 
                THEN 100
                ELSE 50 END
            ), 60) AS avg_load_percentage,
            (COUNT(CASE WHEN jc.status = 'Stuck' THEN 1 END) * 100 + 
            COUNT(CASE WHEN jc.status = 'Open' THEN 1 END) * 10 + 
            COUNT(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN 1 END) * 20) AS priority_score
        FROM `tabWorkstation` w
        LEFT JOIN `tabWorkstation Type` wt ON wt.name = w.workstation_type
        LEFT JOIN `tabJob Card` jc 
            ON jc.workstation = w.name 
            AND jc.docstatus IN (0,1)  -- شامل کارت‌های باز و تایید شده
            {date_filter if 'date_filter' in locals() else ''}
        WHERE w.name IS NOT NULL
        GROUP BY w.workstation_type, wt.name
        HAVING workstation_count > 0
        ORDER BY priority_score DESC, total_stuck DESC, total_pending DESC
        """

        
        departments = frappe.db.sql(query, as_dict=True)
        
        # پردازش نتایج
        for dept in departments:
            # محاسبه status class
            if dept['total_stuck'] > 0:
                dept['status_class'] = 'dept-critical'
                dept['status_text'] = 'بحرانی'
            elif dept['avg_load_percentage'] > 90:
                dept['status_class'] = 'dept-high-load'
                dept['status_text'] = 'بار بالا'
            elif dept['total_delayed'] > 5:
                dept['status_class'] = 'dept-warning'
                dept['status_text'] = 'تاخیر'
            else:
                dept['status_class'] = 'dept-normal'
                dept['status_text'] = 'عادی'
            
            # محاسبه efficiency
            total_jobs = dept['total_pending'] + dept['total_active'] + dept['total_stuck']
            if total_jobs > 0:
                dept['efficiency'] = max(0, 100 - (dept['total_stuck'] * 15) - (dept['total_delayed'] * 5))
            else:
                dept['efficiency'] = 100
        
        return {"departments": departments}
        
    except Exception as e:
        frappe.log_error(f"Error in get_departments_with_workstations: {str(e)}")
        return {"departments": []}


@frappe.whitelist()
def get_workstation_details(department_name, limit=50):
    """
    جزئیات workstation های یک department - بهینه‌شده
    """
    try:
        query = f"""
        SELECT
        w.name,
        w.workstation_type,
        w.production_capacity,
        COUNT(CASE WHEN jc.status = 'Open' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN jc.status = 'Work In Progress' THEN 1 END) as in_progress_jobs,
        COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) as stuck_jobs,
        COUNT(CASE WHEN jc.status = 'Completed' AND DATE(jc.modified) = CURDATE() THEN 1 END) as completed_jobs,
        COALESCE(SUM(CASE WHEN jc.status = 'Open' THEN 2 ELSE 0 END), 0) as pending_hours,
        COALESCE(SUM(CASE WHEN jc.status = 'Work In Progress' THEN 2 ELSE 0 END), 0) as in_progress_hours,
        COUNT(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN 1 END) as delayed_jobs,
        COALESCE(SUM(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN TIMESTAMPDIFF(HOUR, jc.expected_end_date, NOW()) ELSE 0 END), 0) as total_delay_hours,
        COALESCE(AVG(CASE WHEN jc.status = 'Open' AND jc.expected_start_date < NOW() THEN TIMESTAMPDIFF(HOUR, jc.expected_start_date, NOW()) ELSE NULL END), 0) as avg_wait_time,
        CASE
        WHEN w.production_capacity > 0
        THEN LEAST(((COUNT(CASE WHEN jc.status IN ('Open', 'Work In Progress') THEN 1 END) * 2.0) / w.production_capacity) * 100, 150)
        ELSE LEAST(COUNT(CASE WHEN jc.status IN ('Open', 'Work In Progress') THEN 1 END) * 20, 120)
        END as capacity_percentage,
        CASE
        WHEN COUNT(jc.name) > 0
        THEN GREATEST(50, 100 - (COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) * 20) -
        (COUNT(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN 1 END) * 10))
        ELSE 100
        END as efficiency,
        MAX(jc.modified) as last_activity,
        (COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) * 1000 +
        COUNT(CASE WHEN jc.status != 'Completed' AND jc.expected_end_date < NOW() THEN 1 END) * 100 +
        COUNT(CASE WHEN jc.status = 'Open' THEN 1 END) * 10) as priority_score
        FROM `tabWorkstation` w
        LEFT JOIN `tabJob Card` jc ON jc.workstation = w.name AND jc.docstatus < 2
        WHERE w.workstation_type = %s
        AND EXISTS (SELECT 1 FROM `tabJob Card` WHERE workstation = w.name AND docstatus = 1)
        GROUP BY w.name, w.workstation_type, w.production_capacity
        ORDER BY priority_score DESC, stuck_jobs DESC, pending_jobs DESC
        LIMIT %s
        """
        
        workstations = frappe.db.sql(query, [department_name, limit], as_dict=True)
        
        # پردازش نتایج
        for ws in workstations:
            # تعیین status class
            if ws['stuck_jobs'] > 0:
                ws['status_class'] = 'ws-critical'
                ws['status_text'] = 'بحرانی'
            elif ws['capacity_percentage'] > 100:
                ws['status_class'] = 'ws-overload'
                ws['status_text'] = 'اضافه بار'
            elif ws['capacity_percentage'] > 90:
                ws['status_class'] = 'ws-high-load'
                ws['status_text'] = 'بار بالا'
            elif ws['capacity_percentage'] > 70:
                ws['status_class'] = 'ws-medium-load'
                ws['status_text'] = 'بار متوسط'
            else:
                ws['status_class'] = 'ws-normal'
                ws['status_text'] = 'عادی'
            
            # تعیین badge class
            if ws['capacity_percentage'] > 100:
                ws['badge_class'] = 'badge-danger'
            elif ws['capacity_percentage'] > 90:
                ws['badge_class'] = 'badge-warning'
            elif ws['capacity_percentage'] > 70:
                ws['badge_class'] = 'badge-info'
            else:
                ws['badge_class'] = 'badge-success'
            
            # فرمت کردن تاریخ آخرین فعالیت
            if ws['last_activity']:
                ws['last_activity_formatted'] = frappe.utils.get_datetime(ws['last_activity']).strftime('%H:%M - %m/%d')
            else:
                ws['last_activity_formatted'] = 'هیچ فعالیتی'
            
            # محاسبه load percentage برای progress bar
            ws['load_bar_width'] = min(ws['capacity_percentage'], 100)
            
        return {"workstations": workstations}
        
    except Exception as e:
        frappe.log_error(f"Error in get_workstation_details: {str(e)}")
        return {"workstations": []}


@frappe.whitelist()
def get_job_cards_for_workstation(workstation_name, status_filter=None, limit=50):
    """
    Job cards یک workstation با فیلتر - بهینه‌شده
    """
    try:
        # تعیین فیلتر وضعیت
        status_condition = ""
        if status_filter:
            if status_filter == "active":
                status_condition = "AND jc.status IN ('Open', 'Work In Progress')"

            elif status_filter == "problem":
                status_condition = "AND (jc.status = 'Stuck' OR jc.expected_end_date < NOW())"
            else:
                status_condition = f"AND jc.status = '{status_filter}'"
        
        query = f"""
        SELECT 
            jc.name as job_card,
            jc.operation,
            jc.status,
            jc.job_card_priority as priority,
            jc.expected_start_date,
            jc.expected_end_date,
            jc.for_quantity,
            jc.total_completed_qty,
            jc.work_order,
            jc.production_item,
            2.0 as estimated_hours,  -- مقدار پیش‌فرض به جای op.time_in_mins
            CASE 
                WHEN jc.status = 'Open' AND jc.expected_start_date < NOW() 
                THEN TIMESTAMPDIFF(MINUTE, jc.expected_start_date, NOW()) / 60.0
                ELSE 0 
            END as wait_hours,
            CASE 
                WHEN jc.expected_end_date < NOW() AND jc.status != 'Completed'
                THEN TIMESTAMPDIFF(MINUTE, jc.expected_end_date, NOW()) / 60.0
                ELSE 0 
            END as delay_hours,
            CASE 
                WHEN jc.for_quantity > 0 AND jc.total_completed_qty IS NOT NULL
                THEN ((jc.for_quantity - jc.total_completed_qty) / jc.for_quantity) * 2.0
                ELSE 2.0
            END as remaining_hours,
            COALESCE(tl_stats.total_time_mins, 0) / 60.0 as actual_hours,
            COALESCE(tl_stats.total_completed_qty, 0) as completed_from_logs,
            CASE 
                WHEN COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) > 0 THEN 1
                WHEN jc.expected_end_date < NOW() AND jc.status != 'Completed' THEN 2
                WHEN jc.job_card_priority = 'High' THEN 3
                WHEN jc.job_card_priority = 'Medium' THEN 4
                ELSE 5
            END as sort_priority
        FROM `tabJob Card` jc
        LEFT JOIN (
            SELECT 
                parent,
                SUM(time_in_mins) as total_time_mins,
                SUM(completed_qty) as total_completed_qty
            FROM `tabJob Card Time Log`
            GROUP BY parent
        ) tl_stats ON tl_stats.parent = jc.name
        WHERE jc.workstation = %s 
        AND jc.docstatus = 1
        {status_condition}
        ORDER BY sort_priority, delay_hours DESC, jc.expected_end_date ASC
        LIMIT %s
        """
        
        job_cards = frappe.db.sql(query, [workstation_name, limit], as_dict=True)
                # تبدیل status های ERPNext به نمایشی
        for card in job_cards:
            original_status = card['status']
            if original_status == 'Open':
                card['status'] = 'Open'
            elif original_status == 'Work In Progress':
                card['status'] = 'In Progress'
            # سایر status ها همونجور می‌مونن
        
        # پردازش نتایج
        for card in job_cards:
            # تعیین status class و text
            status_map = {
                'Pending': {'class': 'status-pending', 'text': 'در انتظار', 'badge': 'badge-secondary'},
                'Work In Progress': {'class': 'status-in-progress', 'text': 'در حال انجام', 'badge': 'badge-primary'},
                'Stuck': {'class': 'status-stuck', 'text': 'متوقف', 'badge': 'badge-danger'},
                'Completed': {'class': 'status-completed', 'text': 'تکمیل شده', 'badge': 'badge-success'}
            }
            
            status_info = status_map.get(card['status'], {'class': 'status-unknown', 'text': card['status'], 'badge': 'badge-light'})
            card['status_class'] = status_info['class']
            card['status_text'] = status_info['text']
            card['status_badge'] = status_info['badge']
            
            # تعیین priority class
            priority_map = {
                'High': {'class': 'priority-high', 'text': 'بالا', 'badge': 'badge-danger'},
                'Medium': {'class': 'priority-medium', 'text': 'متوسط', 'badge': 'badge-warning'},
                'Low': {'class': 'priority-low', 'text': 'پایین', 'badge': 'badge-info'}
            }
            
            priority_info = priority_map.get(card['priority'], {'class': 'priority-medium', 'text': 'متوسط', 'badge': 'badge-warning'})
            card['priority_class'] = priority_info['class']
            card['priority_text'] = priority_info['text']
            card['priority_badge'] = priority_info['badge']
            
            # محاسبه progress percentage
            if card['for_quantity'] and card['for_quantity'] > 0:
                completed = card['total_completed_qty'] or 0
                card['progress_percentage'] = (completed / card['for_quantity']) * 100
            else:
                card['progress_percentage'] = 0 if card['status'] != 'Completed' else 100
            
            # تعیین کلاس‌های هشدار
            card['is_delayed'] = card['delay_hours'] > 0
            card['is_high_wait'] = card['wait_hours'] > 4
            card['needs_attention'] = card['status'] == 'Stuck' or card['is_delayed']
            
            # فرمت کردن زمان‌ها
            card['wait_hours_formatted'] = f"{card['wait_hours']:.1f} ساعت" if card['wait_hours'] > 0 else "-"
            card['delay_hours_formatted'] = f"{card['delay_hours']:.1f} ساعت" if card['delay_hours'] > 0 else "-"
            card['remaining_hours_formatted'] = f"{card['remaining_hours']:.1f} ساعت"
            card['actual_hours_formatted'] = f"{card['actual_hours']:.1f} ساعت"
            
        return {"job_cards": job_cards}
        
    except Exception as e:
        frappe.log_error(f"Error in get_job_cards_for_workstation: {str(e)}")
        return {"job_cards": []}

@frappe.whitelist()
def resolve_stuck_job_card(job_card):
    """تغییر وضعیت کارت کار از Stuck به Pending"""
    try:
        if not job_card:
            frappe.throw(_("Job Card ID is required"))

        # بررسی وجود سند
        if not frappe.db.exists("Job Card", job_card):
            frappe.throw(_("Job Card {0} does not exist").format(job_card))

        # بررسی دسترسی
        if not frappe.has_permission("Job Card", "write", job_card):
            frappe.throw(_("No permission to modify Job Card"))

        jc_doc = frappe.get_doc("Job Card", job_card)
        
        if jc_doc.status == "Work In Progress":
            jc_doc.status = "Open"
            jc_doc.add_comment("Comment", _("Status changed from Stuck to Pending"))
            jc_doc.save()
            
            # ثبت activity log
            frappe.get_doc({
                "doctype": "Activity Log",
                "subject": _("Job Card {0} status changed").format(job_card),
                "content": _("Status changed from Work In Progress to Open"),
                "reference_doctype": "Job Card",
                "reference_name": job_card
            }).insert(ignore_permissions=True)
            
            return {"success": True, "message": _("Job Card status updated successfully")}
        else:
            return {"success": False, "message": _("Job Card is not in stuck state")}
            
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Resolve Stuck Job Card Error")
        frappe.throw(_("Error updating Job Card: {0}").format(str(e)))

@frappe.whitelist()
def get_workstation_kpi_summary(workstation_name, days=7):
    """
    KPI های یک workstation در چند روز گذشته
    """
    try:
        from_date = frappe.utils.add_days(frappe.utils.today(), -days)
        query = """
SELECT
COUNT(jc.name) as total_jobs,
COUNT(CASE WHEN jc.status = 'Completed' THEN 1 END) as completed_jobs,
COUNT(DISTINCT CASE WHEN jc.expected_end_date < NOW() AND jc.status NOT IN ('Completed','Cancelled') THEN jc.name END) as stuck_jobs,
COUNT(CASE WHEN jc.expected_end_date < NOW() AND jc.status != 'Completed' THEN 1 END) as overdue_jobs,
COALESCE(AVG(tl.time_in_mins), 0) as avg_cycle_time_mins,
COALESCE(SUM(tl.time_in_mins), 0) / 60.0 as total_work_hours,
CASE
WHEN COUNT(jc.name) > 0
THEN (COUNT(CASE WHEN jc.status = 'Completed' THEN 1 END) * 100.0 / COUNT(jc.name))
ELSE 0
END as completion_rate,
COALESCE(AVG(
CASE WHEN jc.total_completed_qty > 0 AND jc.for_quantity > 0
THEN (jc.total_completed_qty / jc.for_quantity) * 100
ELSE NULL END
), 0) as avg_quality_rate
FROM `tabJob Card` jc
LEFT JOIN `tabJob Card Time Log` tl ON tl.parent = jc.name
WHERE jc.workstation = %s
AND jc.docstatus < 2
AND jc.creation >= %s
"""
        
        result = frappe.db.sql(query, [workstation_name, from_date], as_dict=True)[0]
        
        # محاسبات اضافی
        efficiency_score = max(0, 100 - (result['stuck_jobs'] * 10) - (result['overdue_jobs'] * 5))
        
        return {
            "kpi": {
                "total_jobs": result['total_jobs'],
                "completed_jobs": result['completed_jobs'],
                "completion_rate": round(result['completion_rate'], 1),
                "efficiency_score": round(efficiency_score, 1),
                "avg_cycle_time": round(result['avg_cycle_time_mins'] / 60.0, 1),
                "total_work_hours": round(result['total_work_hours'], 1),
                "stuck_jobs": result['stuck_jobs'],
                "overdue_jobs": result['overdue_jobs'],
                "quality_rate": round(result['avg_quality_rate'], 1),
                "period_days": days
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_workstation_kpi_summary: {str(e)}")
        return {"kpi": {}}
    
    
    
