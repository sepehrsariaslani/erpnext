// Copyright (c) 2024, Your Company and contributors
// For license information, please see license.txt

frappe.query_reports["Pending SO Items For Purchase Request"] = {
    "filters": [
        {
            "fieldname": "customer",
            "label": __("Customer"),
            "fieldtype": "Link",
            "options": "Customer",
            "reqd": 0
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        },
        {
            "fieldname": "warehouse",
            "label": __("Warehouse"),
            "fieldtype": "Link",
            "options": "Warehouse",
            "get_query": function() {
                return {
                    filters: {
                        "is_group": 0
                    }
                }
            },
            "on_change": function(query_report) {
                // Auto-refresh on warehouse change
            }
        },
        {
            "fieldname": "company",
            "label": __("Company"),
            "fieldtype": "Link",
            "options": "Company",
            "default": frappe.defaults.get_user_default("Company")
        }
    ],
    
    "formatter": function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        
        // رنگ‌آمیزی ستون‌ها
        if (column.fieldname == "pending_qty" && data && data.pending_qty > 0) {
            value = `<span style="color: #d9534f; font-weight: bold;">${value}</span>`;
        }
        
        if (column.fieldname == "need_to_produce" && data && data.need_to_produce > 0) {
            value = `<span style="color: #f0ad4e; font-weight: bold;">${value}</span>`;
        }
        
        if (column.fieldname == "available_stock" && data && data.available_stock > 0) {
            value = `<span style="color: #5cb85c; font-weight: bold;">${value}</span>`;
        }
        
        return value;
    },
    
    "onload": function(report) {
        // اضافه کردن دکمه‌های سفارشی
        report.page.add_inner_button(__("Create Stock Reconciliations"), function() {
            create_stock_reconciliations(report);
        }, __("Create"));
        
        report.page.add_inner_button(__("Create Work Orders"), function() {
            create_work_orders(report);
        }, __("Create"));
        
        report.page.add_inner_button(__("Export to Excel"), function() {
            report.export_report();
        });
    }
};

function create_stock_reconciliations(report) {
    let filters = report.get_values();
    
    // اگر انبار انتخاب نشده، از انبار پیش‌فرض استفاده کن
    if (!filters.warehouse) {
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Stock Settings",
                filters: {},
                fieldname: "default_warehouse"
            },
            async: false,
            callback: function(r) {
                if (r.message && r.message.default_warehouse) {
                    filters.warehouse = r.message.default_warehouse;
                }
            }
        });
        
        if (!filters.warehouse) {
            frappe.msgprint(__("لطفا ابتدا انبار را انتخاب کنید یا انبار پیش‌فرض را در تنظیمات انبار تعیین کنید"));
            return;
        }
    }
    
    // تأیید از کاربر
    frappe.confirm(
        __("آیا می‌خواهید تطبیق انبار برای آیتم‌های باقیمانده ایجاد شود؟<br>یک تطبیق انبار واحد برای همه آیتم‌ها ساخته می‌شود."),
        function() {
            frappe.call({
                method: "erpnext.selling.report.pending_so_items_for_purchase_request.pending_so_items_for_purchase_request.create_stock_reconciliations",
                args: {
                    filters: filters
                },
                freeze: true,
                freeze_message: __("در حال ایجاد تطبیق انبار..."),
                callback: function(r) {
                    if (r.message) {
                        let msg = r.message;
                        let rec = msg.reconciliations[0];
                        
                        let message_html = `
                            <div style="padding: 15px;">
                                <p style="font-size: 1.1em; margin-bottom: 15px;">
                                    <strong>تطبیق انبار با موفقیت ایجاد شد!</strong>
                                </p>
                                <p style="margin: 10px 0;">
                                    📦 <a href="/app/stock-reconciliation/${rec.name}" target="_blank" style="font-size: 1.1em; font-weight: bold;">${rec.name}</a>
                                </p>
                                <p style="color: #666; margin: 5px 0;">
                                    تعداد آیتم: <strong>${rec.items.length}</strong>
                                </p>
                        `;
                        
                        if (rec.items && rec.items.length > 0) {
                            message_html += '<div style="margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 5px;">';
                            message_html += '<p style="font-weight: bold; margin-bottom: 8px;">آیتم‌ها:</p>';
                            message_html += '<ul style="margin: 0; padding-left: 20px;">';
                            rec.items.forEach(item => {
                                message_html += `<li style="margin: 5px 0;">${item.item_code}: <strong>${item.qty}</strong> ${item.uom}</li>`;
                            });
                            message_html += '</ul></div>';
                        }
                        
                        if (rec.sales_orders) {
                            message_html += `<p style="margin-top: 10px; color: #666; font-size: 0.9em;">سفارش‌ها: ${rec.sales_orders}</p>`;
                        }
                        
                        message_html += '</div>';
                        
                        frappe.msgprint({
                            title: __("تطبیق انبار ایجاد شد"),
                            message: message_html,
                            indicator: "green",
                            primary_action: {
                                label: __("Refresh Report"),
                                action: function() {
                                    report.refresh();
                                }
                            }
                        });
                    }
                },
                error: function(r) {
                    frappe.msgprint({
                        title: __("خطا"),
                        message: r.message || __("خطا در ایجاد تطبیق انبار"),
                        indicator: "red"
                    });
                }
            });
        }
    );
}

function create_work_orders(report) {
    let filters = report.get_values();
    
    if (!filters.customer) {
        frappe.msgprint(__("Please select a customer first"));
        return;
    }
    
    frappe.call({
        method: "erpnext.selling.report.pending_so_items_for_purchase_request.pending_so_items_for_purchase_request.create_work_orders",
        args: {
            filters: filters,
            data: report.data
        },
        callback: function(r) {
            if (r.message) {
                frappe.msgprint({
                    title: __("Work Orders Created"),
                    message: __("Successfully created {0} Work Orders", [r.message]),
                    indicator: "green"
                });
                report.refresh();
            }
        }
    });
}