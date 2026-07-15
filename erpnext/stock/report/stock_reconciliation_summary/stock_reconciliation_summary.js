// فایل: erpnext/stock/report/stock_reconciliation_summary/stock_reconciliation_summary.js

frappe.query_reports["Stock Reconciliation Summary"] = {
    "filters": [
        {
            "fieldname": "from_date",
            "label": __("از تاریخ"),
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -3)
        },
        {
            "fieldname": "to_date",
            "label": __("تا تاریخ"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today()
        },
        {
            "fieldname": "warehouse",
            "label": __("انبار"),
            "fieldtype": "Link",
            "options": "Warehouse"
        },
        {
            "fieldname": "item_code",
            "label": __("کد کالا"),
            "fieldtype": "Link",
            "options": "Item"
        }
    ],
    
    "onload": function(report) {
        // دکمه ایجاد تطبیق صفرسازی
        report.page.add_inner_button(__('ایجاد تطبیق صفرسازی'), function() {
            create_zero_reconciliation(report);
        });
    }
};

function create_zero_reconciliation(report) {
    let data = report.data;
    
    if (!data || data.length === 0) {
        frappe.msgprint(__('هیچ داده‌ای برای صفرسازی وجود ندارد'));
        return;
    }
    
    // فیلتر کالاهایی که موجودی دارند
    let items_with_stock = data.filter(row => row.current_qty > 0);
    
    if (items_with_stock.length === 0) {
        frappe.msgprint(__('هیچ کالایی با موجودی وجود ندارد'));
        return;
    }
    
    // نمایش دیالوگ
    let dialog = new frappe.ui.Dialog({
        title: __('ایجاد تطبیق انبار صفرسازی'),
        size: 'large',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: __('شرکت'),
                options: 'Company',
                default: frappe.defaults.get_user_default('Company'),
                reqd: 1
            },
            {
                fieldname: 'posting_date',
                fieldtype: 'Date',
                label: __('تاریخ تطبیق'),
                default: frappe.datetime.get_today(),
                reqd: 1
            },
            {
                fieldname: 'posting_time',
                fieldtype: 'Time',
                label: __('زمان تطبیق'),
                default: frappe.datetime.now_time(),
                reqd: 1
            },
            {
                fieldname: 'col_break_1',
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'expense_account',
                fieldtype: 'Link',
                label: __('حساب هزینه'),
                options: 'Account',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            'is_group': 0,
                            'company': dialog.get_value('company'),
                            'account_type': 'Expense Account'
                        }
                    };
                }
            },
            {
                fieldname: 'cost_center',
                fieldtype: 'Link',
                label: __('مرکز هزینه'),
                options: 'Cost Center',
                get_query: function() {
                    return {
                        filters: {
                            'is_group': 0,
                            'company': dialog.get_value('company')
                        }
                    };
                }
            },
            {
                fieldname: 'section_break_1',
                fieldtype: 'Section Break',
                label: __('انتخاب کالاها')
            },
            {
                fieldname: 'select_all',
                fieldtype: 'Check',
                label: __('انتخاب همه'),
                default: 0,
                onchange: function() {
                    let checked = dialog.get_value('select_all');
                    dialog.$wrapper.find('.item-checkbox').prop('checked', checked);
                }
            },
            {
                fieldname: 'items_html',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: __('ایجاد تطبیق'),
        primary_action: function(values) {
            create_stock_reconciliation_doc(values, dialog);
        }
    });
    
    // ساخت جدول کالاها
    let items_html = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="table table-bordered table-hover">
                <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                    <tr>
                        <th style="width: 50px;">انتخاب</th>
                        <th>کد کالا</th>
                        <th>نام کالا</th>
                        <th>انبار</th>
                        <th>موجودی فعلی</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    items_with_stock.forEach((row, index) => {
        items_html += `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="item-checkbox" 
                        data-item-code="${row.item_code}" 
                        data-warehouse="${row.warehouse}"
                        data-current-qty="${row.current_qty}">
                </td>
                <td>${row.item_code}</td>
                <td>${row.item_name || ''}</td>
                <td>${row.warehouse}</td>
                <td style="text-align: right;">${row.current_qty}</td>
            </tr>
        `;
    });
    
    items_html += `
                </tbody>
            </table>
        </div>
    `;
    
    dialog.fields_dict.items_html.$wrapper.html(items_html);
    dialog.show();
}

function create_stock_reconciliation_doc(values, dialog) {
    let selected_items = [];
    
    dialog.$wrapper.find('.item-checkbox:checked').each(function() {
        selected_items.push({
            item_code: $(this).data('item-code'),
            warehouse: $(this).data('warehouse'),
            qty: 0,  // صفر کردن موجودی
            current_qty: $(this).data('current-qty')
        });
    });
    
    if (selected_items.length === 0) {
        frappe.msgprint(__('لطفاً حداقل یک کالا انتخاب کنید'));
        return;
    }
    
    frappe.call({
        method: 'frappe.client.insert',
        args: {
            doc: {
                doctype: 'Stock Reconciliation',
                company: values.company,
                posting_date: values.posting_date,
                posting_time: values.posting_time,
                purpose: 'Stock Reconciliation',
                expense_account: values.expense_account,
                cost_center: values.cost_center,
                items: selected_items
            }
        },
        callback: function(r) {
            if (r.message) {
                frappe.msgprint({
                    title: __('موفق'),
                    message: __('تطبیق انبار با موفقیت ایجاد شد'),
                    indicator: 'green'
                });
                dialog.hide();
                // باز کردن سند جدید
                frappe.set_route('Form', 'Stock Reconciliation', r.message.name);
            }
        },
        error: function(r) {
            frappe.msgprint({
                title: __('خطا'),
                message: __('خطا در ایجاد تطبیق انبار'),
                indicator: 'red'
            });
        }
    });
}