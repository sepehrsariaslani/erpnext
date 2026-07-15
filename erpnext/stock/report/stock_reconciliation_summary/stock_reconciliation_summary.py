# فایل: erpnext/stock/report/stock_reconciliation_summary/stock_reconciliation_summary.py

import frappe
from frappe import _

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {
            "fieldname": "item_code",
            "label": _("کد کالا"),
            "fieldtype": "Link",
            "options": "Item",
            "width": 150
        },
        {
            "fieldname": "item_name",
            "label": _("نام کالا"),
            "fieldtype": "Data",
            "width": 200
        },
        {
            "fieldname": "warehouse",
            "label": _("انبار"),
            "fieldtype": "Link",
            "options": "Warehouse",
            "width": 150
        },
        {
            "fieldname": "reconciliation_count",
            "label": _("تعداد تطبیق"),
            "fieldtype": "Int",
            "width": 100
        },
        {
            "fieldname": "total_added",
            "label": _("مجموع اضافه شده"),
            "fieldtype": "Float",
            "width": 150
        },
        {
            "fieldname": "current_qty",
            "label": _("موجودی فعلی انبار"),
            "fieldtype": "Float",
            "width": 150
        },
        {
            "fieldname": "last_reconciliation",
            "label": _("آخرین تطبیق"),
            "fieldtype": "Date",
            "width": 120
        }
    ]

def get_data(filters):
    conditions = ""
    
    # فیلترها (اختیاری)
    if filters.get("from_date"):
        conditions += " AND sr.posting_date >= %(from_date)s"
    if filters.get("to_date"):
        conditions += " AND sr.posting_date <= %(to_date)s"
    if filters.get("warehouse"):
        conditions += " AND sri.warehouse = %(warehouse)s"
    if filters.get("item_code"):
        conditions += " AND sri.item_code = %(item_code)s"
    
    query = f"""
        SELECT 
            sri.item_code,
            sri.item_name,
            sri.warehouse,
            COUNT(DISTINCT sr.name) as reconciliation_count,
            SUM(sri.qty - COALESCE(sri.current_qty, 0)) as total_added,
            COALESCE(bin.actual_qty, 0) as current_qty,
            MAX(sr.posting_date) as last_reconciliation
        FROM 
            `tabStock Reconciliation` sr
        INNER JOIN 
            `tabStock Reconciliation Item` sri ON sr.name = sri.parent
        LEFT JOIN
            `tabBin` bin ON bin.item_code = sri.item_code AND bin.warehouse = sri.warehouse
        WHERE 
            sr.docstatus = 1
            {conditions}
        GROUP BY
            sri.item_code,
            sri.item_name,
            sri.warehouse,
            bin.actual_qty
        ORDER BY 
            SUM(sri.qty - COALESCE(sri.current_qty, 0)) DESC
    """
    
    return frappe.db.sql(query, filters, as_dict=1)