# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate


def execute(filters=None):
    try:
        columns = get_columns()
        data = get_data(filters)
        return columns, data
    except Exception as e:
        frappe.log_error(f"Error in Pending SO Items report: {str(e)}")
        frappe.throw(_(f"Error generating report: {str(e)}"))
        return [], []


def get_columns():
    """تعریف ستون‌های گزارش"""
    return [
        {
            "label": _("Item Code"),
            "fieldname": "item_code",
            "fieldtype": "Link",
            "options": "Item",
            "width": 150
        },
        {
            "label": _("Item Name"),
            "fieldname": "item_name",
            "fieldtype": "Data",
            "width": 200
        },
        {
            "label": _("UOM"),
            "fieldname": "uom",
            "fieldtype": "Link",
            "options": "UOM",
            "width": 80
        },
        {
            "label": _("Total Ordered"),
            "fieldname": "total_ordered",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": _("Total Delivered"),
            "fieldname": "total_delivered",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": _("Pending Qty"),
            "fieldname": "pending_qty",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": _("Available Stock"),
            "fieldname": "available_stock",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": _("Need to Produce"),
            "fieldname": "need_to_produce",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": _("Sales Orders"),
            "fieldname": "sales_orders",
            "fieldtype": "Data",
            "width": 200
        }
    ]


def get_data(filters):
    """دریافت داده‌های گزارش"""
    # دریافت سفارش‌های فروش
    sales_orders = get_sales_orders(filters)
    
    if not sales_orders:
        return []
    
    # پردازش آیتم‌ها
    items_data = process_items(sales_orders, filters)
    
    if not items_data:
        return []
    
    # محاسبه موجودی و نیاز به تولید
    final_data = calculate_stock_and_production(items_data, filters)
    
    return final_data


def get_sales_orders(filters):
    """دریافت سفارش‌های فروش فیلتر شده"""
    try:
        conditions = []
        values = {}
        
        # فیلتر مشتری اختیاری است
        if filters.get("customer"):
            conditions.append("so.customer = %(customer)s")
            values["customer"] = filters.get("customer")
        
        conditions.append("so.docstatus = 1")  # فقط ثبت شده
        conditions.append("so.status NOT IN ('Cancelled', 'Closed', 'Completed')")  # لغو یا بسته نشده
        conditions.append("so.per_delivered < 100")  # تحویل کامل نشده
        
        if filters.get("to_date"):
            conditions.append("so.transaction_date <= %(to_date)s")
            values["to_date"] = filters.get("to_date")
        
        query = f"""
            SELECT 
                so.name as sales_order,
                so.transaction_date,
                so.status,
                so.per_delivered,
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
                {' AND '.join(conditions)}
            ORDER BY 
                so.transaction_date, so.name
        """
        
        result = frappe.db.sql(query, values, as_dict=1)
        
        # فیلتر کردن فقط آیتم‌هایی که هنوز تحویل کامل نشده
        filtered_result = []
        for row in result:
            pending = flt(row.ordered_qty) - flt(row.delivered_qty)
            if pending > 0:
                filtered_result.append(row)
        
        return filtered_result
    except Exception as e:
        frappe.log_error(f"Error in get_sales_orders: {str(e)}")
        return []


