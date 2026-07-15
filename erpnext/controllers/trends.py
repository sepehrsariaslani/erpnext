# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import re
import frappe
from frappe import _
from frappe.utils import DateTimeLikeObject, getdate, today

from erpnext.accounts.utils import get_fiscal_year


PERSIAN_MONTHS = [
	"",
	"فروردین",
	"اردیبهشت",
	"خرداد",
	"تیر",
	"مرداد",
	"شهریور",
	"مهر",
	"آبان",
	"آذر",
	"دی",
	"بهمن",
	"اسفند",
]


def get_columns(filters, trans):
	validate_filters(filters)

	# get conditions for based_on filter cond
	based_on_details = based_wise_columns_query(filters.get("based_on"), trans)
	# get conditions for periodic filter cond
	period_cols, period_select = period_wise_columns_query(filters, trans)
	# get conditions for grouping filter cond
	group_by_cols = group_wise_column(filters.get("group_by"))

	columns = (
		based_on_details["based_on_cols"]
		+ period_cols
		+ [_("Total(Qty)") + ":Float:120", _("Total(Amt)") + ":Currency/currency:120"]
	)
	if group_by_cols:
		columns = (
			based_on_details["based_on_cols"]
			+ group_by_cols
			+ period_cols
			+ [_("Total(Qty)") + ":Float:120", _("Total(Amt)") + ":Currency/currency:120"]
		)

	conditions = {
		"based_on_select": based_on_details["based_on_select"],
		"period_wise_select": period_select,
		"columns": columns,
		"group_by": based_on_details["based_on_group_by"],
		"grbc": group_by_cols,
		"trans": trans,
		"addl_tables": based_on_details["addl_tables"],
		"addl_tables_relational_cond": based_on_details.get("addl_tables_relational_cond", ""),
	}

	return conditions


def validate_filters(filters):
	if not filters.get("fiscal_year"):
		filters["fiscal_year"] = get_fiscal_year(today())[0]
	if not filters.get("company"):
		filters["company"] = frappe.defaults.get_user_default("Company")
	for f in ["Fiscal Year", "Based On", "Period", "Company"]:
		if not filters.get(f.lower().replace(" ", "_")):
			frappe.throw(_("{0} is mandatory").format(_(f)))

	if not frappe.db.exists("Fiscal Year", filters.get("fiscal_year")):
		frappe.throw(_("Fiscal Year {0} Does Not Exist").format(filters.get("fiscal_year")))

	if filters.get("based_on") == filters.get("group_by"):
		frappe.throw(_("'Based On' and 'Group By' can not be same"))

	if filters.get("period_based_on") and filters.period_based_on not in ["bill_date", "posting_date"]:
		frappe.throw(
			msg=_("{0} can be either {1} or {2}.").format(
				frappe.bold("Period based On"), frappe.bold("Posting Date"), frappe.bold("Billing Date")
			),
			title=_("Invalid Filter"),
		)


