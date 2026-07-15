import frappe

def execute(filters=None):
    if not filters:
        filters = {}

    columns = get_columns()
    data = []

    # گرفتن سفارش‌های فروش
    sales_orders = frappe.db.get_all(
        "Sales Order",
        filters={"docstatus": 1},  # فقط سندهای ارسال شده
        fields=["name", "transaction_date", "customer", "sales_order_priority"],
        order_by="sales_order_priority asc, transaction_date desc"
    )


    for so in sales_orders:
        # آیتم‌های سفارش
        so_items = frappe.db.get_all(
            "Sales Order Item",
            filters={"parent": so.name},
            fields=["item_code", "item_name", "qty"]
        )

        for item in so_items:
            # اگر نام کالا شامل "پارچه" بود رد بشه
            if "پارچه" in (item.item_name or ""):
                continue

            # بررسی BOM مستقیم
            bom = get_active_bom(item.item_code)
            if bom:
                if not filters.get("only_without_bom"):
                    data.append([
                        so.name, so.transaction_date, so.customer, so.sales_order_priority,
                        item.item_code, item.item_name, item.qty,
                        bom, "مستقیم"
                    ])
            else:
                # بررسی در بسته محصول
                packed_items = frappe.db.get_all(
                    "Packed Item",
                    filters={"parent": so.name, "parent_item": item.item_code},
                    fields=["item_code", "qty"]
                )
                if packed_items:
                    for p in packed_items:
                        p_item_name = frappe.db.get_value("Item", p.item_code, "item_name")
                        if "پارچه" in (p_item_name or ""):
                            continue  # اگر نام کالا "پارچه" داشت نمایش نده

                        p_bom = get_active_bom(p.item_code)
                        if p_bom:
                            if not filters.get("only_without_bom"):
                                data.append([
                                    so.name, so.transaction_date, so.customer, so.sales_order_priority,
                                    p.item_code, p_item_name, p.qty,
                                    p_bom, "از بسته محصول"
                                ])
                        else:
                            if not filters.get("only_without_bom") or filters.get("only_without_bom") == 1:
                                data.append([
                                    so.name, so.transaction_date, so.customer, so.sales_order_priority,
                                    p.item_code, p_item_name, p.qty,
                                    None, "از بسته محصول"
                                ])
                else:
                    if not filters.get("only_without_bom") or filters.get("only_without_bom") == 1:
                        data.append([
                            so.name, so.transaction_date, so.customer, so.sales_order_priority,
                            item.item_code, item.item_name, item.qty,
                            None, "مستقیم"
                        ])

    return columns, data


def get_columns():
    return [
        {"label": "سفارش فروش", "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order", "width": 140},
        {"label": "تاریخ", "fieldname": "date", "fieldtype": "Date", "width": 100},
        {"label": "مشتری", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 140},
        {"label": "اولویت", "fieldname": "priority", "fieldtype": "Data", "width": 100},
        {"label": "کد کالا", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 120},
        {"label": "نام کالا", "fieldname": "item_name", "fieldtype": "Data", "width": 200},
        {"label": "تعداد", "fieldname": "qty", "fieldtype": "Float", "width": 80},
        {"label": "BOM", "fieldname": "bom", "fieldtype": "Link", "options": "BOM", "width": 150},
        {"label": "نوع بررسی", "fieldname": "source", "fieldtype": "Data", "width": 120},
    ]


def get_active_bom(item_code):
    """بررسی BOM فعال برای آیتم"""
    return frappe.db.get_value(
        "BOM",
        {"item": item_code, "is_active": 1, "is_default": 1},
        "name"
    )