def process_items(sales_orders, filters):
    """پردازش آیتم‌ها - مستقیماً از Sales Order Item"""
    items_dict = {}
    
    for row in sales_orders:
        # محاسبه مقدار باقیمانده
        pending_qty = flt(row.ordered_qty) - flt(row.delivered_qty)
        
        if pending_qty <= 0:
            continue
        
        # دریافت اطلاعات آیتم
        item_details = frappe.db.get_value(
            "Item",
            row.item_code,
            ["is_stock_item", "item_name", "stock_uom"],
            as_dict=1
        )
        
        if not item_details:
            continue
        
        # **چک اصلی: آیا این آیتم موجودی انبار داره؟**
        if item_details.is_stock_item:
            # آیتم معمولی که موجودی انبار داره
            add_to_items_dict(
                items_dict,
                row.item_code,
                row.ordered_qty,
                row.delivered_qty,
                row.sales_order
            )
        else:
            # آیتم موجودی انبار نداره
            # **تغییر اصلی: اول به Packed Items نگاه کن، بعد به Product Bundle**
            
            # 1. اول سعی کن از Packed Items بگیری
            bundle_items = get_packed_items_from_so(
                row.sales_order,
                row.item_code,
                row.ordered_qty,
                row.delivered_qty
            )
            
            # 2. اگه Packed Items نداشت، به Product Bundle نگاه کن
            if not bundle_items:
                has_bundle = frappe.db.exists("Product Bundle", row.item_code)
                
                if has_bundle:
                    bundle_items = expand_product_bundle(
                        row.item_code,
                        row.ordered_qty,
                        row.delivered_qty
                    )
            
            # 3. اگه هیچکدوم نداشت، رد میشه (نه packed items، نه product bundle)
            if bundle_items:
                # اضافه کردن اجزای بسته به لیست
                for bundle_item in bundle_items:
                    # پردازش بازگشتی برای هر جزء
                    process_single_item(
                        items_dict,
                        bundle_item["item_code"],
                        bundle_item["ordered_qty"],
                        bundle_item["delivered_qty"],
                        row.sales_order
                    )
    
    return items_dict


def process_single_item(items_dict, item_code, ordered_qty, delivered_qty, sales_order):
    """پردازش یک آیتم - با چک کردن اینکه stock item هست یا بسته"""
    
    # دریافت اطلاعات آیتم
    item_details = frappe.db.get_value(
        "Item",
        item_code,
        ["is_stock_item"],
        as_dict=1
    )
    
    if not item_details:
        return
    
    # اگر stock item هست، مستقیماً اضافه کن
    if item_details.is_stock_item:
        add_to_items_dict(
            items_dict,
            item_code,
            ordered_qty,
            delivered_qty,
            sales_order
        )
    else:
        # اگر stock نیست، چک کن ببین خودش بسته هست یا نه
        has_bundle = frappe.db.exists("Product Bundle", item_code)
        
        if has_bundle:
            # باز کردن این بسته (تو در تو)
            sub_bundle_items = expand_product_bundle(
                item_code,
                ordered_qty,
                delivered_qty
            )
            
            # پردازش بازگشتی برای هر جزء
            for sub_item in sub_bundle_items:
                process_single_item(
                    items_dict,
                    sub_item["item_code"],
                    sub_item["ordered_qty"],
                    sub_item["delivered_qty"],
                    sales_order
                )


def get_packed_items_from_so(sales_order, parent_item, ordered_qty, delivered_qty):
    """دریافت آیتم‌های بسته شده از جدول Packed Item"""
    
    packed_items = frappe.db.sql("""
        SELECT 
            item_code,
            qty as bundle_qty,
            parent_item
        FROM 
            `tabPacked Item`
        WHERE 
            parent = %s
            AND parent_item = %s
    """, (sales_order, parent_item), as_dict=1)
    
    if not packed_items:
        return []
    
    result = []
    
    for packed_item in packed_items:
        # محاسبه مقادیر
        component_ordered = flt(packed_item.bundle_qty) * flt(ordered_qty)
        component_delivered = flt(packed_item.bundle_qty) * flt(delivered_qty)
        
        # اضافه کردن به نتیجه
        # توجه: process_single_item خودش چک می‌کنه که stock item هست یا بسته
        result.append({
            "item_code": packed_item.item_code,
            "ordered_qty": component_ordered,
            "delivered_qty": component_delivered
        })
    
    return result


def expand_product_bundle(bundle_item_code, ordered_qty, delivered_qty):
    """باز کردن بسته محصول از Product Bundle (fallback)"""
    
    components = frappe.db.sql("""
        SELECT 
            item_code,
            qty
        FROM 
            `tabProduct Bundle Item`
        WHERE 
            parent = %s
    """, bundle_item_code, as_dict=1)
    
    if not components:
        return []
    
    bundle_items = []
    
    for component in components:
        # محاسبه مقادیر
        component_ordered = flt(component.qty) * flt(ordered_qty)
        component_delivered = flt(component.qty) * flt(delivered_qty)
        
        # اضافه کردن (چک کردن stock/bundle توسط process_single_item انجام میشه)
        bundle_items.append({
            "item_code": component.item_code,
            "ordered_qty": component_ordered,
            "delivered_qty": component_delivered
        })
    
    return bundle_items


