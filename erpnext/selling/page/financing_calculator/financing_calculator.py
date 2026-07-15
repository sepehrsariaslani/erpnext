import frappe
from frappe import _
import math
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from dateutil.relativedelta import relativedelta

@frappe.whitelist()
def calculate_by_monthly_amount(total_amount, down_payment, monthly_amount, interest_rate, start_date, interval_months=1):
    """
    محاسبه اقساط بر اساس مبلغ ماهانه مشخص
    """
    try:
        total_amount = float(total_amount or 0)
        down_payment = float(down_payment or 0)
        monthly_amount = monthly_payment
        interest_rate = float(interest_rate or 0) / 100
        interval_months = int(interval_months or 1)

        if total_amount <= 0:
            return {"error": "مبلغ کل باید بیشتر از صفر باشد"}
        if down_payment < 0:
            return {"error": "پیش‌پرداخت نمی‌تواند منفی باشد"}
        if down_payment >= total_amount:
            return {"error": "پیش‌پرداخت نمی‌تواند بیشتر یا مساوی مبلغ کل باشد"}
        if monthly_amount <= 0:
            return {"error": "مبلغ قسط باید بیشتر از صفر باشد"}

        remaining_amount = total_amount - down_payment
        schedule = []
        current_balance = remaining_amount
        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d")
        installment_no = 0

        while current_balance > 0:
            installment_no += 1
            due_date = start_date_obj + relativedelta(months=(installment_no - 1) * interval_months)
            interest_for_period = current_balance * (interest_rate / 12 * interval_months) if interest_rate > 0 else 0
            principal_payment = monthly_amount - interest_for_period

            # اگر قسط بیشتر از موجودی شد
            if principal_payment > current_balance:
                principal_payment = current_balance
                monthly_amount = principal_payment + interest_for_period

            current_balance -= principal_payment

            schedule.append({
                "installment_no": installment_no,
                "due_date": due_date.strftime("%Y-%m-%d"),
                "amount": round(monthly_amount, 2),
                "principal": round(principal_payment, 2),
                "interest": round(interest_for_period, 2),
                "balance": max(0, round(current_balance, 2))
            })

        total_installments = sum([s["amount"] for s in schedule])
        total_interest = total_installments - remaining_amount
        total_payable = down_payment + total_installments

        summary = {
            "total_amount": round(total_amount, 2),
            "down_payment": round(down_payment, 2),
            "remaining_amount": round(remaining_amount, 2),
            "monthly_amount": round(monthly_amount, 2),
            "total_interest": round(total_interest, 2),
            "total_payable": round(total_payable, 2),
            "no_of_installments": len(schedule),
            "interest_rate_percent": round(interest_rate * 100, 2)
        }

        return {
            "summary": summary,
            "schedule": schedule
        }

    except Exception as e:
        frappe.log_error(f"خطا در محاسبه اقساط بر اساس مبلغ ماهانه: {str(e)}")
        return {"error": f"خطا در محاسبه: {str(e)}"}