def get_data(filters, conditions):
	data = []
	inc, cond = "", ""
	query_details = conditions["based_on_select"] + conditions["period_wise_select"]

	posting_date = "t1.transaction_date"
	if conditions.get("trans") in [
		"Sales Invoice",
		"Purchase Invoice",
		"Purchase Receipt",
		"Delivery Note",
	]:
		posting_date = "t1.posting_date"
		if filters.period_based_on and conditions.get("trans") in ["Sales Invoice", "Purchase Invoice"]:
			posting_date = "t1." + filters.period_based_on

	if conditions["based_on_select"] in ["t1.project,", "t2.project,"]:
		cond = " and " + conditions["based_on_select"][:-1] + " IS Not NULL"

	if not filters.get("include_closed_orders"):
		if conditions.get("trans") in ["Sales Order", "Purchase Order"]:
			cond += " and t1.status != 'Closed'"

	if conditions.get("trans") == "Quotation" and filters.get("group_by") == "Customer":
		cond += " and t1.quotation_to = 'Customer'"

	year_start_date, year_end_date = frappe.get_cached_value(
		"Fiscal Year", filters.get("fiscal_year"), ["year_start_date", "year_end_date"]
	)

	if filters.get("group_by"):
		sel_col = ""
		ind = conditions["columns"].index(conditions["grbc"][0])

		if filters.get("group_by") == "Item":
			sel_col = "t2.item_code"
		elif filters.get("group_by") == "Customer":
			sel_col = "t1.party_name" if conditions.get("trans") == "Quotation" else "t1.customer"
		elif filters.get("group_by") == "Supplier":
			sel_col = "t1.supplier"

		if filters.get("based_on") in ["Customer", "Supplier"]:
			inc = 3
		elif filters.get("based_on") in ["Item"]:
			inc = 2
		else:
			inc = 1

		data1 = frappe.db.sql(
			""" select {} from `tab{}` t1, `tab{} Item` t2 {}
					where t2.parent = t1.name and t1.company = {} and {} between {} and {} and
					t1.docstatus = 1 {} {}
					group by {}
				""".format(
				query_details,
				conditions["trans"],
				conditions["trans"],
				conditions["addl_tables"],
				"%s",
				posting_date,
				"%s",
				"%s",
				conditions.get("addl_tables_relational_cond"),
				cond,
				conditions["group_by"],
			),
			(filters.get("company"), year_start_date, year_end_date),
			as_list=1,
		)

		for d in range(len(data1)):
			# to add blanck column
			dt = data1[d]
			dt.insert(ind, "")
			data.append(dt)

			# to get distinct value of col specified by group_by in filter
			row = frappe.db.sql(
				"""select DISTINCT({}) from `tab{}` t1, `tab{} Item` t2 {}
						where t2.parent = t1.name and t1.company = {} and {} between {} and {}
						and t1.docstatus = 1 and {} = {} {} {}
					""".format(
					sel_col,
					conditions["trans"],
					conditions["trans"],
					conditions["addl_tables"],
					"%s",
					posting_date,
					"%s",
					"%s",
					conditions["group_by"],
					"%s",
					conditions.get("addl_tables_relational_cond"),
					cond,
				),
				(filters.get("company"), year_start_date, year_end_date, data1[d][0]),
				as_list=1,
			)

			for i in range(len(row)):
				des = ["" for q in range(len(conditions["columns"]))]

				# get data for group_by filter
				row1 = frappe.db.sql(
					""" select t4.default_currency AS currency , {} , {} from `tab{}` t1, `tab{} Item` t2 {}
							where t2.parent = t1.name and t1.company = {} and {} between {} and {}
							and t1.docstatus = 1 and {} = {} and {} = {} {} {}
						""".format(
						sel_col,
						conditions["period_wise_select"],
						conditions["trans"],
						conditions["trans"],
						conditions["addl_tables"],
						"%s",
						posting_date,
						"%s",
						"%s",
						sel_col,
						"%s",
						conditions["group_by"],
						"%s",
						conditions.get("addl_tables_relational_cond"),
						cond,
					),
					(filters.get("company"), year_start_date, year_end_date, row[i][0], data1[d][0]),
					as_list=1,
				)

				des[ind] = row[i][0]
				des[ind - 1] = row1[0][0]

				for j in range(1, len(conditions["columns"]) - inc):
					des[j + inc] = row1[0][j]

				data.append(des)

		total_row = calculate_total_row(data1, conditions["columns"])
		data.append(total_row)
	else:
		data = frappe.db.sql(
			""" select {} from `tab{}` t1, `tab{} Item` t2 {}
					where t2.parent = t1.name and t1.company = {} and {} between {} and {} and
					t1.docstatus = 1 {} {}
					group by {}
				""".format(
				query_details,
				conditions["trans"],
				conditions["trans"],
				conditions["addl_tables"],
				"%s",
				posting_date,
				"%s",
				"%s",
				cond,
				conditions.get("addl_tables_relational_cond", ""),
				conditions["group_by"],
			),
			(filters.get("company"), year_start_date, year_end_date),
			as_list=1,
		)

		total_row = calculate_total_row(data, conditions["columns"])
		data.append(total_row)

	return data


def calculate_total_row(data, columns):
	def wrap_in_quotes(label):
		return f"'{label}'"

	total_values = {}
	for i, col in enumerate(columns):
		if "Float" in col or "Currency/currency" in col:
			total_values[i] = 0

	for row in data:
		for i in total_values.keys():
			total_values[i] += row[i] if row[i] is not None else 0

	total_row = [wrap_in_quotes(_("Total"))]
	for i in range(1, len(columns)):
		total_row.append(total_values.get(i, None))

	return total_row


def get_mon(dt):
	return getdate(dt).strftime("%b")


def _as_bool(value) -> bool:
	if isinstance(value, bool):
		return value
	if value is None:
		return False
	return str(value).strip().lower() not in {"0", "false", "no", "off", ""}


