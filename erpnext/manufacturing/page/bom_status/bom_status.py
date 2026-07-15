import frappe
from frappe.utils import flt

@frappe.whitelist()
def get_bom_status_simple(search_text="", selected_bom=""):
    """
    Simple BOM status with material consumption (max 3 levels)
    """
    try:
        if selected_bom:
            return get_bom_details_simple(selected_bom)
        elif search_text:
            return search_bom_items(search_text)
        else:
            return get_all_boms_simple()
    except Exception as e:
        frappe.log_error(f"Error in get_bom_status_simple: {str(e)}")
        return []

@frappe.whitelist() 
def get_all_boms_simple():
    """
    Get all active BOMs
    """
    query = """
    SELECT 
        name,
        item_name,
        total_cost,
        uom
    FROM `tabBOM`
    WHERE docstatus = 1 
      AND is_active = 1
    ORDER BY name
    LIMIT 100
    """
    
    boms = frappe.db.sql(query, as_dict=True)
    return [{"type": "bom_list", "bom_list": boms}]

def get_bom_details_simple(bom_name):
    """
    Get BOM details with 3 levels maximum
    """
    try:
        # گرفتن اطلاعات BOM اصلی
        bom_info = frappe.get_doc("BOM", bom_name)
        
        result = [{
            "type": "bom_header",
            "bom_name": bom_name,
            "bom_item": bom_info.item_code,
            "bom_item_name": bom_info.item_name,
            "total_cost": bom_info.total_cost or 0,
            "uom": bom_info.uom,
            "quantity": bom_info.quantity or 1
        }]
        
        # سطح 1: آیتم‌های مستقیم
        level1_items = get_bom_items(bom_name, 1)
        result.extend(level1_items)
        
        # سطح 2 و 3: زیرمجموعه‌ها
        for item in level1_items:
            if has_bom(item['item_code']):
                level2_items = get_bom_items_for_item(item['item_code'], 2, item['total_required_qty'])
                result.extend(level2_items)
                
                # سطح 3
                for item2 in level2_items:
                    if has_bom(item2['item_code']) and item2['level'] == 2:
                        level3_items = get_bom_items_for_item(item2['item_code'], 3, item2['total_required_qty'])
                        result.extend(level3_items)
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error in get_bom_details_simple: {str(e)}")
        return []

def get_bom_items(bom_name, level, multiplier=1):
    """
    Get items for a specific BOM
    """
    query = """
    SELECT 
        item.item_code,
        item.item_name,
        item.qty,
        item.uom,
        COALESCE(item.rate, 0) as rate,
        COALESCE(item.amount, 0) as amount,
        COALESCE(item_master.item_group, '') as item_group
    FROM `tabBOM Item` item
    LEFT JOIN `tabItem` item_master ON item_master.name = item.item_code
    WHERE item.parent = %s
    ORDER BY item.idx
    """
    
    items = frappe.db.sql(query, (bom_name,), as_dict=True)
    
    result = []
    for item in items:
        # فقط آیتم‌های گروه محصولات یا بدون گروه
        if not item['item_group'] or item['item_group'] == 'محصولات' or item['item_group'] == '':
            total_qty = item['qty'] * multiplier
            result.append({
                "type": "bom_item",
                "bom_name": bom_name,
                "item_code": item['item_code'],
                "item_name": item['item_name'] or item['item_code'],
                "qty": item['qty'],
                "total_required_qty": total_qty,
                "uom": item['uom'],
                "rate": item['rate'],
                "amount": item['amount'],
                "total_amount": total_qty * item['rate'],
                "level": level,
                "has_sub_bom": 1 if has_bom(item['item_code']) else 0,
                "item_group": item['item_group']
            })
    
    return result

def get_bom_items_for_item(item_code, level, multiplier):
    """
    Get BOM items for a specific item code
    """
    # پیدا کردن BOM برای این آیتم
    bom_query = """
    SELECT name FROM `tabBOM`
    WHERE item_code = %s 
      AND docstatus = 1 
      AND is_active = 1
    LIMIT 1
    """
    
    bom_result = frappe.db.sql(bom_query, (item_code,), as_dict=True)
    
    if bom_result:
        return get_bom_items(bom_result[0]['name'], level, multiplier)
    
    return []

def has_bom(item_code):
    """
    Check if item has an active BOM
    """
    query = """
    SELECT COUNT(*) as count FROM `tabBOM`
    WHERE item_code = %s 
      AND docstatus = 1 
      AND is_active = 1
    """
    
    result = frappe.db.sql(query, (item_code,), as_dict=True)
    return result[0]['count'] > 0

def search_bom_items(search_text):
    """
    Search in BOMs and items
    """
    query = """
    SELECT DISTINCT
        bom.name AS bom_name,
        bom.item_code,
        bom.item_name,
        'BOM' as search_type
    FROM `tabBOM` bom
    WHERE (bom.name LIKE %s OR bom.item_code LIKE %s OR bom.item_name LIKE %s)
      AND bom.docstatus = 1 
      AND bom.is_active = 1
    
    UNION ALL
    
    SELECT DISTINCT
        bom.name AS bom_name,
        bom.item_code,
        bom.item_name,
        'Item' as search_type
    FROM `tabBOM Item` item
    JOIN `tabBOM` bom ON bom.name = item.parent
    LEFT JOIN `tabItem` item_master ON item_master.name = item.item_code
    WHERE (item.item_code LIKE %s OR item.item_name LIKE %s)
      AND bom.docstatus = 1 
      AND bom.is_active = 1
      AND (item_master.item_group = 'محصولات' OR item_master.item_group IS NULL OR item_master.item_group = '')
    
    ORDER BY bom_name
    LIMIT 50
    """
    
    search_param = f"%{search_text}%"
    results = frappe.db.sql(query, (search_param, search_param, search_param, 
                                   search_param, search_param), as_dict=True)
    
    # تبدیل نتایج جستجو به فرمت مناسب
    bom_list = []
    for result in results:
        bom_list.append({
            "name": result['bom_name'],
            "item_code": result['item_code'],
            "item_name": result['item_name'],
            "search_type": result['search_type']
        })
    
    return [{"type": "bom_list", "bom_list": bom_list}]