@frappe.whitelist()
def calculate_installment_preview(total_amount, down_payment, no_of_installments, 
                                interest_rate, start_date, interval_months=1):
    """
    محاسبه پیش‌نمایش اقساط
    """
    try:
        # تبدیل پارامترها به نوع مناسب
        total_amount = float(total_amount or 0)
        down_payment = float(down_payment or 0)
        no_of_installments = int(no_of_installments or 1)
        interest_rate = float(interest_rate or 0) / 100  # تبدیل درصد به اعشار
        interval_months = int(interval_months or 1)
        
        # اعتبارسنجی ورودی‌ها
        if total_amount <= 0:
            return {"error": "مبلغ کل باید بیشتر از صفر باشد"}
            
        if down_payment < 0:
            return {"error": "پیش‌پرداخت نمی‌تواند منفی باشد"}
            
        if down_payment >= total_amount:
            return {"error": "پیش‌پرداخت نمی‌تواند بیشتر یا مساوی مبلغ کل باشد"}
            
        if no_of_installments <= 0:
            return {"error": "تعداد اقساط باید بیشتر از صفر باشد"}
        
        # محاسبه مبلغ باقی‌مانده
        remaining_amount = total_amount - down_payment
        
        if remaining_amount <= 0:
            return {
                "summary": {
                    "total_amount": total_amount,
                    "down_payment": down_payment,
                    "remaining_amount": 0,
                    "installment_amount": 0,
                    "total_interest": 0,
                    "total_payable": total_amount
                },
                "schedule": []
            }
        
        # محاسبه مبلغ هر قسط با فرمول اقساط مرکب
        if interest_rate > 0:
            # فرمول محاسبه قسط با بهره مرکب
            # PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
            monthly_rate = interest_rate / 12 * interval_months  # نرخ بهره برای هر دوره
            installment_amount = remaining_amount * (
                (monthly_rate * (1 + monthly_rate) ** no_of_installments) /
                ((1 + monthly_rate) ** no_of_installments - 1)
            )
        else:
            # بدون بهره - تقسیم ساده
            installment_amount = remaining_amount / no_of_installments
        
        # محاسبه جدول اقساط
        schedule = []
        current_balance = remaining_amount
        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d")
        
        for i in range(no_of_installments):
            installment_no = i + 1
            due_date = start_date_obj + relativedelta(months=(i * interval_months))
            
            if interest_rate > 0:
                # محاسبه بهره برای این دوره
                interest_for_period = current_balance * (interest_rate / 12 * interval_months)
                principal_payment = installment_amount - interest_for_period
                
                # برای قسط آخر، اطمینان از صفر شدن موجودی
                if installment_no == no_of_installments:
                    principal_payment = current_balance
                    installment_amount = principal_payment + interest_for_period
                
                current_balance -= principal_payment
            else:
                interest_for_period = 0
                principal_payment = installment_amount
                current_balance -= principal_payment
            
            schedule.append({
                "installment_no": installment_no,
                "due_date": due_date.strftime("%Y-%m-%d"),
                "amount": round(installment_amount, 2),
                "principal": round(principal_payment, 2) if interest_rate > 0 else round(installment_amount, 2),
                "interest": round(interest_for_period, 2),
                "balance": max(0, round(current_balance, 2))
            })
        
        # محاسبه خلاصه
        total_installments = sum([s["amount"] for s in schedule])
        total_interest = total_installments - remaining_amount
        total_payable = down_payment + total_installments
        
        summary = {
            "total_amount": round(total_amount, 2),
            "down_payment": round(down_payment, 2),
            "remaining_amount": round(remaining_amount, 2),
            "installment_amount": round(installment_amount, 2),
            "total_interest": round(total_interest, 2),
            "total_payable": round(total_payable, 2),
            "no_of_installments": no_of_installments,
            "interest_rate_percent": round(interest_rate * 100, 2)
        }
        
        return {
            "summary": summary,
            "schedule": schedule
        }
        
    except Exception as e:
        frappe.log_error(f"خطا در محاسبه اقساط: {str(e)}")
        return {"error": f"خطا در محاسبه: {str(e)}"}


@frappe.whitelist()
def get_item_price(item_code, price_list=None, customer=None):
    """
    دریافت قیمت کالا
    """
    try:
        if not price_list:
            price_list = frappe.get_cached_value('Selling Settings', None, 'selling_price_list')
        
        # جستجو در Item Price
        price = frappe.get_value(
            'Item Price',
            {
                'item_code': item_code,
                'price_list': price_list,
                'selling': 1
            },
            'price_list_rate'
        )
        
        if price:
            return {"price": price}
        
        # اگر قیمت پیدا نشد، از standard_rate استفاده کن
        standard_rate = frappe.get_value('Item', item_code, 'standard_rate')
        
        return {"price": standard_rate or 0}
        
    except Exception as e:
        return {"error": str(e)}