def is_jalali_calendar_mode(filters) -> bool:
	lang = str(getattr(frappe.local, "lang", "") or "")
	return _as_bool((filters or {}).get("__jalali_calendar_mode")) or lang.startswith("fa")


def get_period_start_index(filters) -> int:
	if filters.get("based_on") in ["Customer", "Supplier"]:
		start = 3
	elif filters.get("based_on") in ["Item"]:
		start = 2
	else:
		start = 1
	if filters.get("group_by"):
		start += 1
	return start


def _to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
	g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]

	if (gy % 4 == 0 and gy % 100 != 0) or (gy % 400 == 0):
		g_days_in_month[1] = 29

	gy2 = gy - 1600
	gm2 = gm - 1
	gd2 = gd - 1

	g_day_no = 365 * gy2 + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400
	for i in range(gm2):
		g_day_no += g_days_in_month[i]
	g_day_no += gd2

	j_day_no = g_day_no - 79
	j_np = j_day_no // 12053
	j_day_no %= 12053

	jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
	j_day_no %= 1461

	if j_day_no >= 366:
		jy += (j_day_no - 1) // 365
		j_day_no = (j_day_no - 1) % 365

	jm = 0
	for i in range(11):
		if j_day_no >= j_days_in_month[i]:
			j_day_no -= j_days_in_month[i]
			jm += 1
		else:
			break

	jd = j_day_no + 1
	return jy, jm + 1, jd


def _to_jalali_month_name(gregorian_date) -> str:
	d = getdate(gregorian_date)
	_, jm, _ = _to_jalali(d.year, d.month, d.day)
	if 1 <= jm <= 12:
		return PERSIAN_MONTHS[jm]
	return ""


def get_jalali_period_labels(filters) -> list[str]:
	period = (filters or {}).get("period")
	fiscal_year = (filters or {}).get("fiscal_year")
	if not period or not fiscal_year:
		return []

	labels = []
	for start_date, end_date in get_period_date_ranges(period, fiscal_year):
		start_month = _to_jalali_month_name(start_date)
		if period == "Monthly":
			labels.append(start_month)
			continue
		end_month = _to_jalali_month_name(end_date)
		if not end_month or end_month == start_month:
			labels.append(start_month)
		else:
			labels.append(f"{start_month}-{end_month}")
	return labels


def _split_column_spec(column_spec):
	if not isinstance(column_spec, str):
		return column_spec, ""
	head, sep, tail = column_spec.partition(":")
	return head, (f":{tail}" if sep else "")


def _get_column_metric_label(head: str) -> str:
	if re.search(r"\(\s*qty\s*\)", head, flags=re.IGNORECASE):
		return "تعداد"
	if re.search(r"\(\s*amt\s*\)", head, flags=re.IGNORECASE):
		return "مبلغ"
	return ""


def _translate_qty_amt_tokens(text: str) -> str:
	return (
		re.sub(r"\(\s*qty\s*\)", "(تعداد)", text, flags=re.IGNORECASE)
		.replace("(Qty)", "(تعداد)")
		.replace("(qty)", "(تعداد)")
		.replace("(Amt)", "(مبلغ)")
		.replace("(amt)", "(مبلغ)")
	)


def convert_period_columns_to_jalali(columns: list, filters) -> list:
	if not isinstance(columns, list) or not columns:
		return columns

	start = get_period_start_index(filters or {})
	if start >= len(columns) - 2:
		return columns

	period_labels = get_jalali_period_labels(filters or {})
	pre_columns = columns[:start]
	period_columns = columns[start:-2]
	total_columns = columns[-2:]
	converted_period = []

	for index, column_spec in enumerate(period_columns):
		if not isinstance(column_spec, str):
			converted_period.append(column_spec)
			continue
		head, tail = _split_column_spec(column_spec)
		metric_label = _get_column_metric_label(head)
		period_idx = index // 2
		base_label = period_labels[period_idx] if period_idx < len(period_labels) else ""
		if base_label:
			converted_head = f"{metric_label} - {base_label}" if metric_label else base_label
			converted_period.append(f"{converted_head}{tail}")
		else:
			converted_period.append(f"{_translate_qty_amt_tokens(head)}{tail}")

	translated_totals = []
	for column_spec in total_columns:
		if not isinstance(column_spec, str):
			translated_totals.append(column_spec)
			continue
		head, tail = _split_column_spec(column_spec)
		translated_totals.append(f"{_translate_qty_amt_tokens(head)}{tail}")

	return pre_columns + converted_period + translated_totals


