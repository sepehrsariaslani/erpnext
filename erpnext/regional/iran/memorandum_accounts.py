from __future__ import annotations

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import flt

from erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts import create_charts

MEMORANDUM_ROOT = "حساب‌های انتظامی"
MEMORANDUM_CONTROL_GROUP = "حساب انتظامی طرف حساب"
MEMORANDUM_COUNTER_GROUP = "طرف حساب انتظامی"

MEMORANDUM_ACCOUNT_PAIRS = (
	("ضمانت‌نامه‌های دریافتی از دیگران", "طرف حساب ضمانت‌نامه‌های دریافتی"),
	("اسناد تضمینی نزد دیگران (ضمانت‌نامه‌های صادره)", "طرف حساب اسناد تضمینی نزد دیگران"),
	("تعهدات اشخاص بابت اعتبارات اسنادی گشایش شده", "طرف حساب تعهدات اشخاص بابت اعتبارات اسنادی"),
	("کالای امانی ما نزد دیگران", "طرف حساب کالای امانی ما نزد دیگران"),
	("کالای امانی دیگران نزد ما", "طرف حساب کالای امانی دیگران نزد ما"),
	("قراردادهای منعقده سرمایه‌ای و جاری", "طرف حساب قراردادهای منعقده"),
)


def ensure_memorandum_account_custom_fields():
	"""Create the Account fields used by Iran memorandum accounting."""
	custom_fields = [
		{
			"fieldname": "memorandum_accounting_section",
			"label": "Memorandum Accounting",
			"fieldtype": "Section Break",
			"insert_after": "account_type",
			"collapsible": 1,
		},
		{
			"fieldname": "is_memorandum",
			"label": "Memorandum Account",
			"fieldtype": "Check",
			"insert_after": "memorandum_accounting_section",
			"default": "0",
			"in_list_view": 1,
			"in_standard_filter": 1,
			"description": "Off-balance sheet informational / control account.",
		},
		{
			"fieldname": "memorandum_mirror_account",
			"label": "Mirror Memorandum Account",
			"fieldtype": "Link",
			"insert_after": "is_memorandum",
			"options": "Account",
			"description": "Counterpart account used to balance memorandum entries.",
		},
	]

	existing_fields = {df.fieldname for df in frappe.get_meta("Account", cached=False).get("fields")}
	pending_fields = [field for field in custom_fields if field["fieldname"] not in existing_fields]
	if pending_fields:
		create_custom_fields({"Account": pending_fields}, update=True)


def ensure_standard_and_memorandum_accounts(doc, method=None):
	"""Keep a complete standard chart ahead of Iran memorandum accounts."""
	company = doc.name if getattr(doc, "doctype", None) == "Company" else doc
	if not company or not is_iran_company(company):
		return

	ensure_memorandum_account_custom_fields()
	if not has_standard_accounts(company):
		if has_accounting_history(company):
			frappe.log_error(
				f"Company: {company}",
				"Iran Company Chart Repair Requires Review",
			)
			return
		create_standard_chart(company)

	setup_memorandum_accounts_for_company(company)


def has_standard_accounts(company):
	return bool(frappe.db.exists("Account", {"company": company, "is_memorandum": 0}))


def has_accounting_history(company):
	return bool(
		frappe.db.exists("GL Entry", {"company": company})
		or frappe.db.exists("Stock Ledger Entry", {"company": company})
	)


def create_standard_chart(company):
	"""Repair a blank or memorandum-only company with ERPNext's Standard chart."""
	if has_standard_accounts(company):
		return

	ensure_standard_account_categories()
	frappe.local.flags.ignore_root_company_validation = True
	create_charts(company, "Standard")

	company_doc = frappe.get_doc("Company", company)
	company_doc.update_default_account = True
	company_doc.db_set(
		"default_receivable_account",
		frappe.db.get_value("Account", {"company": company, "account_type": "Receivable", "is_group": 0}),
	)
	company_doc.db_set(
		"default_payable_account",
		frappe.db.get_value("Account", {"company": company, "account_type": "Payable", "is_group": 0}),
	)
	company_doc.set_default_accounts()


def ensure_standard_account_categories():
	"""Install the categories referenced by ERPNext's Standard chart when missing."""
	from erpnext.accounts.doctype.account_category.account_category import import_account_categories

	import_account_categories(frappe.get_app_path("erpnext", "accounts", "financial_report_template"))