def add_to_items_dict(items_dict, item_code, ordered_qty, delivered_qty, sales_order):
    """اضافه کردن آیتم به دیکشنری با جمع زدن مقادیر"""
    pending_qty = flt(ordered_qty) - flt(delivered_qty)
    
    # فقط اگر مقدار باقی‌مانده داشت اضافه کن
    if pending_qty <= 0:
        return
    
    if item_code not in items_dict:
        item_details = frappe.db.get_value(
            "Item",
            item_code,
            ["item_name", "stock_uom"],
            as_dict=1
        )
        
        items_dict[item_code] = {
            "item_code": item_code,
            "item_name": item_details.item_name if item_details else item_code,
            "uom": item_details.stock_uom if item_details else "Nos",
            "total_ordered": 0,
            "total_delivered": 0,
            "pending_qty": 0,
            "sales_orders": set()
        }
    
    items_dict[item_code]["total_ordered"] += flt(ordered_qty)
    items_dict[item_code]["total_delivered"] += flt(delivered_qty)
    items_dict[item_code]["pending_qty"] += pending_qty
    items_dict[item_code]["sales_orders"].add(sales_order)


def calculate_stock_and_production(items_dict, filters):
    """محاسبه موجودی انبار و نیاز به تولید"""
    final_data = []
    
    warehouse = filters.get("warehouse")
    
    for item_code, item_data in items_dict.items():
        # دریافت موجودی انبار
        if warehouse:
            available_stock = get_stock_qty(item_code, warehouse)
        else:
            # اگر انبار انتخاب نشده، از همه انبارها موجودی بگیر
            available_stock = get_total_stock_qty(item_code)
        
        # محاسبه نیاز به تولید
        need_to_produce = max(0, flt(item_data["pending_qty"]) - flt(available_stock))
        
        # تبدیل set به string برای نمایش
        sales_orders_str = ", ".join(sorted(item_data["sales_orders"]))
        
        final_data.append({
            "item_code": item_data["item_code"],
            "item_name": item_data["item_name"],
            "uom": item_data["uom"],
            "total_ordered": item_data["total_ordered"],
            "total_delivered": item_data["total_delivered"],
            "pending_qty": item_data["pending_qty"],
            "available_stock": available_stock,
            "need_to_produce": need_to_produce,
            "sales_orders": sales_orders_str
        })
    
    # مرتب‌سازی براساس مقدار باقی‌مانده (نزولی)
    final_data.sort(key=lambda x: x["pending_qty"], reverse=True)
    
    return final_data


def get_stock_qty(item_code, warehouse):
    """دریافت موجودی یک انبار مشخص"""
    return flt(frappe.db.get_value(
        "Bin",
        {"item_code": item_code, "warehouse": warehouse},
        "actual_qty"
    ) or 0)


def get_total_stock_qty(item_code):
    """دریافت موجودی کل از همه انبارها"""
    result = frappe.db.sql("""
        SELECT 
            SUM(actual_qty) as total_qty
        FROM 
            `tabBin`
        WHERE 
            item_code = %s
    """, item_code)
    
    return flt(result[0][0] if result else 0)


