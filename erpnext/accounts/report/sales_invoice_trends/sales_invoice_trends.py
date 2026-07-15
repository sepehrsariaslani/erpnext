# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt


from erpnext.controllers.trends import (
	collapse_period_columns_to_amount_only,
	convert_period_columns_to_jalali,
	get_columns,
	get_data,
	is_jalali_calendar_mode,
)


def execute(filters=None):
	if not filters:
		filters = {}

	conditions = get_columns(filters, "Sales Invoice")
	jalali_mode = is_jalali_calendar_mode(filters)
	if jalali_mode:
		conditions["columns"] = convert_period_columns_to_jalali(conditions.get("columns") or [], filters)

	data = get_data(filters, conditions)

	if jalali_mode:
		conditions["columns"], data = collapse_period_columns_to_amount_only(
			conditions.get("columns") or [], data, filters
		)

	return conditions["columns"], data
