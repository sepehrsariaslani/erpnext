# Copyright (c) 2025, Your Company and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.utils import getdate, cstr
import jdatetime
from erpnext.accounts.report.general_ledger.general_ledger import (
    validate_filters, validate_party, set_account_currency,
    get_gl_entries, get_conditions, get_accounts_with_children
)
from erpnext.accounts.report.utils import get_currency, convert_to_presentation_currency
from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import get_accounting_dimensions


def execute(filters=None):
    if not filters:
        return [], []
    
    # Validate filters using existing General Ledger functions
    account_details = {}
    for acc in frappe.db.sql("""select name, is_group from tabAccount""", as_dict=1):
        account_details.setdefault(acc.name, acc)
    
    if filters.get("party"):
        filters.party = frappe.parse_json(filters.get("party"))
    
    validate_filters(filters, account_details)
    validate_party(filters)
    filters = set_account_currency(filters)
    
    # Get columns
    columns = get_columns(filters)
    
    # Get GL entries and process data
    data = get_ledger_data(filters)
    
    return columns, data


def get_columns(filters):
    """Define report columns"""
    currency = filters.get("presentation_currency") or filters.get("account_currency", "IRR")
    
    columns = [
        {"label": "تاریخ شمسی", "fieldname": "jalali_date", "fieldtype": "Data", "width": 120},
        {"label": "تاریخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
        {"label": "مرجع", "fieldname": "reference", "fieldtype": "Data", "width": 180},
        {"label": "طرف حساب", "fieldname": "party_display", "fieldtype": "Data", "width": 150},
        {"label": "نام کالا", "fieldname": "item_name", "fieldtype": "Data", "width": 200},
        {"label": "تعداد", "fieldname": "qty", "fieldtype": "Float", "width": 80},
        {"label": "نرخ", "fieldname": "rate", "fieldtype": "Currency", "width": 100},
        {"label": "مبلغ", "fieldname": "item_amount", "fieldtype": "Currency", "width": 120},
        {"label": "توضیحات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
        {"label": "بدهکار ({0})".format(currency), "fieldname": "debit", "fieldtype": "Currency", "width": 130},
        {"label": "بستانکار ({0})".format(currency), "fieldname": "credit", "fieldtype": "Currency", "width": 130},
        {"label": "مانده ({0})".format(currency), "fieldname": "balance", "fieldtype": "Currency", "width": 130},
        {"label": "Row Type", "fieldname": "row_type", "fieldtype": "Data", "width": 100, "hidden": 1}
    ]
    
    return columns


def get_ledger_data(filters):
    """Get ledger data with item details"""
    # Get GL entries using existing function
    accounting_dimensions = get_accounting_dimensions() if filters.get("include_dimensions") else []
    gl_entries = get_gl_entries(filters, accounting_dimensions)
    
    # Filter GL entries within date range
    from_date = getdate(filters.from_date)
    to_date = getdate(filters.to_date)
    
    filtered_gl_entries = []
    for gle in gl_entries:
        gle_date = getdate(gle.posting_date)
        if from_date <= gle_date <= to_date:
            filtered_gl_entries.append(gle)
    
    # Calculate opening balance
    opening_balance = get_opening_balance(filters)
    
    # Process data
    data = []
    current_balance = opening_balance
    total_debit = 0
    total_credit = 0
    
    # Add opening balance row if needed
    if opening_balance != 0:
        data.append({
            "jalali_date": "",
            "posting_date": "",
            "reference": "",
            "party_display": "افتتاحیه",
            "item_name": "",
            "qty": None,
            "rate": None,
            "item_amount": None,
            "remarks": "افتتاحیه",
            "debit": opening_balance if opening_balance > 0 else 0,
            "credit": abs(opening_balance) if opening_balance < 0 else 0,
            "balance": opening_balance,
            "row_type": "opening"
        })
    
    # Group GL entries by voucher
    voucher_groups = {}
    for gle in filtered_gl_entries:
        key = (gle.voucher_type, gle.voucher_no)
        if key not in voucher_groups:
            voucher_groups[key] = []
        voucher_groups[key].append(gle)
    
    # Process each voucher
    for (voucher_type, voucher_no), gle_list in voucher_groups.items():
        # Calculate voucher totals
        voucher_debit = sum(gle.debit for gle in gle_list)
        voucher_credit = sum(gle.credit for gle in gle_list)
        current_balance += voucher_debit - voucher_credit
        total_debit += voucher_debit
        total_credit += voucher_credit
        
        # Take first GL entry for basic info
        first_gle = gle_list[0]
        
        # Convert to Jalali date
        jalali_date = ""
        if first_gle.posting_date:
            try:
                gregorian_date = getdate(first_gle.posting_date)
                jalali_date = jdatetime.date.fromgregorian(
                    day=gregorian_date.day,
                    month=gregorian_date.month,
                    year=gregorian_date.year
                ).strftime('%Y/%m/%d')
            except:
                jalali_date = ""
        
        # Add main voucher row
        main_row = {
            "jalali_date": jalali_date,
            "posting_date": first_gle.posting_date,
            "reference": f"{voucher_type}<br>{voucher_no}",
            "party_display": first_gle.party or first_gle.account,
            "item_name": "",
            "qty": None,
            "rate": None,
            "item_amount": None,
            "remarks": first_gle.remarks or "",
            "debit": voucher_debit,
            "credit": voucher_credit,
            "balance": current_balance,
            "row_type": "voucher"
        }
        data.append(main_row)
        
        # Get and add item details
        item_details = get_item_details(voucher_type, voucher_no)
        total_discount = 0
        
        for item in item_details:
            item_row = {
                "jalali_date": "",
                "posting_date": "",
                "reference": "",
                "party_display": "",
                "item_name": item.get("item_name", ""),
                "qty": item.get("qty", 0),
                "rate": item.get("rate", 0),
                "item_amount": item.get("amount", 0),
                "remarks": item.get("description", ""),
                "debit": None,
                "credit": None,
                "balance": None,
                "row_type": "item"
            }
            data.append(item_row)
            
            # Add discount if exists
            if item.get("discount_amount", 0) > 0:
                total_discount += item.get("discount_amount", 0)
        
        # Add discount row if there's any discount
        if total_discount > 0:
            discount_row = {
                "jalali_date": "",
                "posting_date": "",
                "reference": "",
                "party_display": "",
                "item_name": "تخفیف کل",
                "qty": None,
                "rate": None,
                "item_amount": -total_discount,
                "remarks": "مجموع تخفیفات",
                "debit": None,
                "credit": None,
                "balance": None,
                "row_type": "discount"
            }
            data.append(discount_row)
    
    # Add total row
    total_row = {
        "jalali_date": "",
        "posting_date": "",
        "reference": "",
        "party_display": "جمع",
        "item_name": "",
        "qty": None,
        "rate": None,
        "item_amount": None,
        "remarks": "جمع کل",
        "debit": total_debit,
        "credit": total_credit,
        "balance": total_debit - total_credit,
        "row_type": "total"
    }
    data.append(total_row)
    
    # Add closing row
    closing_balance = opening_balance + total_debit - total_credit
    closing_row = {
        "jalali_date": "",
        "posting_date": "",
        "reference": "",
        "party_display": "بسته شدن (افتتاحیه + جمع)",
        "item_name": "",
        "qty": None,
        "rate": None,
        "item_amount": None,
        "remarks": "مانده نهایی",
        "debit": opening_balance + total_debit if opening_balance > 0 else total_debit,
        "credit": abs(opening_balance) + total_credit if opening_balance < 0 else total_credit,
        "balance": closing_balance,
        "row_type": "closing"
    }
    data.append(closing_row)
    
    return data


def get_opening_balance(filters):
    """Calculate opening balance before from_date"""
    if not (filters.get("from_date") and (filters.get("account") or filters.get("party"))):
        return 0
    
    conditions = []
    params = dict(filters)
    
    if filters.get("account"):
        accounts = frappe.parse_json(filters.get("account"))
        account_list = get_accounts_with_children(accounts)
        if account_list:
            conditions.append("account in %(account_list)s")
            params["account_list"] = account_list
    
    if filters.get("party_type") and filters.get("party"):
        conditions.append("party_type = %(party_type)s")
        parties = frappe.parse_json(filters.get("party"))
        conditions.append("party in %(party)s")
        params["party"] = parties
    
    conditions.append("posting_date < %(from_date)s")
    conditions.append("company = %(company)s")
    conditions.append("is_cancelled = 0")
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    result = frappe.db.sql(f"""
        SELECT COALESCE(SUM(debit - credit), 0) as opening_balance
        FROM `tabGL Entry`
        WHERE {where_clause}
    """, params)
    
    return result[0][0] if result else 0


def get_item_details(voucher_type, voucher_no):
    """Get item details for a specific voucher"""
    item_details = []
    
    # Map voucher types to their item tables
    item_table_map = {
        "Sales Invoice": "Sales Invoice Item",
        "Purchase Invoice": "Purchase Invoice Item", 
        "Sales Order": "Sales Order Item",
        "Purchase Order": "Purchase Order Item",
        "Delivery Note": "Delivery Note Item",
        "Purchase Receipt": "Purchase Receipt Item",
        "Material Request": "Material Request Item",
        "Stock Entry": "Stock Entry Detail"
    }
    
    if voucher_type not in item_table_map:
        return item_details
    
    item_table = item_table_map[voucher_type]
    
    try:
        # Get item details from appropriate child table
        if voucher_type == "Stock Entry":
            items = frappe.db.sql(f"""
                SELECT 
                    item_code,
                    item_name,
                    qty,
                    basic_rate as rate,
                    basic_amount as amount,
                    description,
                    0 as discount_amount
                FROM `tab{item_table}`
                WHERE parent = %s
                ORDER BY idx
            """, (voucher_no,), as_dict=True)
        else:
            items = frappe.db.sql(f"""
                SELECT 
                    item_code,
                    item_name,
                    qty,
                    rate,
                    amount,
                    description,
                    COALESCE(discount_amount, 0) as discount_amount
                FROM `tab{item_table}`
                WHERE parent = %s
                ORDER BY idx
            """, (voucher_no,), as_dict=True)
        
        item_details.extend(items)
        
    except Exception as e:
        frappe.log_error(f"Error getting item details for {voucher_type} - {voucher_no}: {str(e)}")
    
    return item_details