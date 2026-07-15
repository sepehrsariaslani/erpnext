# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors

import frappe
from frappe import _

from erpnext.regional.iran.memorandum_accounts import has_memorandum_field


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if not has_memorandum_field():
		frappe.throw(_("Memorandum Accounting fields are not available yet. Please run bench migrate."))

	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"label": _("Posting Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Journal Entry"),
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 180,
		},
		{
			"label": _("Voucher Type"),
			"fieldname": "voucher_type",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Account"),
			"fieldname": "account",
			"fieldtype": "Link",
			"options": "Account",
			"width": 260,
		},
		{
			"label": _("Memo Mirror Account"),
			"fieldname": "mirror_account",
			"fieldtype": "Link",
			"options": "Account",
			"width": 260,
		},
		{
			"label": _("Debit"),
			"fieldname": "debit",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 140,
		},
		{
			"label": _("Credit"),
			"fieldname": "credit",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 140,
		},
		{
			"label": _("Remarks"),
			"fieldname": "remarks",
			"fieldtype": "Small Text",
			"width": 320,
		},
		{
			"label": _("Currency"),
			"fieldname": "currency",
			"fieldtype": "Link",
			"options": "Currency",
			"hidden": 1,
		},
	]


def get_data(filters):
	conditions = ["gle.is_cancelled = 0", "ifnull(acc.is_memorandum, 0) = 1"]
	query_filters = {}

	if filters.get("company"):
		conditions.append("gle.company = %(company)s")
		query_filters["company"] = filters.company

	if filters.get("from_date"):
		conditions.append("gle.posting_date >= %(from_date)s")
		query_filters["from_date"] = filters.from_date

	if filters.get("to_date"):
		conditions.append("gle.posting_date <= %(to_date)s")
		query_filters["to_date"] = filters.to_date

	if filters.get("account"):
		conditions.append("gle.account = %(account)s")
		query_filters["account"] = filters.account

	if filters.get("party"):
		conditions.append("gle.party = %(party)s")
		query_filters["party"] = filters.party

	query = f"""
		select
			gle.posting_date,
			gle.voucher_no,
			gle.voucher_type,
			gle.account,
			acc.memorandum_mirror_account as mirror_account,
			gle.debit,
			gle.credit,
			gle.remarks,
			gle.account_currency as currency
		from `tabGL Entry` gle
		inner join `tabAccount` acc on acc.name = gle.account
		where {' and '.join(conditions)}
		order by gle.posting_date desc, gle.voucher_no desc, gle.creation desc
	"""
	return frappe.db.sql(query, query_filters, as_dict=True)

