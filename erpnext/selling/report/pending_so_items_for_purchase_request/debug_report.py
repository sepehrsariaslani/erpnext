# Debug script - اجرا کنید از Console در ERPNext
# frappe.call('erpnext.selling.report.pending_so_items_for_purchase_request.debug_report.test_report')

import frappe
from frappe.utils import flt

@frappe.whitelist()
def test_report():
    """تست گزارش برای دیباگ"""
    
    results = []
    
    # 1. بررسی مشتری‌ها
    customers = frappe.db.sql("""
        SELECT DISTINCT customer 
        FROM `tabSales Order`
        WHERE docstatus = 1
        ORDER BY modified DESC
        LIMIT 5
    """, as_dict=1)
    
    results.append(f"Found {len(customers)} customers with sales orders")
    
    if not customers:
        results.append("ERROR: No customers found with sales orders!")
        return "\n".join(results)
    
    # تست با اولین مشتری
    test_customer = customers[0].customer
    results.append(f"\nTesting with customer: {test_customer}")
    
    # 2. بررسی سفارش‌های فروش
    query = """
        SELECT 
            so.name as sales_order,
            so.transaction_date,
            so.status,
            so.docstatus,
            soi.item_code,
            soi.item_name,
            soi.qty as ordered_qty,
            IFNULL(soi.delivered_qty, 0) as delivered_qty
        FROM 
            `tabSales Order` so
        INNER JOIN 
            `tabSales Order Item` soi ON soi.parent = so.name
        WHERE 
            so.customer = %s
            AND so.docstatus = 1
            AND so.status NOT IN ('Cancelled', 'Closed')
        LIMIT 10
    """
    
    sales_orders = frappe.db.sql(query, test_customer, as_dict=1)
    results.append(f"\nFound {len(sales_orders)} sales order items")
    
    if not sales_orders:
        results.append("\nERROR: No sales order items found!")
        
        # بررسی چرا
        all_so = frappe.db.sql("""
            SELECT name, status, docstatus, per_delivered
            FROM `tabSales Order` 
            WHERE customer = %s
            LIMIT 5
        """, test_customer, as_dict=1)
        
        results.append(f"\nAll Sales Orders for {test_customer}:")
        for so in all_so:
            results.append(f"  - {so.name}: status={so.status}, docstatus={so.docstatus}, per_delivered={so.per_delivered}")
        
        return "\n".join(results)
    
    # 3. نمایش چند آیتم نمونه
    results.append("\n=== Sample Items ===")
    for i, row in enumerate(sales_orders[:3]):
        pending = flt(row.ordered_qty) - flt(row.delivered_qty)
        results.append(f"\n{i+1}. SO: {row.sales_order}")
        results.append(f"   Item: {row.item_code} - {row.item_name}")
        results.append(f"   Ordered: {row.ordered_qty}, Delivered: {row.delivered_qty}")
        results.append(f"   Pending: {pending}")
        results.append(f"   SO Status: {row.status}")
        
        # بررسی Product Bundle
        has_bundle = frappe.db.exists("Product Bundle", row.item_code)
        results.append(f"   Has Bundle: {has_bundle}")
        
        if has_bundle:
            components = frappe.db.sql("""
                SELECT item_code, qty
                FROM `tabProduct Bundle Item`
                WHERE parent = %s
            """, row.item_code, as_dict=1)
            results.append(f"   Bundle Components: {len(components)}")
            for comp in components:
                results.append(f"     - {comp.item_code}: {comp.qty}")
    
    # 4. تست گزارش اصلی
    results.append("\n\n=== Testing Main Report ===")
    try:
        from erpnext.selling.report.pending_so_items_for_purchase_request.pending_so_items_for_purchase_request import execute
        
        filters = {
            "customer": test_customer,
            "to_date": frappe.utils.today()
        }
        
        columns, data = execute(filters)
        results.append(f"Report returned {len(data)} rows")
        
        if data:
            results.append("\n=== Report Data (first 3 rows) ===")
            for i, row in enumerate(data[:3]):
                results.append(f"\n{i+1}. {row.get('item_code')}")
                results.append(f"   Pending Qty: {row.get('pending_qty')}")
                results.append(f"   Available Stock: {row.get('available_stock')}")
                results.append(f"   Need to Produce: {row.get('need_to_produce')}")
        else:
            results.append("\nERROR: Report returned no data!")
            
    except Exception as e:
        results.append(f"\nERROR in report: {str(e)}")
        import traceback
        results.append(traceback.format_exc())
    
    return "\n".join(results)


@frappe.whitelist()
def list_reports():
    """لیست گزارش‌های موجود"""
    reports = frappe.db.sql("""
        SELECT name, ref_doctype, report_type, module
        FROM `tabReport`
        WHERE name LIKE '%Pending%SO%'
        OR name LIKE '%Sales Order%'
    """, as_dict=1)
    
    result = ["=== Available Reports ==="]
    for r in reports:
        result.append(f"{r.name} ({r.report_type}) - Module: {r.module}")
    
    return "\n".join(result)
