import unittest

import frappe


def assert_standard_chart_dependencies_are_prepared():
	from erpnext.regional.iran import memorandum_accounts

	memorandum_accounts.ensure_standard_account_categories()
	assert frappe.db.exists("Account Category", "Trade Receivables")


def assert_company_hook_ensures_standard_chart_before_memorandum_accounts():
	company_events = frappe.get_hooks("doc_events").get("Company", {})
	after_insert = company_events.get("after_insert", [])
	if isinstance(after_insert, str):
		after_insert = [after_insert]

	assert (
		"erpnext.regional.iran.memorandum_accounts.ensure_standard_and_memorandum_accounts"
		in after_insert
	)


class TestIranMemorandumAccounts(unittest.TestCase):
	def test_company_hook_ensures_standard_chart_before_memorandum_accounts(self):
		assert_company_hook_ensures_standard_chart_before_memorandum_accounts()