def clean_period_label_for_chart(label: str) -> str:
	return (
		str(label or "")
		.replace("مبلغ - ", "")
		.replace("تعداد - ", "")
		.replace(" (Amt)", "")
		.replace(" (Qty)", "")
		.replace(" (مبلغ)", "")
		.replace(" (تعداد)", "")
	)


def _strip_amount_metric_from_head(head: str) -> str:
	return (
		head.replace("مبلغ - ", "")
		.replace("Amount - ", "")
		.replace("Amt - ", "")
		.replace("(مبلغ)", "")
		.replace("(Amt)", "")
		.strip()
	)


def normalize_rows_to_column_count(data: list, columns: list) -> list:
	expected = len(columns or [])
	if not expected:
		return data

	normalized = []
	for row in data or []:
		if isinstance(row, dict):
			normalized.append(row)
			continue
		if isinstance(row, tuple):
			row = list(row)
		elif not isinstance(row, list):
			row = [row]

		if len(row) < expected:
			row = row + [None] * (expected - len(row))
		elif len(row) > expected:
			row = row[:expected]

		normalized.append(row)
	return normalized


def collapse_period_columns_to_amount_only(columns: list, data: list, filters):
	if not isinstance(columns, list) or not columns:
		return columns, data

	start = get_period_start_index(filters or {})
	if start >= len(columns) - 2:
		return columns, normalize_rows_to_column_count(data, columns)

	pre_columns = columns[:start]
	period_columns = columns[start:-2]
	total_amount_column = columns[-1]
	amount_columns = []

	for period_index, column_spec in enumerate(period_columns):
		if period_index % 2 == 0:
			continue
		if not isinstance(column_spec, str):
			amount_columns.append(column_spec)
			continue
		head, tail = _split_column_spec(column_spec)
		amount_columns.append(f"{_strip_amount_metric_from_head(head)}{tail}")

	if isinstance(total_amount_column, str):
		total_head, total_tail = _split_column_spec(total_amount_column)
		total_amount_column = f"{_strip_amount_metric_from_head(total_head)}{total_tail}"

	new_columns = pre_columns + amount_columns + [total_amount_column]
	new_data = []

	for row in data or []:
		if isinstance(row, dict):
			new_data.append(row)
			continue
		if isinstance(row, tuple):
			row = list(row)
		elif not isinstance(row, list):
			row = [row]

		if len(row) < start + 2:
			new_data.append(row)
			continue

		pre_values = row[:start]
		period_values = row[start:-2]
		amount_values = period_values[1::2]
		total_amount_value = row[-1] if row else None
		new_data.append(pre_values + amount_values + [total_amount_value])

	return new_columns, normalize_rows_to_column_count(new_data, new_columns)


def apply_jalali_period_labels_to_chart(chart_data: dict, filters) -> None:
	if not isinstance(chart_data, dict):
		return
	data = chart_data.get("data")
	if not isinstance(data, dict):
		return
	labels = data.get("labels")
	if not isinstance(labels, list):
		return

	period_labels = get_jalali_period_labels(filters or {})
	if period_labels:
		data["labels"] = period_labels[: len(labels)]


def period_wise_columns_query(filters, trans):
	query_details = ""
	pwc = []
	bet_dates = get_period_date_ranges(filters.get("period"), filters.get("fiscal_year"))

	if trans in ["Purchase Receipt", "Delivery Note", "Purchase Invoice", "Sales Invoice"]:
		trans_date = "posting_date"
		if filters.period_based_on and trans in ["Purchase Invoice", "Sales Invoice"]:
			trans_date = filters.period_based_on
	else:
		trans_date = "transaction_date"

	if filters.get("period") != "Yearly":
		for dt in bet_dates:
			get_period_wise_columns(dt, filters.get("period"), pwc)
			query_details = get_period_wise_query(dt, trans_date, query_details)
	else:
		pwc = [
			_(filters.get("fiscal_year")) + " (" + _("Qty") + "):Float:120",
			_(filters.get("fiscal_year")) + " (" + _("Amt") + "):Currency/currency:120",
		]
		query_details = " SUM(t2.stock_qty), SUM(t2.base_net_amount),"

	query_details += "SUM(t2.stock_qty), SUM(t2.base_net_amount)"
	return pwc, query_details


