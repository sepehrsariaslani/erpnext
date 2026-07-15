frappe.pages['financing-calculator'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'طرح اقساط',
		single_column: true
	});

	// ایجاد صفحه محاسبه اقساط
	page.installment_calculator = new InstallmentCalculatorPage(page);
};

class InstallmentCalculatorPage {
	constructor(page) {
		this.page = page;
		this.parent = page.main;
		this.make();
	}

	make() {
		this.setup_fields();
		this.setup_buttons();
		this.setup_results_area();
		this.bind_events();
	}

	setup_fields() {
		// HTML برای فرم محاسبه
		this.parent.html(`
			<div class="installment-calculator-page">
				<div class="row">
					<div class="col-md-8">
						<div class="card">
							<div class="card-header">
								<h4><i class="fa fa-calculator"></i> انتخاب کالاها</h4>
							</div>
							<div class="card-body">
								<div class="items-section">
									<div class="row">
										<div class="col-md-4">
											<label>مشتری</label>
											<select class="form-control" id="customer-select">
												<option value="">انتخاب مشتری...</option>
											</select>
										</div>
										<div class="col-md-4">
											<label>تاریخ</label>
											<input type="date" class="form-control" id="calculation-date" 
												   value="${frappe.datetime.get_today()}">
										</div>
									</div>
								</div>
								
								<hr>
								
								<div class="items-table-section">
									<h5>لیست کالاها</h5>
									<table class="table table-bordered" id="items-table">
										<thead>
											<tr>
												<th width="30%">کالا</th>
												<th width="15%">تعداد</th>
												<th width="20%">قیمت واحد</th>
												<th width="20%">مبلغ کل</th>
												<th width="10%">حذف</th>
												<th width="5%"></th>
											</tr>
										</thead>
										<tbody id="items-tbody">
											<tr class="item-row">
												<td>
													<select class="form-control item-select">
														<option value="">انتخاب کالا...</option>
													</select>
												</td>
												<td>
													<input type="number" class="form-control qty-input" 
														   value="1" min="1" step="0.01">
												</td>
												<td>
													<input type="number" class="form-control rate-input" 
														   value="0" step="0.01">
												</td>
												<td>
													<input type="number" class="form-control amount-input" 
														   value="0" readonly>
												</td>
												<td>
													<button class="btn btn-sm btn-danger remove-item">
														<i class="fa fa-trash"></i>
													</button>
												</td>
											</tr>
										</tbody>
										<tfoot>
											<tr>
												<td colspan="3"><strong>جمع کل:</strong></td>
												<td><strong><span id="total-amount">0</span> ریال</strong></td>
												<td></td>
											</tr>
										</tfoot>
									</table>
									<button class="btn btn-primary btn-sm" id="add-item">
										<i class="fa fa-plus"></i> افزودن کالا
									</button>
								</div>
							</div>
						</div>
						
						<div class="card mt-3">
							<div class="card-header">
								<h4><i class="fa fa-credit-card"></i> شرایط پرداخت</h4>
							</div>
							<div class="card-body">
								<div class="row">
									<div class="col-md-12">
										<div class="form-group">
											<label>نوع محاسبه</label>
											<select class="form-control" id="calculation-type">
												<option value="installments">تعداد اقساط مشخص</option>
												<option value="monthly_amount">مبلغ ماهانه مشخص</option>
											</select>
										</div>
									</div>
								</div>
								
								<div class="row">
									<div class="col-md-6">
										<div class="form-group">
											<label>نوع پیش‌پرداخت</label>
											<select class="form-control" id="down-payment-type">
												<option value="amount">مبلغ مشخص</option>
												<option value="percentage">درصد</option>
											</select>
										</div>
									</div>
									<div class="col-md-6">
										<div class="form-group">
											<label id="down-payment-label">مبلغ پیش‌پرداخت</label>
											<input type="number" class="form-control" id="down-payment" 
												   value="0" step="0.01">
										</div>
									</div>
								</div>
								
								<div class="row">
									<div class="col-md-4">
										<div class="form-group" id="installments-count-group">
											<label>تعداد اقساط</label>
											<select class="form-control" id="installments-count">
												<option value="3">3 قسط</option>
												<option value="6">6 قسط</option>
												<option value="9">9 قسط</option>
												<option value="12">12 قسط</option>
												<option value="18">18 قسط</option>
												<option value="24">24 قسط</option>
											</select>
										</div>
									</div>
									<div class="col-md-4">
										<div class="form-group">
											<label>فاصله زمانی (ماه)</label>
											<select class="form-control" id="installment-interval">
												<option value="1">ماهانه</option>
												<option value="2">دوماهه</option>
												<option value="3">سه‌ماهه</option>
												<option value="6">شش‌ماهه</option>
											</select>
										</div>
									</div>
									<div class="col-md-4">
										<div class="form-group">
											<label>نرخ بهره ماهانه (%)</label>
											<input type="number" class="form-control" id="interest-rate" 
												   value="0" step="0.1" min="0" max="50">
										</div>
									</div>
								</div>

								<div id="monthly-amount-section" style="display: none;">
									<div class="row">
										<div class="col-md-6">
											<div class="form-group">
												<label>مبلغ ماهانه قابل پرداخت</label>
												<input type="number" class="form-control" id="monthly-payment-amount" 
													   value="0" step="1000" min="0">
											</div>
										</div>
										<div class="col-md-6">
											<div class="form-group">
												<label>حداکثر تعداد اقساط مجاز</label>
												<input type="number" class="form-control" id="max-installments" 
													   value="24" min="1" max="60">
											</div>
										</div>
									</div>
								</div>
								
								<div class="form-group">
									<label>تاریخ شروع اقساط</label>
									<input type="date" class="form-control" id="start-date" 
										   value="${frappe.datetime.add_months(frappe.datetime.get_today(), 1)}">
								</div>
							</div>
						</div>
					</div>
					
					<div class="col-md-4">
						<div class="card">
							<div class="card-header">
								<h4><i class="fa fa-bar-chart"></i> خلاصه محاسبات</h4>
							</div>
							<div class="card-body" id="summary-section">
								<div class="summary-loading text-center">
									<i class="fa fa-spinner fa-spin"></i>
									<p>محاسبات را تکمیل کنید</p>
								</div>
							</div>
						</div>
						
						<div class="card mt-3">
							<div class="card-header">
								<h4><i class="fa fa-calendar"></i> برنامه اقساط</h4>
							</div>
							<div class="card-body" id="schedule-section">
								<div class="schedule-loading text-center">
									<i class="fa fa-calendar-o"></i>
									<p>ابتدا محاسبه کنید</p>
								</div>
							</div>
						</div>
					</div>
				</div>
				
				<style>
				.item-select, .form-control {
					font-size: 13px;
				}
				.item-select option {
					padding: 5px;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.summary-stats .stat-item {
					margin-bottom: 10px;
					padding: 8px;
					background: #f8f9fa;
					border-radius: 4px;
					display: flex;
					justify-content: space-between;
				}
				.summary-stats .stat-item.highlight {
					background: #e3f2fd;
					font-weight: bold;
				}
				.summary-stats .stat-item .value {
					font-weight: bold;
					color: #007bff;
				}
				.summary-stats .stat-item .value.interest {
					color: #dc3545;
				}
				.summary-stats .stat-item .value.total {
					color: #28a745;
					font-size: 1.1em;
				}
				.schedule-table th, .schedule-table td {
					text-align: center;
					padding: 8px;
				}
				.schedule-table td:last-child {
					text-align: left;
					font-weight: bold;
				}
				</style>
			</div>
		`);
		
		this.load_customers();
		this.load_items();
	}

