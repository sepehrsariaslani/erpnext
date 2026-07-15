from __future__ import annotations

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import flt

MEMORANDUM_ROOT = "حساب‌های انتظامی"
MEMORANDUM_CONTROL_GROUP = "حساب انتظامی طرف حساب"
MEMORANDUM_COUNTER_GROUP = "طرف حساب انتظامی"

MEMORANDUM_ACCOUNT_PAIRS = (
	("ضمانت‌نامه‌های دریافتی از دیگران", "طرف حساب ضمانت‌نامه‌های دریافتی"),
	("اسناد تضمینی نزد دیگران (ضمانت‌نامه‌های صادره)", "طرف حساب اسناد تضمینی نزد دیگران"),
	(
		"تعهدات اشخاص بابت اعتبارات اسنادی گشایش شده",
		"طرف حساب تعهدات اشخاص بابت اعتبارات اسنادی",
	),
	("کالای امانی ما نزد دیگران", "طرف حساب کالای امانی ما نزد دیگران"),
	("کالای امانی دیگران نزد ما", "طرف حساب کالای امانی دیگران نزد ما"),
	("قراردادهای منعقده سرمایه‌ای و جاری", "طرف حساب قراردادهای منعقده"),
)


def ensure_memorandum_account_custom_fields():
	"""Create Account custom fields used for memorandum accounting."""
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

	meta = frappe.get_meta("Account", cached=False)
	existing_fields = {df.fieldname for df in meta.get("fields")}
	pending_fields = [df for df in custom_fields if df["fieldname"] not in existing_fields]
	if pending_fields:
		create_custom_fields({"Account": pending_fields}, update=True)


def has_memorandum_field():
	return frappe.db.has_column("Account", "is_memorandum")


def ensure_memorandum_accounts_for_iran_company(doc, method=None):
	"""Doc event: keep memorandum accounts available for Iran companies."""
	company = doc.name if getattr(doc, "doctype", None) == "Company" else doc
	if not company:
		return
	setup_memorandum_accounts_for_company(company)


def setup_memorandum_accounts_for_company(company):
	"""Create memorandum chart nodes and mirror links for one company."""
	if not is_iran_company(company):
		return

	ensure_memorandum_account_custom_fields()

	root = _ensure_account(
		company=company,
		account_name=MEMORANDUM_ROOT,
		parent_account=None,
		is_group=1,
	)
	control_group = _ensure_account(
		company=company,
		account_name=MEMORANDUM_CONTROL_GROUP,
		parent_account=root,
		is_group=1,
	)
	counter_group = _ensure_account(
		company=company,
		account_name=MEMORANDUM_COUNTER_GROUP,
		parent_account=root,
		is_group=1,
	)

	mirror_links = {}
	for control_account_name, counter_account_name in MEMORANDUM_ACCOUNT_PAIRS:
		control_account = _ensure_account(
			company=company,
			account_name=control_account_name,
			parent_account=control_group,
			is_group=0,
		)
		counter_account = _ensure_account(
			company=company,
			account_name=counter_account_name,
			parent_account=counter_group,
			is_group=0,
		)
		mirror_links[control_account] = counter_account
		mirror_links[counter_account] = control_account

	for account, mirror_account in mirror_links.items():
		current_value = frappe.db.get_value("Account", account, "memorandum_mirror_account")
		if current_value != mirror_account:
			frappe.db.set_value(
				"Account",
				account,
				"memorandum_mirror_account",
				mirror_account,
				update_modified=False,
			)


def setup_memorandum_accounts_for_all_iran_companies():
	"""Backfill memorandum accounts for all Iran companies."""
	ensure_memorandum_account_custom_fields()
	for company in frappe.get_all("Company", pluck="name"):
		setup_memorandum_accounts_for_company(company)