def get_period_wise_columns(bet_dates, period, pwc):
	if period == "Monthly":
		pwc += [
			_(get_mon(bet_dates[0])) + " (" + _("Qty") + "):Float:120",
			_(get_mon(bet_dates[0])) + " (" + _("Amt") + "):Currency/currency:120",
		]
	else:
		pwc += [
			_(get_mon(bet_dates[0])) + "-" + _(get_mon(bet_dates[1])) + " (" + _("Qty") + "):Float:120",
			_(get_mon(bet_dates[0]))
			+ "-"
			+ _(get_mon(bet_dates[1]))
			+ " ("
			+ _("Amt")
			+ "):Currency/currency:120",
		]


def get_period_wise_query(bet_dates, trans_date, query_details):
	query_details += """SUM(IF(t1.{trans_date} BETWEEN '{sd}' AND '{ed}', t2.stock_qty, NULL)),
					SUM(IF(t1.{trans_date} BETWEEN '{sd}' AND '{ed}', t2.base_net_amount, NULL)),
				""".format(
		trans_date=trans_date,
		sd=bet_dates[0],
		ed=bet_dates[1],
	)
	return query_details


@frappe.whitelist(allow_guest=True)
def get_period_date_ranges(period, fiscal_year=None, year_start_date=None):
	from dateutil.relativedelta import relativedelta

	if not year_start_date:
		year_start_date, year_end_date = frappe.get_cached_value(
			"Fiscal Year", fiscal_year, ["year_start_date", "year_end_date"]
		)

	increment = {"Monthly": 1, "Quarterly": 3, "Half-Yearly": 6, "Yearly": 12}.get(period)

	period_date_ranges = []
	for _i in range(1, 13, increment):
		period_end_date = getdate(year_start_date) + relativedelta(months=increment, days=-1)
		if period_end_date > getdate(year_end_date):
			period_end_date = year_end_date
		period_date_ranges.append([year_start_date, period_end_date])
		year_start_date = period_end_date + relativedelta(days=1)
		if period_end_date == year_end_date:
			break

	return period_date_ranges


def get_period_month_ranges(period, fiscal_year):
	from dateutil.relativedelta import relativedelta

	period_month_ranges = []

	for start_date, end_date in get_period_date_ranges(period, fiscal_year):
		months_in_this_period = []
		while start_date <= end_date:
			months_in_this_period.append(start_date.strftime("%B"))
			start_date += relativedelta(months=1)
		period_month_ranges.append(months_in_this_period)

	return period_month_ranges


