# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors

import frappe
from frappe import _
from frappe.utils import flt

from erpnext.regional.iran.memorandum_accounts import has_memorandum_field

GUARANTEE_ACCOUNTS = (
	"ضمانت‌نامه‌های دریافتی از دیگران",
	"اسناد تضمینی نزد دیگران (ضمانت‌نامه‌های صادره)",
)


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
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 180,
		},
		{
			"label": _("Account"),
			"fieldname": "account",
			"fieldtype": "Link",
			"options": "Account",
			"width": 260,
		},
		{
			"label": _("Mirror Account"),
			"fieldname": "mirror_account",
			"fieldtype": "Link",
			"options": "Account",
			"width": 260,
		},
		{
			"label": _("Party"),
			"fieldname": "party",
			"fieldtype": "Dynamic Link",
			"options": "party_type",
			"width": 180,
		},
		{
			"label": _("Party Type"),
			"fieldname": "party_type",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("Net Outstanding"),
			"fieldname": "net_balance",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 150,
		},
		{
			"label": _("Debit"),
			"fieldname": "debit",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 130,
		},
		{
			"label": _("Credit"),
			"fieldname": "credit",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 130,
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
	query_filters = {"guarantee_accounts": GUARANTEE_ACCOUNTS}
	conditions = [
		"gle.is_cancelled = 0",
		"ifnull(acc.is_memorandum, 0) = 1",
		"acc.account_name in %(guarantee_accounts)s",
	]

	if filters.get("company"):
		conditions.append("gle.company = %(company)s")
		query_filters["company"] = filters.company

	if filters.get("party"):
		conditions.append("gle.party = %(party)s")
		query_filters["party"] = filters.party

	rows = frappe.db.sql(
		f"""
		select
			gle.company,
			gle.account,
			acc.memorandum_mirror_account as mirror_account,
			gle.party_type,
			gle.party,
			sum(gle.debit) as debit,
			sum(gle.credit) as credit,
			gle.account_currency as currency
		from `tabGL Entry` gle
		inner join `tabAccount` acc on acc.name = gle.account
		where {' and '.join(conditions)}
		group by gle.company, gle.account, acc.memorandum_mirror_account, gle.party_type, gle.party, gle.account_currency
		order by gle.company, gle.account, gle.party_type, gle.party
	""",
		query_filters,
		as_dict=True,
	)

	for row in rows:
		row["debit"] = flt(row.get("debit"))
		row["credit"] = flt(row.get("credit"))
		row["net_balance"] = flt(row["debit"] - row["credit"])
	return rows

