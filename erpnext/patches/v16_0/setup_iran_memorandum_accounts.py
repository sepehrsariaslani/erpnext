import frappe

from erpnext.regional.iran.memorandum_accounts import (
	ensure_memorandum_account_custom_fields,
	setup_memorandum_accounts_for_all_iran_companies,
)


def execute():
	ensure_memorandum_account_custom_fields()
	setup_memorandum_accounts_for_all_iran_companies()
	frappe.db.commit()
	frappe.clear_cache()