@frappe.whitelist()
def create_quotation_from_calculation(calculation_data):
    """
    ایجاد پیش‌فاکتور از روی محاسبه اقساط
    """
    try:
        # ایجاد پیش‌فاکتور جدید
        quotation = frappe.new_doc("Quotation")
        quotation.party_name = calculation_data.get("customer")
        quotation.quotation_to = "Customer"
        quotation.transaction_date = calculation_data.get("date", frappe.utils.today())
        
        # افزودن آیتم‌ها
        for item in calculation_data.get("items", []):
            quotation.append("items", {
                "item_code": item.get("item_code"),
                "qty": item.get("qty"),
                "rate": item.get("rate"),
                "amount": item.get("amount")
            })
        
        # افزودن جزئیات اقساط در توضیحات
        terms = f"""شرایط پرداخت اقساطی:
        - پیش‌پرداخت: {calculation_data.get('down_payment_amount', 0):,.0f} ریال
        - تعداد اقساط: {calculation_data.get('no_of_installments')} قسط
        - مبلغ هر قسط: {calculation_data.get('installment_amount', 0):,.0f} ریال
        - نرخ بهره: {calculation_data.get('interest_rate', 0)}% ماهانه
        - تاریخ شروع اقساط: {calculation_data.get('start_date')}
        """
        
        quotation.terms = terms
        quotation.save()
        
        return {"quotation": quotation.name, "message": "پیش‌فاکتور با موفقیت ایجاد شد"}
        
    except Exception as e:
        return {"error": str(e)}


@frappe.whitelist()
def get_customer_details(customer):
    """
    دریافت جزئیات مشتری
    """
    try:
        customer_doc = frappe.get_doc("Customer", customer)
        return {
            "customer_name": customer_doc.customer_name,
            "customer_group": customer_doc.customer_group,
            "territory": customer_doc.territory,
            "default_price_list": customer_doc.default_price_list
        }
    except Exception as e:
        return {"error": str(e)}


def calculate_simple_interest(principal, rate, time_months):
    """
    محاسبه بهره ساده
    """
    return principal * (rate / 100) * (time_months / 12)


def calculate_compound_interest(principal, rate, time_months, compound_frequency=12):
    """
    محاسبه بهره مرکب
    """
    # A = P(1 + r/n)^(nt)
    # compound_frequency = تعداد دفعات تراکم در سال (معمولاً 12 برای ماهانه)
    amount = principal * (1 + (rate/100) / compound_frequency) ** (compound_frequency * time_months/12)
    return amount - principal


@frappe.whitelist()
def validate_installment_data(data):
    """
    اعتبارسنجی داده‌های ورودی اقساط
    """
    errors = []
    
    try:
        total_amount = float(data.get('total_amount', 0))
        down_payment = float(data.get('down_payment', 0))
        no_of_installments = int(data.get('no_of_installments', 0))
        interest_rate = float(data.get('interest_rate', 0))
        
        if total_amount <= 0:
            errors.append("مبلغ کل باید بیشتر از صفر باشد")
            
        if down_payment < 0:
            errors.append("پیش‌پرداخت نمی‌تواند منفی باشد")
            
        if down_payment >= total_amount:
            errors.append("پیش‌پرداخت نمی‌تواند بیشتر یا مساوی مبلغ کل باشد")
            
        if no_of_installments <= 0:
            errors.append("تعداد اقساط باید بیشتر از صفر باشد")
            
        if interest_rate < 0 or interest_rate > 50:
            errors.append("نرخ بهره باید بین 0 تا 50 درصد باشد")
            
        if not data.get('start_date'):
            errors.append("تاریخ شروع اقساط الزامی است")
            
    except ValueError as e:
        errors.append("فرمت داده‌های ورودی نامعتبر است")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }


@frappe.whitelist()
def get_installment_templates():
    """
    دریافت قالب‌های از پیش تعریف شده اقساط
    """
    return [
        {
            "name": "3 ماهه - بدون بهره",
            "installments": 3,
            "interval": 1,
            "interest_rate": 0,
            "down_payment_percent": 30
        },
        {
            "name": "6 ماهه - بهره کم",
            "installments": 6,
            "interval": 1,
            "interest_rate": 1.5,
            "down_payment_percent": 20
        },
        {
            "name": "12 ماهه - استاندارد",
            "installments": 12,
            "interval": 1,
            "interest_rate": 2,
            "down_payment_percent": 15
        },
        {
            "name": "24 ماهه - بلند مدت",
            "installments": 24,
            "interval": 1,
            "interest_rate": 2.5,
            "down_payment_percent": 10
        }
    ]