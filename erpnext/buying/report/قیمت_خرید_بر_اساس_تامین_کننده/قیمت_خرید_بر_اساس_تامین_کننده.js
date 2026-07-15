// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["قیمت خرید بر اساس تامین کننده"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": "از تاریخ",
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -24),
			"reqd": 0
		},
		{
			"fieldname": "to_date",
			"label": "تا تاریخ",
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 0
		},
		{
			"fieldname": "item_code",
			"label": "کالا",
			"fieldtype": "Link",
			"options": "Item",
			"reqd": 0
		},
		{
			"fieldname": "supplier",
			"label": "تأمین‌کننده",
			"fieldtype": "Link", 
			"options": "Supplier",
			"reqd": 0
		}
	]
};