	setup_buttons() {
		this.page.set_primary_action('محاسبه', () => {
			this.calculate_installments();
		}, 'calculator');

		this.page.add_menu_item('ذخیره محاسبه', () => {
			this.save_calculation();
		});

		this.page.add_menu_item('ایجاد پیش‌فاکتور', () => {
			this.create_quotation();
		});

		this.page.add_menu_item('صادرات PDF', () => {
			this.export_pdf();
		});
	}

	setup_results_area() {
		// محیط نمایش نتایج آماده شده در HTML بالا
	}

	bind_events() {
		const self = this;

		// تغییر نوع محاسبه
		$(this.parent).on('change', '#calculation-type', function() {
			const type = $(this).val();
			if (type === 'monthly_amount') {
				$('#monthly-amount-section').show();
				$('#installments-count-group').hide();
			} else {
				$('#monthly-amount-section').hide();
				$('#installments-count-group').show();
			}
		});

		// رویداد تغییر نوع پیش‌پرداخت
		$(this.parent).on('change', '#down-payment-type', function() {
			const type = $(this).val();
			if (type === 'percentage') {
				$('#down-payment-label').text('درصد پیش‌پرداخت');
				$('#down-payment').attr('max', '100');
			} else {
				$('#down-payment-label').text('مبلغ پیش‌پرداخت');
				$('#down-payment').removeAttr('max');
			}
		});

		// محاسبه خودکار مبلغ آیتم
		$(this.parent).on('input', '.qty-input, .rate-input', function() {
			self.calculate_item_amount($(this).closest('tr'));
			self.calculate_total();
		});

		// انتخاب کالا
		$(this.parent).on('change', '.item-select', function() {
			self.load_item_details($(this));
		});

		// افزودن ردیف جدید
		$(this.parent).on('click', '#add-item', function() {
			self.add_item_row();
		});

		// حذف ردیف
		$(this.parent).on('click', '.remove-item', function() {
			if ($('#items-tbody tr').length > 1) {
				$(this).closest('tr').remove();
				self.calculate_total();
			}
		});

		// محاسبه خودکار با تغییر شرایط پرداخت
		$(this.parent).on('input change', 
			'#down-payment, #installments-count, #installment-interval, #interest-rate', 
			function() {
				if (self.auto_calculate_timeout) {
					clearTimeout(self.auto_calculate_timeout);
				}
				self.auto_calculate_timeout = setTimeout(() => {
					self.calculate_installments();
				}, 1000);
			}
		);

		// محاسبه خودکار برای مبلغ ماهانه
		$(this.parent).on('input change', 
			'#monthly-payment-amount, #max-installments', 
			function() {
				if ($('#calculation-type').val() === 'monthly_amount') {
					if (self.auto_calculate_timeout) {
						clearTimeout(self.auto_calculate_timeout);
					}
					self.auto_calculate_timeout = setTimeout(() => {
						self.calculate_installments();
					}, 1000);
				}
			}
		);
	}