def repair_incomplete_iran_company(company):
	"""Repair a memorandum-only Iran company that has no accounting history."""
	if not is_iran_company(company) or has_standard_accounts(company):
		return False
	if has_accounting_history(company):
		frappe.throw(
			_("Cannot automatically rebuild the chart of accounts after accounting or stock entries exist.")
		)

	ensure_standard_and_memorandum_accounts(company)
	return True


def setup_memorandum_accounts_for_all_iran_companies():
	ensure_memorandum_account_custom_fields()
	for company in frappe.get_all("Company", pluck="name"):
		ensure_standard_and_memorandum_accounts(company)


def setup_memorandum_accounts_for_company(company):
	if not is_iran_company(company):
		return

	root = _ensure_account(company, MEMORANDUM_ROOT, None, 1)
	control_group = _ensure_account(company, MEMORANDUM_CONTROL_GROUP, root, 1)
	counter_group = _ensure_account(company, MEMORANDUM_COUNTER_GROUP, root, 1)

	mirror_links = {}
	for control_name, counter_name in MEMORANDUM_ACCOUNT_PAIRS:
		control_account = _ensure_account(company, control_name, control_group, 0)
		counter_account = _ensure_account(company, counter_name, counter_group, 0)
		mirror_links[control_account] = counter_account
		mirror_links[counter_account] = control_account

	for account, mirror_account in mirror_links.items():
		if frappe.db.get_value("Account", account, "memorandum_mirror_account") != mirror_account:
			frappe.db.set_value("Account", account, "memorandum_mirror_account", mirror_account, update_modified=False)


def validate_memorandum_journal_entry(doc, method=None):
	if not doc.company or not is_iran_company(doc.company):
		return

	account_names = [row.account for row in doc.get("accounts") if row.account]
	if not account_names:
		return

	accounts = {
		row.name: row
		for row in frappe.get_all(
			"Account",
			filters={"name": ["in", account_names]},
			fields=["name", "is_memorandum", "memorandum_mirror_account"],
		)
	}
	memo_totals = {"debit": 0.0, "credit": 0.0}
	account_totals = {}
	for row in doc.get("accounts"):
		if not row.account or not accounts.get(row.account, {}).get("is_memorandum"):
			continue
		memo_totals["debit"] += flt(row.debit)
		memo_totals["credit"] += flt(row.credit)
		account_totals.setdefault(row.account, {"debit": 0.0, "credit": 0.0})
		account_totals[row.account]["debit"] += flt(row.debit)
		account_totals[row.account]["credit"] += flt(row.credit)

	if not memo_totals["debit"] and not memo_totals["credit"]:
		return
	if round(memo_totals["debit"] - memo_totals["credit"], 6) != 0:
		frappe.throw(_("Memorandum accounts are not balanced in this Journal Entry."))

	for account, totals in account_totals.items():
		mirror_account = accounts[account].memorandum_mirror_account
		if not mirror_account:
			continue
		mirror_totals = account_totals.get(mirror_account, {"debit": 0.0, "credit": 0.0})
		if round(totals["debit"] - mirror_totals["credit"], 6) != 0:
			frappe.throw(_("Memorandum mirror mismatch: account {0} must be matched by {1}.").format(account, mirror_account))
		if round(totals["credit"] - mirror_totals["debit"], 6) != 0:
			frappe.throw(_("Memorandum mirror mismatch: account {0} must be matched by {1}.").format(account, mirror_account))


def is_iran_company(company):
	country = frappe.get_cached_value("Company", company, "country")
	return country == "Iran" or frappe.get_cached_value("Country", country, "code") == "IR"


def _ensure_account(company, account_name, parent_account, is_group):
	filters = {"company": company, "account_name": account_name, "parent_account": parent_account}
	account = frappe.db.get_value("Account", filters, "name")
	if account:
		if not frappe.db.get_value("Account", account, "is_memorandum"):
			frappe.db.set_value("Account", account, "is_memorandum", 1, update_modified=False)
		return account

	account_doc = frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": account_name,
			"company": company,
			"parent_account": parent_account,
			"is_group": is_group,
			"is_memorandum": 1,
			"root_type": "Asset" if not parent_account else None,
			"report_type": "Balance Sheet" if not parent_account else None,
		}
	)
	account_doc.flags.ignore_permissions = True
	account_doc.flags.ignore_root_company_validation = True
	if not parent_account:
		account_doc.flags.ignore_mandatory = True
	account_doc.insert()
	return account_doc.name