@frappe.whitelist()
def create_stock_reconciliations(filters):
    """ایجاد یک Stock Reconciliation واحد برای همه آیتم‌های باقیمانده از گزارش"""
    import json
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    warehouse = filters.get("warehouse")
    
    if not warehouse:
        frappe.throw(_("Please select a warehouse"))
    
    # استفاده از همان لوجیک گزارش برای دریافت داده‌ها
    data = get_data(filters)
    
    if not data:
        frappe.throw(_("No pending items found in report"))
    
    # جمع‌آوری همه آیتم‌های باقیمانده از داده‌های گزارش
    items_to_reconcile = []
    sales_orders_list = set()
    
    for row in data:
        pending_qty = flt(row.get("pending_qty", 0))
        
        # فقط آیتم‌هایی که مقدار باقیمانده دارند
        if pending_qty > 0:
            items_to_reconcile.append({
                "item_code": row["item_code"],
                "qty": pending_qty,
                "uom": row["uom"]
            })
            
            # جمع‌آوری سفارش‌های فروش
            if row.get("sales_orders"):
                so_list = [so.strip() for so in row["sales_orders"].split(",")]
                sales_orders_list.update(so_list)
    
    if not items_to_reconcile:
        frappe.throw(_("No items with pending quantity found"))
    
    # ایجاد یک Stock Reconciliation واحد
    try:
        sr = create_single_stock_reconciliation(
            items_to_reconcile,
            warehouse,
            list(sales_orders_list),
            filters.get("company")
        )
        
        return {
            "created_count": 1,
            "reconciliations": [{
                "name": sr.name,
                "sales_orders": ", ".join(sorted(sales_orders_list)),
                "items": items_to_reconcile
            }],
            "skipped_sales_orders": []
        }
    except Exception as e:
        frappe.log_error(f"Error creating Stock Reconciliation: {str(e)}")
        frappe.throw(_("Error creating Stock Reconciliation: {0}").format(str(e)))


def create_single_stock_reconciliation(items, warehouse, sales_orders, company=None):
    """ایجاد یک Stock Reconciliation واحد برای همه آیتم‌ها"""
    
    # ایجاد Stock Reconciliation
    sr = frappe.new_doc("Stock Reconciliation")
    sr.purpose = "Stock Reconciliation"
    sr.posting_date = frappe.utils.today()
    sr.posting_time = frappe.utils.nowtime()
    sr.set_posting_time = 1
    sr.company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
    
    # اضافه کردن آیتم‌ها
    for item in items:
        # تعیین انبار بر اساس نام آیتم
        item_name = frappe.db.get_value("Item", item["item_code"], "item_name") or item["item_code"]
        
        # اگر "پارچه" در نام آیتم باشد، از انبار پارچه استفاده کن
        if "پارچه" in item_name or "پارچه" in item["item_code"]:
            item_warehouse = "انبار پارچه - Den"
        else:
            # در غیر این صورت از انبار محصولات تمام شده استفاده کن
            item_warehouse = "محصولات تمام شده - Den"
        
        # دریافت موجودی فعلی
        current_qty = get_stock_qty(item["item_code"], item_warehouse)
        
        # محاسبه موجودی جدید (فعلی + باقیمانده)
        new_qty = flt(current_qty) + flt(item["qty"])
        
        # دریافت valuation rate
        valuation_rate = frappe.db.get_value(
            "Stock Ledger Entry",
            {
                "item_code": item["item_code"],
                "warehouse": item_warehouse
            },
            "valuation_rate",
            order_by="posting_date desc, posting_time desc"
        )
        
        if not valuation_rate or flt(valuation_rate) <= 0:
            valuation_rate = frappe.db.get_value("Item", item["item_code"], "valuation_rate")
        
        if not valuation_rate or flt(valuation_rate) <= 0:
            valuation_rate = frappe.db.get_value("Item", item["item_code"], "standard_rate")
        
        if not valuation_rate or flt(valuation_rate) <= 0:
            valuation_rate = 1.0
        
        valuation_rate = flt(valuation_rate)
        
        sr.append("items", {
            "item_code": item["item_code"],
            "warehouse": item_warehouse,
            "qty": new_qty,
            "valuation_rate": valuation_rate,
            "current_qty": current_qty,
            "current_valuation_rate": valuation_rate
        })
    
    if not sr.items:
        frappe.throw(_("No items to reconcile"))
    
    # ذخیره در حالت Draft (بدون submit)
    sr.insert(ignore_permissions=True)
    
    # اضافه کامنت بعد از insert
    so_list = ", ".join(sales_orders[:5])
    if len(sales_orders) > 5:
        so_list += f" و {len(sales_orders) - 5} سفارش دیگر"
    
    sr.add_comment(
        "Comment",
        f"تطبیق انبار برای سفارش‌های فروش: {so_list}<br>تعداد آیتم: {len(items)}"
    )
    
    frappe.db.commit()
    
    return sr