def validate_memorandum_journal_entry(doc, method=None):
	"""Enforce memorandum balancing rules in Journal Entry."""
	if not doc.company or not is_iran_company(doc.company):
		return

	if not frappe.db.exists("Custom Field", "Account-is_memorandum"):
		return

	account_names = [d.account for d in doc.get("accounts") if d.account]
	if not account_names:
		return

	account_data = {
		row.name: row
		for row in frappe.get_all(
			"Account",
			filters={"name": ["in", account_names]},
			fields=["name", "is_memorandum", "memorandum_mirror_account"],
		)
	}

	memo_totals = {"debit": 0.0, "credit": 0.0}
	standard_totals = {"debit": 0.0, "credit": 0.0}
	account_sums = {}

	for row in doc.get("accounts"):
		if not row.account:
			continue

		debit = flt(row.debit)
		credit = flt(row.credit)
		is_memorandum = bool(account_data.get(row.account, {}).get("is_memorandum"))

		if is_memorandum:
			memo_totals["debit"] += debit
			memo_totals["credit"] += credit
		else:
			standard_totals["debit"] += debit
			standard_totals["credit"] += credit

		account_sums.setdefault(row.account, {"debit": 0.0, "credit": 0.0})
		account_sums[row.account]["debit"] += debit
		account_sums[row.account]["credit"] += credit

	if not memo_totals["debit"] and not memo_totals["credit"]:
		return

	if round(memo_totals["debit"] - memo_totals["credit"], 6) != 0:
		frappe.throw(
			_(
				"Memorandum accounts are not balanced in this Journal Entry. "
				"Memorandum debit must equal memorandum credit."
			)
		)

	if standard_totals["debit"] or standard_totals["credit"]:
		frappe.msgprint(
			_(
				"This entry mixes memorandum and standard accounts. "
				"Use separate Journal Entries when possible."
			),
			alert=True,
			indicator="orange",
		)

	for account, totals in account_sums.items():
		mirror_account = account_data.get(account, {}).get("memorandum_mirror_account")
		if not mirror_account:
			continue

		mirror_totals = account_sums.get(mirror_account, {"debit": 0.0, "credit": 0.0})
		if round(totals["debit"] - mirror_totals["credit"], 6) != 0:
			frappe.throw(
				_("Memorandum mirror mismatch: account {0} must be matched by {1}.").format(
					frappe.bold(account),
					frappe.bold(mirror_account),
				)
			)
		if round(totals["credit"] - mirror_totals["debit"], 6) != 0:
			frappe.throw(
				_("Memorandum mirror mismatch: account {0} must be matched by {1}.").format(
					frappe.bold(account),
					frappe.bold(mirror_account),
				)
			)


def is_iran_company(company):
	"""Check whether company is configured for Iran."""
	country = frappe.get_cached_value("Company", company, "country")
	if not country:
		return False

	if country == "Iran":
		return True

	return frappe.get_cached_value("Country", country, "code") == "IR"


def _ensure_account(company, account_name, parent_account, is_group):
	if parent_account:
		account = frappe.db.get_value(
			"Account",
			{"company": company, "account_name": account_name, "parent_account": parent_account},
			"name",
		)
	else:
		account = frappe.db.sql(
			"""
			select name from `tabAccount`
			where company=%s and account_name=%s and ifnull(parent_account, '')=''
			limit 1
			""",
			(company, account_name),
		)
		account = account[0][0] if account else None

	if account:
		_update_memorandum_flag(account, parent_account=parent_account)
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

def _update_memorandum_flag(account, parent_account=None):
	fields_to_set = {}
	if not frappe.db.get_value("Account", account, "is_memorandum"):
		fields_to_set["is_memorandum"] = 1

	if not parent_account:
		root_type, report_type = frappe.db.get_value(
			"Account", account, ["root_type", "report_type"]
		)
		if not root_type:
			fields_to_set["root_type"] = "Asset"
		if not report_type:
			fields_to_set["report_type"] = "Balance Sheet"

	if fields_to_set:
		frappe.db.set_value("Account", account, fields_to_set, update_modified=False)
