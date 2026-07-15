import frappe
from frappe.utils import getdate
from collections import defaultdict

def execute(filters=None):
    if not filters:
        filters = {}

    # Set default date range if not provided
    if not filters.get("from_date"):
        filters["from_date"] = frappe.utils.add_months(frappe.utils.nowdate(), -24)
    if not filters.get("to_date"):
        filters["to_date"] = frappe.utils.nowdate()
    
    # Get raw purchase invoice data
    raw_data = get_raw_purchase_data(filters)
    
    # Process data with Python
    purchase_data = process_purchase_data(raw_data)

    columns = [
        {"label": "کد کالا", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 120},
        {"label": "نام کالا", "fieldname": "item_name", "fieldtype": "Data", "width": 200},
        {"label": "کد تأمین‌کننده", "fieldname": "supplier", "fieldtype": "Link", "options": "Supplier", "width": 120},
        {"label": "نام تأمین‌کننده", "fieldname": "supplier_name", "fieldtype": "Data", "width": 180},
        {"label": "واحد پایه", "fieldname": "base_uom", "fieldtype": "Data", "width": 100},
        {"label": "ماه", "fieldname": "year_month", "fieldtype": "Data", "width": 80},
        {"label": "تعداد فاکتور", "fieldname": "purchase_count_month", "fieldtype": "Int", "width": 100},
        {"label": "مقدار خرید", "fieldname": "total_qty_month", "fieldtype": "Float", "precision": 2, "width": 100},
        {"label": "قیمت متوسط", "fieldname": "avg_price_month", "fieldtype": "Currency", "width": 120},
        {"label": "کمترین قیمت", "fieldname": "min_price_month", "fieldtype": "Currency", "width": 120},
        {"label": "بیشترین قیمت", "fieldname": "max_price_month", "fieldtype": "Currency", "width": 120}
    ]

    return columns, purchase_data

def get_raw_purchase_data(filters):
    """Get raw purchase invoice data with simple query"""
    conditions = []
    
    if filters.get("item_code"):
        conditions.append("pii.item_code = %(item_code)s")
    if filters.get("supplier"):
        conditions.append("pi.supplier = %(supplier)s")
    if filters.get("from_date"):
        conditions.append("pi.posting_date >= %(from_date)s")
    if filters.get("to_date"):
        conditions.append("pi.posting_date <= %(to_date)s")
    
    where_clause = ""
    if conditions:
        where_clause = " AND " + " AND ".join(conditions)
    
    query = """
        SELECT
            pii.item_code,
            pii.item_name,
            pi.supplier,
            s.supplier_name,
            COALESCE(i.stock_uom, 'واحد نامشخص') AS base_uom,
            pi.posting_date,
            pi.name as invoice_name,
            pii.qty,
            pii.base_amount,
            pii.uom,
            COALESCE(uc.conversion_factor, 1.0) as conversion_factor
        FROM `tabPurchase Invoice` pi
        INNER JOIN `tabPurchase Invoice Item` pii ON pi.name = pii.parent
        LEFT JOIN `tabItem` i ON pii.item_code = i.name 
        LEFT JOIN `tabSupplier` s ON pi.supplier = s.name
        LEFT JOIN `tabUOM Conversion Detail` uc ON uc.parent = pii.item_code 
            AND uc.parenttype = 'Item'
        WHERE pi.docstatus = 1 
            AND pi.is_return = 0
            AND pii.qty > 0{where_clause}
        ORDER BY pii.item_code ASC, pi.posting_date DESC
    """.format(where_clause=where_clause)
    
    return frappe.db.sql(query, filters, as_dict=True)

def process_purchase_data(raw_data):
    """Process raw purchase data and group by item, supplier, and month"""
    grouped_data = defaultdict(lambda: {
        'invoices': set(),
        'total_qty': 0,
        'total_amount': 0,
        'prices': []
    })
    
    # Group data by item_code, supplier, and year-month
    for row in raw_data:
        posting_date = row.get('posting_date')
        if posting_date:
            year_month = posting_date.strftime('%Y-%m')
            
            # Create unique key for grouping
            key = (row.get('item_code'), row.get('supplier'), year_month)
            
            # Calculate converted quantity and unit price
            converted_qty = (row.get('qty') or 0) * (row.get('conversion_factor') or 1.0)
            base_amount = row.get('base_amount') or 0
            
            if converted_qty > 0:
                unit_price = base_amount / converted_qty
                
                # Store data for this group
                group = grouped_data[key]
                group['item_code'] = row.get('item_code')
                group['item_name'] = row.get('item_name')
                group['supplier'] = row.get('supplier')
                group['supplier_name'] = row.get('supplier_name')
                group['base_uom'] = row.get('base_uom')
                group['year_month'] = year_month
                group['invoices'].add(row.get('invoice_name'))
                group['total_qty'] += converted_qty
                group['total_amount'] += base_amount
                group['prices'].append(unit_price)
    
    # Convert grouped data to final format
    result = []
    for key, group in grouped_data.items():
        if group['prices']:  # Only include groups with valid prices
            avg_price = group['total_amount'] / group['total_qty'] if group['total_qty'] > 0 else 0
            min_price = min(group['prices'])
            max_price = max(group['prices'])
            
            result.append({
                'item_code': group['item_code'],
                'item_name': group['item_name'],
                'supplier': group['supplier'],
                'supplier_name': group['supplier_name'],
                'base_uom': group['base_uom'],
                'year_month': group['year_month'],
                'purchase_count_month': len(group['invoices']),
                'total_qty_month': round(group['total_qty'], 2),
                'avg_price_month': round(avg_price, 2),
                'min_price_month': round(min_price, 2),
                'max_price_month': round(max_price, 2)
            })
    
    # Sort by item_code and year_month (newest first)
    result.sort(key=lambda x: (x['item_code'], x['year_month']), reverse=False)
    result.sort(key=lambda x: x['year_month'], reverse=True)
    
    return result
