// Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors

frappe.query_reports["Memorandum Guarantee Status"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1,
		},
		{
			fieldname: "party",
			label: __("Party"),
			fieldtype: "Data",
		},
	],
};

