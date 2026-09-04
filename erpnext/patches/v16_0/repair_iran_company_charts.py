import frappe

from erpnext.regional.iran.memorandum_accounts import repair_incomplete_iran_company


def execute():
	for company in frappe.get_all("Company", filters={"country": "Iran"}, pluck="name"):
		repair_incomplete_iran_company(company)
