import frappe
from frappe.utils import flt

def test_query():
    """تست کوئری برای دیباگ"""
    
    # لیست مشتری‌ها
    customers = frappe.db.sql("""
        SELECT DISTINCT customer 
        FROM `tabSales Order`
        WHERE docstatus = 1
        LIMIT 10
    """, as_dict=1)
    
    print("\n=== Available Customers ===")
    for c in customers:
        print(f"  - {c.customer}")
    
    if customers:
        test_customer = customers[0].customer
        print(f"\n=== Testing with customer: {test_customer} ===")
        
        # تست کوئری اصلی
        query = """
            SELECT 
                so.name as sales_order,
                so.transaction_date,
                so.status,
                soi.item_code,
                soi.item_name,
                soi.stock_uom as uom,
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
        """
        
        result = frappe.db.sql(query, test_customer, as_dict=1)
        
        print(f"\nFound {len(result)} sales order items")
        
        if result:
            print("\n=== Sample Data ===")
            for i, row in enumerate(result[:5]):
                pending = flt(row.ordered_qty) - flt(row.delivered_qty)
                print(f"\n{i+1}. SO: {row.sales_order}")
                print(f"   Item: {row.item_code}")
                print(f"   Ordered: {row.ordered_qty}, Delivered: {row.delivered_qty}, Pending: {pending}")
                print(f"   Status: {row.status}")
                
                # بررسی Product Bundle
                has_bundle = frappe.db.exists("Product Bundle", row.item_code)
                print(f"   Has Bundle: {has_bundle}")
        else:
            print("\nNo data found!")
            
            # بررسی آیا اصلا سفارش فروش داریم
            all_so = frappe.db.sql("""
                SELECT name, status, docstatus 
                FROM `tabSales Order` 
                WHERE customer = %s
                LIMIT 5
            """, test_customer, as_dict=1)
            
            print(f"\nAll Sales Orders for {test_customer}:")
            for so in all_so:
                print(f"  - {so.name}: status={so.status}, docstatus={so.docstatus}")

if __name__ == "__main__":
    test_query()
