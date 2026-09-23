import unittest

import frappe


def assert_standard_chart_dependencies_are_prepared():
	from erpnext.regional.iran import memorandum_accounts

	memorandum_accounts.ensure_standard_account_categories()
	assert frappe.db.exists("Account Category", "Trade Receivables")


def assert_company_hook_runs_after_standard_chart_setup():
	company_events = frappe.get_hooks("doc_events").get("Company", {})
	after_insert = company_events.get("after_insert", [])
	on_update = company_events.get("on_update", [])
	if isinstance(after_insert, str):
		after_insert = [after_insert]
	if isinstance(on_update, str):
		on_update = [on_update]

	hook = "erpnext.regional.iran.memorandum_accounts.ensure_standard_and_memorandum_accounts"
	assert hook not in after_insert
	assert hook in on_update


class TestIranMemorandumAccounts(unittest.TestCase):
	def test_company_hook_runs_after_standard_chart_setup(self):
		assert_company_hook_runs_after_standard_chart_setup()
