# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt


from frappe import _

from erpnext.controllers.trends import (
	apply_jalali_period_labels_to_chart,
	clean_period_label_for_chart,
	collapse_period_columns_to_amount_only,
	convert_period_columns_to_jalali,
	get_columns,
	get_data,
	get_period_start_index,
	is_jalali_calendar_mode,
)


def execute(filters=None):
	if not filters:
		filters = {}

	conditions = get_columns(filters, "Quotation")
	jalali_mode = is_jalali_calendar_mode(filters)
	if jalali_mode:
		conditions["columns"] = convert_period_columns_to_jalali(conditions.get("columns") or [], filters)

	data = get_data(filters, conditions)
	chart_data = get_chart_data(data, conditions, filters)

	if jalali_mode:
		apply_jalali_period_labels_to_chart(chart_data, filters)
		conditions["columns"], data = collapse_period_columns_to_amount_only(
			conditions.get("columns") or [], data, filters
		)

	return conditions["columns"], data, None, chart_data


def get_chart_data(data, conditions, filters):
	if not (data and conditions):
		return []

	start = get_period_start_index(filters)
	period_amount_columns = (conditions.get("columns") or [])[start:-2][1::2]
	labels = [clean_period_label_for_chart(column.split(":")[0]) for column in period_amount_columns]
	datapoints = [0] * len(labels)

	for row in data:
		# If group by filter, don't add first row of group (it's already summed)
		if not row[start]:
			continue
		# Remove None values and compute only periodic amount data
		amount_values = [x if x else 0 for x in row[start:-2]][1::2]
		for i, value in enumerate(amount_values):
			datapoints[i] += value

	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _(filters.get("period")) + " " + _("Quoted Amount"), "values": datapoints}],
		},
		"type": "line",
		"lineOptions": {"regionFill": 1},
		"fieldtype": "Currency",
	}
