// Copyright (c) 2025, Your Company and Contributors
// License: GNU General Public License v3. See license.txt

frappe.query_reports["Item Ledger Report"] = {
	filters: [
		{
			fieldname: "company",
			label: "شرکت",
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: "از تاریخ",
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
			width: "60px",
		},
		{
			fieldname: "to_date",
			label: "تا تاریخ",
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
			width: "60px",
		},
		{
			fieldname: "account",
			label: "حساب",
			fieldtype: "MultiSelectList",
			options: "Account",
			get_data: function (txt) {
				return frappe.db.get_link_options("Account", txt, {
					company: frappe.query_report.get_filter_value("company"),
				});
			},
		},
		{
			fieldtype: "Break",
		},
		{
			fieldname: "party_type",
			label: "نوع طرف حساب",
			fieldtype: "Autocomplete",
			options: Object.keys(frappe.boot.party_account_types),
			on_change: function () {
				frappe.query_report.set_filter_value("party", []);
			},
		},
		{
			fieldname: "party",
			label: "طرف حساب",
			fieldtype: "MultiSelectList",
			options: "party_type",
			get_data: function (txt) {
				if (!frappe.query_report.filters) return;

				let party_type = frappe.query_report.get_filter_value("party_type");
				if (!party_type) return;

				return frappe.db.get_link_options(party_type, txt);
			},
			on_change: function () {
				var party_type = frappe.query_report.get_filter_value("party_type");
				var parties = frappe.query_report.get_filter_value("party");

				if (!party_type || parties.length === 0 || parties.length > 1) {
					frappe.query_report.set_filter_value("party_name", "");
					frappe.query_report.set_filter_value("tax_id", "");
					return;
				} else {
					var party = parties[0];
					var fieldname = erpnext.utils.get_party_name(party_type) || "name";
					frappe.db.get_value(party_type, party, fieldname, function (value) {
						frappe.query_report.set_filter_value("party_name", value[fieldname]);
					});

					if (party_type === "Customer" || party_type === "Supplier") {
						frappe.db.get_value(party_type, party, "tax_id", function (value) {
							frappe.query_report.set_filter_value("tax_id", value["tax_id"]);
						});
					}
				}
			},
		},
		{
			fieldname: "party_name",
			label: "نام طرف حساب",
			fieldtype: "Data",
			hidden: 1,
		},
		{
			fieldname: "tax_id",
			label: "شناسه مالیاتی",
			fieldtype: "Data",
			hidden: 1,
		},
		{
			fieldname: "presentation_currency",
			label: "واحد پول",
			fieldtype: "Select",
			options: erpnext.get_presentation_currency_list(),
		},
		{
			fieldname: "cost_center",
			label: "مرکز هزینه",
			fieldtype: "MultiSelectList",
			options: "Cost Center",
			get_data: function (txt) {
				return frappe.db.get_link_options("Cost Center", txt, {
					company: frappe.query_report.get_filter_value("company"),
				});
			},
		},
		{
			fieldname: "project",
			label: "پروژه",
			fieldtype: "MultiSelectList",
			options: "Project",
			get_data: function (txt) {
				return frappe.db.get_link_options("Project", txt, {
					company: frappe.query_report.get_filter_value("company"),
				});
			},
		},
		{
			fieldname: "include_dimensions",
			label: "در نظر گیری ابعاد حسابداری",
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "show_opening_entries",
			label: "نمایش ردیف های افتتاحیه",
			fieldtype: "Check",
		},
		{
			fieldname: "show_cancelled_entries",
			label: "نمایش ردیف های کنسل شده",
			fieldtype: "Check",
		},
		{
			fieldname: "show_remarks",
			label: "نمایش توضیحات",
			fieldtype: "Check",
			default: 1,
		},
	],
	
	// Format function for better display
	formatter: function(value, row, column, data, default_formatter) {
		// Apply special formatting for different row types
		if (data && data.row_type === "item") {
			// Item rows should be slightly indented and different color
			if (column.fieldname === "party_display") {
				return '<span style="padding-left: 20px; color: #666;">└─ ' + (value || '') + '</span>';
			}
		}
		
		if (data && data.row_type === "voucher") {
			// Voucher rows should be bold
			if (["debit", "credit", "balance"].includes(column.fieldname)) {
				return '<strong>' + default_formatter(value, row, column, data) + '</strong>';
			}
		}
		
		if (data && data.row_type === "opening") {
			// Opening balance row should be highlighted
			return '<strong style="color: #2e7d32;">' + default_formatter(value, row, column, data) + '</strong>';
		}
		
		return default_formatter(value, row, column, data);
	},
	
	// Tree view settings
	tree: false,
	name_field: "reference",
	parent_field: "parent_row",
	initial_depth: 2,
};

// Add dimensions to the report
if (typeof erpnext !== 'undefined' && erpnext.utils && erpnext.utils.add_dimensions) {
	erpnext.utils.add_dimensions("Item Ledger Report", 15);
}