def based_wise_columns_query(based_on, trans):
	based_on_details = {}

	# based_on_cols, based_on_select, based_on_group_by, addl_tables
	if based_on == "Item":
		based_on_details["based_on_cols"] = [
			{"label": _("Item"), "fieldtype": "Link", "options": "Item", "width": 120, "fieldname": "item"},
			{"label": _("Item Name"), "fieldtype": "Data", "width": 120, "fieldname": "item_name"},
		]
		based_on_details["based_on_select"] = "t2.item_code, t2.item_name,"
		based_on_details["based_on_group_by"] = "t2.item_code"
		based_on_details["addl_tables"] = ""

	elif based_on == "Item Group":
		based_on_details["based_on_cols"] = [
			{
				"label": _("Item Group"),
				"fieldtype": "Link",
				"options": "Item Group",
				"width": 120,
				"fieldname": "item_group",
			}
		]
		based_on_details["based_on_select"] = "t2.item_group,"
		based_on_details["based_on_group_by"] = "t2.item_group"
		based_on_details["addl_tables"] = ""

	elif based_on == "Customer":
		if trans == "Quotation":
			based_on_details["based_on_cols"] = [
				{
					"label": _("Party"),
					"fieldtype": "Link",
					"options": "Customer",
					"width": 120,
					"fieldname": "party",
				},
				{"label": _("Party Name"), "fieldtype": "Data", "width": 120, "fieldname": "party_name"},
				{
					"label": _("Territory"),
					"fieldtype": "Link",
					"options": "Territory",
					"width": 120,
					"fieldname": "territory",
				},
			]
			based_on_details["based_on_select"] = "t1.party_name, t1.customer_name, t1.territory,"
		else:
			based_on_details["based_on_cols"] = [
				{
					"label": _("Customer"),
					"fieldtype": "Link",
					"options": "Customer",
					"width": 120,
					"fieldname": "customer",
				},
				{
					"label": _("Customer Name"),
					"fieldtype": "Data",
					"width": 120,
					"fieldname": "customer_name",
				},
				{
					"label": _("Territory"),
					"fieldtype": "Link",
					"options": "Territory",
					"width": 120,
					"fieldname": "territory",
				},
			]
			based_on_details["based_on_select"] = "t1.customer, t1.customer_name, t1.territory,"
		based_on_details["based_on_group_by"] = "t1.party_name" if trans == "Quotation" else "t1.customer"
		based_on_details["addl_tables"] = ""

	elif based_on == "Customer Group":
		based_on_details["based_on_cols"] = [
			{
				"label": _("Customer Group"),
				"fieldtype": "Link",
				"options": "Customer Group",
				"fieldname": "customer_group",
			}
		]
		based_on_details["based_on_select"] = "t1.customer_group,"
		based_on_details["based_on_group_by"] = "t1.customer_group"
		based_on_details["addl_tables"] = ""

	elif based_on == "Supplier":
		based_on_details["based_on_cols"] = [
			{
				"label": _("Supplier"),
				"fieldtype": "Link",
				"options": "Supplier",
				"width": 120,
				"fieldname": "supplier",
			},
			{"label": _("Supplier Name"), "fieldtype": "Data", "width": 120, "fieldname": "supplier_name"},
			{
				"label": _("Supplier Group"),
				"fieldtype": "Link",
				"options": "Supplier Group",
				"width": 140,
				"fieldname": "supplier_group",
			},
		]
		based_on_details["based_on_select"] = "t1.supplier, t1.supplier_name, t3.supplier_group,"
		based_on_details["based_on_group_by"] = "t1.supplier"
		based_on_details["addl_tables"] = ",`tabSupplier` t3"
		based_on_details["addl_tables_relational_cond"] = " and t1.supplier = t3.name"

	elif based_on == "Supplier Group":
		based_on_details["based_on_cols"] = [
			{
				"label": _("Supplier Group"),
				"fieldtype": "Link",
				"options": "Supplier Group",
				"width": 140,
				"fieldname": "supplier_group",
			}
		]
		based_on_details["based_on_select"] = "t3.supplier_group,"
		based_on_details["based_on_group_by"] = "t3.supplier_group"
		based_on_details["addl_tables"] = ",`tabSupplier` t3"
		based_on_details["addl_tables_relational_cond"] = " and t1.supplier = t3.name"

	elif based_on == "Territory":
		based_on_details["based_on_cols"] = [
			{
				"label": _("Territory"),
				"fieldtype": "Link",
				"options": "Territory",
				"width": 120,
				"fieldname": "territory",
			}
		]
		based_on_details["based_on_select"] = "t1.territory,"
		based_on_details["based_on_group_by"] = "t1.territory"
		based_on_details["addl_tables"] = ""

	elif based_on == "Project":
		if trans in ["Sales Invoice", "Delivery Note", "Sales Order"]:
			based_on_details["based_on_cols"] = [
				{
					"label": _("Project"),
					"fieldtype": "Link",
					"options": "Project",
					"width": 120,
					"fieldname": "project",
				}
			]
			based_on_details["based_on_select"] = "t1.project,"
			based_on_details["based_on_group_by"] = "t1.project"
			based_on_details["addl_tables"] = ""
		elif trans in ["Purchase Order", "Purchase Invoice", "Purchase Receipt"]:
			based_on_details["based_on_cols"] = [
				{
					"label": _("Project"),
					"fieldtype": "Link",
					"options": "Project",
					"width": 120,
					"fieldname": "project",
				}
			]
			based_on_details["based_on_select"] = "t2.project,"
			based_on_details["based_on_group_by"] = "t2.project"
			based_on_details["addl_tables"] = ""
		else:
			frappe.throw(_("Project-wise data is not available for Quotation"))

	based_on_details["based_on_select"] += "t4.default_currency as currency,"
	based_on_details["based_on_cols"].append(
		{
			"label": _("Currency"),
			"fieldtype": "Link",
			"options": "Currency",
			"width": 120,
			"fieldname": "currency",
		}
	)
	based_on_details["addl_tables"] += ", `tabCompany` t4"
	based_on_details["addl_tables_relational_cond"] = (
		based_on_details.get("addl_tables_relational_cond", "") + " and t1.company = t4.name"
	)

	return based_on_details


def group_wise_column(group_by):
	if group_by:
		return [
			{
				"label": _(group_by),
				"fieldtype": "Link",
				"options": group_by,
				"width": 120,
				"fieldname": frappe.scrub(group_by),
			}
		]
	else:
		return []