	load_customers() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Customer',
				fields: ['name', 'customer_name'],
				filters: [['disabled', '=', 0]],
				limit_page_length: 100,
				order_by: 'customer_name asc'
			},
			callback: (r) => {
				if (r.message) {
					let options = '<option value="">انتخاب مشتری...</option>';
					r.message.forEach(customer => {
						const displayName = customer.customer_name || customer.name;
						options += `<option value="${customer.name}" title="${displayName}">${displayName}</option>`;
					});
					$('#customer-select').html(options);
				}
			}
		});
	}

	load_items() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Item',
				fields: ['item_code', 'item_name', 'standard_rate'],
				filters: [
					['disabled', '=', 0],
					['is_sales_item', '=', 1]
				],
				limit_page_length: 500,
				order_by: 'item_name asc'
			},
			callback: (r) => {
				if (r.message) {
					this.items_list = r.message;
					this.update_item_selects();
				}
			}
		});
	}

	update_item_selects() {
		let options = '<option value="">انتخاب کالا...</option>';
		this.items_list.forEach(item => {
			const displayName = item.item_name ? `${item.item_name} (${item.item_code})` : item.item_code;
			options += `<option value="${item.item_code}" data-rate="${item.standard_rate || 0}" title="${displayName}">
						${displayName}</option>`;
		});
		$('.item-select').html(options);
	}

	load_item_details($select) {
		const item_code = $select.val();
		const rate = parseFloat($select.find('option:selected').data('rate')) || 0;
		
		if (item_code && rate > 0) {
			$select.closest('tr').find('.rate-input').val(rate);
			this.calculate_item_amount($select.closest('tr'));
			this.calculate_total();
		}
	}

	add_item_row() {
		const newRow = `
			<tr class="item-row">
				<td>
					<select class="form-control item-select">
						<option value="">انتخاب کالا...</option>
					</select>
				</td>
				<td>
					<input type="number" class="form-control qty-input" 
						   value="1" min="1" step="0.01">
				</td>
				<td>
					<input type="number" class="form-control rate-input" 
						   value="0" step="0.01">
				</td>
				<td>
					<input type="number" class="form-control amount-input" 
						   value="0" readonly>
				</td>
				<td>
					<button class="btn btn-sm btn-danger remove-item">
						<i class="fa fa-trash"></i>
					</button>
				</td>
			</tr>
		`;
		
		$('#items-tbody').append(newRow);
		this.update_item_selects();
	}

	calculate_item_amount($row) {
		const qty = parseFloat($row.find('.qty-input').val()) || 0;
		const rate = parseFloat($row.find('.rate-input').val()) || 0;
		const amount = qty * rate;
		
		$row.find('.amount-input').val(amount.toFixed(2));
	}

	calculate_total() {
		let total = 0;
		$('.amount-input').each(function() {
			total += parseFloat($(this).val()) || 0;
		});
		
		$('#total-amount').text(this.format_currency(total));
		return total;
	}

	calculate_installments() {
		const total_amount = this.calculate_total();
		const down_payment_type = $('#down-payment-type').val();
		let down_payment = parseFloat($('#down-payment').val()) || 0;
		
		if (down_payment_type === 'percentage') {
			down_payment = (down_payment / 100) * total_amount;
		}
		
		const installments_count = parseInt($('#installments-count').val());
		const interest_rate = parseFloat($('#interest-rate').val()) || 0;
		const start_date = $('#start-date').val();
		const interval = parseInt($('#installment-interval').val());
		const calculation_type = $('#calculation-type').val();
		const monthly_payment = parseFloat($('#monthly-payment-amount').val()) || 0;
		const max_installments = parseInt($('#max-installments').val()) || 24;

		if (total_amount <= 0) {
			frappe.show_alert('ابتدا کالاهای مورد نظر را انتخاب کنید', 'red');
			return;
		}

		// بررسی برای حالت مبلغ ماهانه
		if (calculation_type === 'monthly_amount' && monthly_payment <= 0) {
			frappe.show_alert('لطفاً مبلغ ماهانه قابل پرداخت را وارد کنید', 'red');
			return;
		}

		// تعیین متد API بر اساس نوع محاسبه
		const api_method = calculation_type === 'monthly_amount' 
			? 'erpnext.selling.page.financing_calculator.financing_calculator.calculate_by_monthly_amount'
			: 'erpnext.selling.page.financing_calculator.financing_calculator.calculate_installment_preview';

		const api_args = calculation_type === 'monthly_amount' 
			? {
				total_amount: total_amount,
				down_payment: down_payment,
				monthly_payment: monthly_payment,
				max_installments: max_installments,
				interest_rate: interest_rate,
				start_date: start_date,
				interval_months: interval
			  }
			: {
				total_amount: total_amount,
				down_payment: down_payment,
				no_of_installments: installments_count,
				interest_rate: interest_rate,
				start_date: start_date,
				interval_months: interval
			  };

		frappe.call({
			method: api_method,
			args: api_args,
			callback: (r) => {
				if (r.message && !r.message.error) {
					this.display_results(r.message);
				} else {
					frappe.show_alert(r.message.error || 'خطا در محاسبه', 'red');
				}
			}
		});
	}

	display_results(data) {
		const summary = data.summary;
		const schedule = data.schedule;

		// نمایش خلاصه محاسبات
		$('#summary-section').html(`
			<div class="summary-stats">
				<div class="stat-item">
					<label>مبلغ کل:</label>
					<span class="value">${this.format_currency(summary.total_amount)}</span>
				</div>
				<div class="stat-item">
					<label>پیش‌پرداخت:</label>
					<span class="value">${this.format_currency(summary.down_payment)}</span>
				</div>
				<div class="stat-item">
					<label>مبلغ باقی‌مانده:</label>
					<span class="value">${this.format_currency(summary.remaining_amount)}</span>
				</div>
				<div class="stat-item highlight">
					<label>مبلغ هر قسط:</label>
					<span class="value">${this.format_currency(summary.installment_amount)}</span>
				</div>
				<div class="stat-item">
					<label>تعداد اقساط:</label>
					<span class="value">${summary.no_of_installments || schedule.length} قسط</span>
				</div>
				<div class="stat-item">
					<label>کل بهره:</label>
					<span class="value interest">${this.format_currency(summary.total_interest)}</span>
				</div>
				<div class="stat-item highlight">
					<label>کل پرداختی:</label>
					<span class="value total">${this.format_currency(summary.total_payable)}</span>
				</div>
			</div>
		`);

		// نمایش برنامه اقساط
		let scheduleHtml = `
			<div class="table-responsive">
				<table class="table table-sm table-bordered schedule-table">
					<thead>
						<tr>
							<th>قسط</th>
							<th>تاریخ</th>
							<th>مبلغ</th>
						</tr>
					</thead>
					<tbody>
		`;

		schedule.forEach(installment => {
			scheduleHtml += `
				<tr>
					<td>${installment.installment_no}</td>
					<td>${this.format_date(installment.due_date)}</td>
					<td class="text-left">${this.format_currency(installment.amount)}</td>
				</tr>
			`;
		});

		scheduleHtml += `
					</tbody>
				</table>
			</div>
		`;

		$('#schedule-section').html(scheduleHtml);
		
		this.current_calculation = data;
	}

	save_calculation() {
		if (!this.current_calculation) {
			frappe.show_alert('ابتدا محاسبه را انجام دهید', 'orange');
			return;
		}

		const customer = $('#customer-select').val();
		if (!customer) {
			frappe.show_alert('لطفاً مشتری را انتخاب کنید', 'orange');
			return;
		}

		// جمع‌آوری داده‌های آیتم‌ها
		const items = [];
		$('#items-tbody tr').each(function() {
			const item_code = $(this).find('.item-select').val();
			const qty = $(this).find('.qty-input').val();
			const rate = $(this).find('.rate-input').val();
			const amount = $(this).find('.amount-input').val();

			if (item_code && qty && rate) {
				items.push({
					item_code: item_code,
					qty: parseFloat(qty),
					rate: parseFloat(rate),
					amount: parseFloat(amount)
				});
			}
		});

		// ایجاد سند محاسبه اقساط
		frappe.call({
			method: 'frappe.client.insert',
			args: {
				doc: {
					doctype: 'Installment Calculation',
					title: `محاسبه اقساط - ${customer}`,
					customer: customer,
					date: $('#calculation-date').val(),
					calculation_type: $('#calculation-type').val() === 'monthly_amount' ? 'Monthly Amount' : 'Fixed Installments',
					total_amount: this.current_calculation.summary.total_amount,
					down_payment_type: $('#down-payment-type').val() === 'percentage' ? 'Percentage' : 'Amount',
					down_payment_percent: $('#down-payment-type').val() === 'percentage' ? $('#down-payment').val() : 0,
					down_payment_amount: this.current_calculation.summary.down_payment,
					no_of_installments: this.current_calculation.summary.no_of_installments || this.current_calculation.schedule.length,
					installment_interval_months: parseInt($('#installment-interval').val()),
					interest_rate: parseFloat($('#interest-rate').val()),
					start_date: $('#start-date').val(),
					monthly_payment_amount: $('#calculation-type').val() === 'monthly_amount' ? parseFloat($('#monthly-payment-amount').val()) : 0,
					items: items
				}
			},
			callback: (r) => {
				if (r.message) {
					frappe.show_alert('محاسبه با موفقیت ذخیره شد', 'green');
					frappe.set_route('Form', 'Installment Calculation', r.message.name);
				}
			}
		});
	}

	create_quotation() {
		if (!this.current_calculation) {
			frappe.show_alert('ابتدا محاسبه را ذخیره کنید', 'orange');
			return;
		}

		frappe.show_alert('این قابلیت بعد از ذخیره محاسبه فعال می‌شود', 'blue');
	}

	export_pdf() {
		if (!this.current_calculation) {
			frappe.show_alert('ابتدا محاسبه را انجام دهید', 'orange');
			return;
		}

		frappe.show_alert('قابلیت صادرات PDF بزودی اضافه خواهد شد', 'blue');
	}

	format_currency(amount) {
		if (!amount) return '0';
		return new Intl.NumberFormat('fa-IR').format(Math.round(amount)) + ' ریال';
	}

	format_date(date_string) {
		const date = new Date(date_string);
		return new Intl.DateTimeFormat('fa-IR').format(date);
	}
}