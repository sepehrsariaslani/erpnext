frappe.pages["bom-comparison-tool"].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("BOM Comparison Tool"),
		single_column: true,
	});

	new erpnext.BOMComparisonTool(page);
};

erpnext.BOMComparisonTool = class BOMComparisonTool {
	constructor(page) {
		this.page = page;
		this.make_form();
	}

	make_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: [
				{
					label: __("BOM 1"),
					fieldname: "name1",
					fieldtype: "Link",
					options: "BOM",
					change: () => this.fetch_and_render(),
					get_query: () => {
						return {
							filters: {
								name: ["not in", [this.form.get_value("name2") || ""]],
							},
						};
					},
				},
				{
					fieldtype: "Column Break",
				},
				{
					label: __("BOM 2"),
					fieldname: "name2",
					fieldtype: "Link",
					options: "BOM",
					change: () => this.fetch_and_render(),
					get_query: () => {
						return {
							filters: {
								name: ["not in", [this.form.get_value("name1") || ""]],
							},
						};
					},
				},
				{
					fieldtype: "Section Break",
				},
				{
					fieldtype: "HTML",
					fieldname: "preview",
				},
			],
			body: this.page.body,
		});
		this.form.make();
	}

	fetch_and_render() {
		let { name1, name2 } = this.form.get_values();
		if (!(name1 && name2)) {
			this.form.get_field("preview").html("");
			return;
		}

		// set working state
		this.form.get_field("preview").html(`
			<div class="text-muted margin-top">
				${__("Fetching...")}
			</div>
		`);

		frappe
			.call("erpnext.manufacturing.doctype.bom.bom.get_bom_diff_custom", {
				bom1: name1,
				bom2: name2,
			})
			.then((r) => {
				let diff = r.message;
				frappe.model.with_doctype("BOM", () => {
					this.render("BOM", name1, name2, diff);
				});
			});
	}

	render(doctype, name1, name2, diff) {
		// Manual translation map for common fields
		const label_map = {
			"Item": "آیتم",
			"Raw Material Cost": "هزینه مواد اولیه",
			"Raw Material Cost (Company Currency)": "هزینه مواد اولیه (ارز شرکت)",
			"Total Cost": "هزینه کل",
			"Total Cost (Company Currency)": "هزینه کل (ارز شرکت)",
			"Item Name": "نام کالا",
			"Item Description": "شرح کالا",
			"Route": "مسیر",
			"Stock Qty": "تعداد موجودی",
			"Qty Consumed Per Unit": "تعداد مصرفی در واحد",
			"Amount": "مبلغ",
			"Rate": "نرخ",
			"Description": "شرح",
			"UOM": "واحد سنجش",
			"Qty": "تعداد",
			"Values Changed": "مقادیر تغییر یافته",
			"Field": "فیلد",
			"Raw Materials": "مواد اولیه",
			"Operations": "عملیات",
			"Overview": "نمای کلی",
			"Time (mins)": "زمان (دقیقه)",
			"Cost": "هزینه",
			"Workstation": "ایستگاه کاری"
		};

		this.diff = diff;
		this.name1 = name1;
		this.name2 = name2;
		this.label_map = label_map;

		let html = `
			<style>
				.bom-col-1 { background-color: var(--control-bg); }
				.bom-col-2 { background-color: var(--bg-blue); }
				[data-theme="dark"] .bom-col-1 { background-color: var(--gray-800); }
				[data-theme="dark"] .bom-col-2 { background-color: var(--gray-700); }
				.diff-action-btn { margin-left: 5px; padding: 1px 4px; font-size: 10px; }
				.bom-toggle-group { display: flex; justify-content: center; margin-bottom: 20px; }
				.bom-toggle-btn { margin: 0 5px; min-width: 120px; }
				.bom-view-section { display: none; }
				.bom-view-section.active { display: block; }
				
				/* RTL Alignment Improvements */
				.table th, .table td { text-align: center; vertical-align: middle !important; }
				.table th { font-weight: bold; background-color: var(--bg-light-gray); }
			</style>
			
			<div class="bom-toggle-group btn-group">
				<button class="btn btn-default bom-toggle-btn active" data-view="overview">${label_map["Overview"]}</button>
				<button class="btn btn-default bom-toggle-btn" data-view="raw_materials">${label_map["Raw Materials"]}</button>
				<button class="btn btn-default bom-toggle-btn" data-view="operations">${label_map["Operations"]}</button>
			</div>

			<div id="view-overview" class="bom-view-section active">
				${this.get_overview_html(diff)}
			</div>
			
			<div id="view-raw_materials" class="bom-view-section">
				${this.get_aggregated_table_html("raw_materials")}
			</div>
			
			<div id="view-operations" class="bom-view-section">
				${this.get_aggregated_table_html("operations")}
			</div>
		`;

		this.form.get_field("preview").html(html);
		this.bind_events();
	}

	get_overview_html(diff) {
		let label_map = this.label_map;
		let change_html = (title, doctype, changed) => {
			let values_changed = this.get_changed_values(doctype, changed)
				.map((change) => {
					let [fieldname, value1, value2] = change;
					let label = frappe.meta.get_label(doctype, fieldname);
					if (label_map[label]) label = label_map[label];

					return `
						<tr>
							<td>${frappe.utils.escape_html(cstr(label))}</td>
							<td class="bom-col-1">${frappe.utils.escape_html(cstr(value1))}</td>
							<td class="bom-col-2">${frappe.utils.escape_html(cstr(value2))}</td>
						</tr>
					`;
				})
				.join("");

			return `
				<h4 class="margin-top text-center">${title}</h4>
				<div>
					<table class="table table-bordered">
						<tr>
							<th width="34%">${__("Field")}</th>
							<th width="33%" class="bom-col-1">${this.name1}</th>
							<th width="33%" class="bom-col-2">${this.name2}</th>
						</tr>
						${values_changed}
					</table>
				</div>
			`;
		};
		return change_html(label_map["Values Changed"], "BOM", diff.changed);
	}

	get_aggregated_table_html(type) {
		let data = this.diff.grouped_diff[type];
		let rows = "";
		let headers = "";
		let label_map = this.label_map;

		if (type === "raw_materials") {
			headers = `
				<th style="text-align: right;">${label_map["Item"]}</th>
				<th>${this.name1}</th>
				<th>${this.name2}</th>
			`;

			Object.values(data).forEach(item => {
				let qty_style = item.qty_1 !== item.qty_2 ? "color: var(--red-500);" : "";

				// Helper to create stacked details
				let make_detail = (qty, rate, amount, bom_name) => `
					<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
						<span class="text-muted" style="font-size: 0.9em;">
							${label_map["Qty"]}:
							<i class="fa fa-pencil text-muted edit-qty-btn pointer" 
								data-bom="${frappe.utils.escape_html(cstr(bom_name))}" 
								data-item="${frappe.utils.escape_html(cstr(item.item_code))}" 
								data-qty="${qty}"
								style="margin-right: 5px; cursor: pointer;"></i>
						</span>
						<span style="font-weight: bold; ${qty_style}">${qty}</span>
					</div>
					<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
						<span class="text-muted" style="font-size: 0.9em;">${label_map["Rate"]}:</span>
						<span>${format_currency(amount / (qty || 1))}</span>
					</div>
					<div style="display: flex; justify-content: space-between;">
						<span class="text-muted" style="font-size: 0.9em;">${label_map["Amount"]}:</span>
						<span>${format_currency(amount)}</span>
					</div>
				`;

				rows += `
					<tr>
						<td style="text-align: right; width: 40%;">
							<div style="font-weight: bold; font-size: 1.1em;">${frappe.utils.escape_html(cstr(item.item_code))}</div>
							<div class="text-muted">${frappe.utils.escape_html(cstr(item.item_name || ""))}</div>
							<div class="text-muted" style="font-size: 0.85em;">${frappe.utils.escape_html(cstr(item.description || ""))}</div>
						</td>
						<td class="bom-col-1" style="width: 30%; vertical-align: top;">
							${make_detail(item.qty_1, 0, item.amount_1, this.name1)}
						</td>
						<td class="bom-col-2" style="width: 30%; vertical-align: top;">
							${make_detail(item.qty_2, 0, item.amount_2, this.name2)}
						</td>
					</tr>
				`;
			});
		} else if (type === "operations") {
			headers = `
				<th style="text-align: right;">${label_map["Operations"]}</th>
				<th>${this.name1}</th>
				<th>${this.name2}</th>
			`;

			Object.values(data).forEach(op => {
				let time_style = op.time_1 !== op.time_2 ? "color: var(--red-500);" : "";

				let make_op_detail = (time, cost, bom_name) => `
					<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
						<span class="text-muted" style="font-size: 0.9em;">
							${label_map["Time (mins)"]}:
							<i class="fa fa-pencil text-muted edit-op-btn pointer" 
								data-bom="${frappe.utils.escape_html(cstr(bom_name))}" 
								data-operation="${frappe.utils.escape_html(cstr(op.operation))}" 
								data-time="${time}"
								style="margin-right: 5px; cursor: pointer;"></i>
						</span>
						<span style="font-weight: bold; ${time_style}">${time}</span>
					</div>
					<div style="display: flex; justify-content: space-between;">
						<span class="text-muted" style="font-size: 0.9em;">${label_map["Cost"]}:</span>
						<span>${format_currency(cost)}</span>
					</div>
				`;

				rows += `
					<tr>
						<td style="text-align: right; width: 40%;">
							<div style="font-weight: bold;">${frappe.utils.escape_html(cstr(op.operation))}</div>
							<div class="text-muted">${frappe.utils.escape_html(cstr(op.workstation || ""))}</div>
						</td>
						<td class="bom-col-1" style="width: 30%; vertical-align: top;">
							${make_op_detail(op.time_1, op.cost_1, this.name1)}
						</td>
						<td class="bom-col-2" style="width: 30%; vertical-align: top;">
							${make_op_detail(op.time_2, op.cost_2, this.name2)}
						</td>
					</tr>
				`;
			});
		}

		return `
			<table class="table table-bordered table-hover">
				<thead>
					<tr>${headers}</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
		`;
	}

	get_action_button(doctype, fieldname, row, bom_index) {
		// Existing edit logic doesn't support aggregated view easily 
		// because row definition is ambiguous.
		return "";
	}

	bind_events() {
		this.form.get_field("preview").$wrapper.off("click");

		// Toggle View Handler
		this.form.get_field("preview").$wrapper.on("click", ".bom-toggle-btn", (e) => {
			let btn = $(e.currentTarget);
			let view = btn.data("view");

			this.form.get_field("preview").$wrapper.find(".bom-toggle-btn").removeClass("active btn-primary").addClass("btn-default");
			btn.removeClass("btn-default").addClass("active btn-primary");

			this.form.get_field("preview").$wrapper.find(".bom-view-section").removeClass("active");
			this.form.get_field("preview").$wrapper.find(`#view-${view}`).addClass("active");
		});

		// Edit Handler (If restored later)
		// ...

		// Drill Down Handler
		this.form.get_field("preview").$wrapper.on("click", ".drill-down-btn", (e) => {
			let bom1 = $(e.currentTarget).data("bom");
			if (bom1) {
				this.form.set_value("name1", bom1);
				this.fetch_and_render();
			}
		});

		// Edit Qty Handler
		this.form.get_field("preview").$wrapper.on("click", ".edit-qty-btn", (e) => {
			let btn = $(e.currentTarget);
			let bom = btn.data("bom");
			let item_code = btn.data("item");
			let current_qty = btn.data("qty");

			// Fetch BOM Hierarchy first
			frappe.call({
				method: "erpnext.manufacturing.doctype.bom.bom.get_flat_bom_hierarchy",
				args: { bom: bom },
				callback: (r) => {
					if (r.exc) {
						frappe.msgprint(__("Error fetching BOM hierarchy. Please check logs."));
						return;
					}
					let boms = r.message || [];
					if (boms.length === 0) {
						// Fallback if empty (should at least have root)
						boms = [{ bom: bom, item: btn.data("item"), level: 0 }];
					}

					let bom_options = boms.map(b => ({
						label: `${b.item} (${b.bom})` + (b.bom === bom ? " [Root]" : ""),
						value: b.bom
					}));

					let d = new frappe.ui.Dialog({
						title: __("ویرایش تعداد"), // Edit Quantity
						fields: [
							{
								label: __("کالا"), // Item
								fieldname: "item_code",
								fieldtype: "Data",
								read_only: 1,
								default: item_code
							},
							{
								label: __("BOM هدف"), // Target BOM
								fieldname: "target_bom",
								fieldtype: "Select",
								options: bom_options,
								default: bom,
								reqd: 1,
								description: __("انتخاب کنید تغییرات روی کدام BOM اعمال شود")
							},
							{
								label: __("تعداد جدید"), // New Quantity
								fieldname: "qty",
								fieldtype: "Float",
								reqd: 1,
								default: current_qty
							}
						],
						primary_action_label: __("بروزرسانی"), // Update
						primary_action: (values) => {
							frappe.call({
								method: "erpnext.manufacturing.doctype.bom.bom.update_bom_item_custom",
								args: {
									bom: bom,
									target_bom: values.target_bom,
									item_code: values.item_code,
									qty: values.qty
								},
								freeze: true,
								callback: (r) => {
									if (!r.exc) {
										frappe.show_alert({
											message: __("BOM Updated"),
											indicator: "green"
										});
										d.hide();
										this.fetch_and_render();
									}
								}
							});
						},
						secondary_action_label: __("حذف"), // Delete
						secondary_action: () => {
							frappe.confirm(__("آیا از حذف این آیتم مطمئن هستید؟"), () => {
								let values = d.get_values();
								frappe.call({
									method: "erpnext.manufacturing.doctype.bom.bom.remove_bom_item_custom",
									args: {
										bom: bom,
										target_bom: values.target_bom,
										item_code: values.item_code
									},
									freeze: true,
									callback: (r) => {
										if (!r.exc) {
											frappe.show_alert({
												message: __("Item Removed"),
												indicator: "green"
											});
											d.hide();
											this.fetch_and_render();
										}
									}
								});
							});
						}
					});
					d.show();
				}
			});
		});

		// Edit Operation Handler
		this.form.get_field("preview").$wrapper.on("click", ".edit-op-btn", (e) => {
			let btn = $(e.currentTarget);
			let bom = btn.data("bom");
			let operation = btn.data("operation");
			let current_time = btn.data("time");

			// Fetch BOM Hierarchy first
			frappe.call({
				method: "erpnext.manufacturing.doctype.bom.bom.get_flat_bom_hierarchy",
				args: { bom: bom },
				callback: (r) => {
					if (r.exc) {
						frappe.msgprint(__("Error fetching BOM hierarchy. Please check logs."));
						return;
					}
					let boms = r.message || [];
					if (boms.length === 0) {
						boms = [{ bom: bom, item: btn.data("item"), level: 0 }];
					}

					let bom_options = boms.map(b => ({
						label: `${b.item} (${b.bom})` + (b.bom === bom ? " [Root]" : ""),
						value: b.bom
					}));

					let d = new frappe.ui.Dialog({
						title: __("ویرایش زمان عملیات"), // Edit Operation Time
						fields: [
							{
								label: __("عملیات"), // Operation
								fieldname: "operation",
								fieldtype: "Data",
								read_only: 1,
								default: operation
							},
							{
								label: __("BOM هدف"), // Target BOM
								fieldname: "target_bom",
								fieldtype: "Select",
								options: bom_options,
								default: bom,
								reqd: 1
							},
							{
								label: __("زمان جدید (دقیقه)"), // New Time
								fieldname: "time_in_mins",
								fieldtype: "Float",
								reqd: 1,
								default: current_time
							}
						],
						primary_action_label: __("بروزرسانی"), // Update
						primary_action: (values) => {
							frappe.call({
								method: "erpnext.manufacturing.doctype.bom.bom.update_bom_operation_custom",
								args: {
									bom: bom,
									target_bom: values.target_bom,
									operation: values.operation,
									time_in_mins: values.time_in_mins
								},
								freeze: true,
								callback: (r) => {
									if (!r.exc) {
										frappe.show_alert({
											message: __("Operation Updated"),
											indicator: "green"
										});
										d.hide();
										this.fetch_and_render();
									}
								}
							});
						},
						secondary_action_label: __("حذف"), // Delete
						secondary_action: () => {
							frappe.confirm(__("آیا از حذف این عملیات مطمئن هستید؟"), () => {
								let values = d.get_values();
								frappe.call({
									method: "erpnext.manufacturing.doctype.bom.bom.remove_bom_operation_custom",
									args: {
										bom: bom,
										target_bom: values.target_bom,
										operation: values.operation
									},
									freeze: true,
									callback: (r) => {
										if (!r.exc) {
											frappe.show_alert({
												message: __("Operation Removed"),
												indicator: "green"
											});
											d.hide();
											this.fetch_and_render();
										}
									}
								});
							});
						}
					});
					d.show();
				}
			});
		});
	}

	get_changed_values(doctype, changed) {
		return changed.filter((change) => {
			let [fieldname, value1, value2] = change;
			if (!value1) value1 = "";
			if (!value2) value2 = "";
			if (value1 === value2) return false;
			let df = frappe.meta.get_docfield(doctype, fieldname);
			if (!df) return false;
			if (df.hidden) return false;
			return true;
		});
	}
};

function group_items(array, fn) {
	return array.reduce((acc, item) => {
		let key = fn(item);
		acc[key] = acc[key] || [];
		acc[key].push(item);
		return acc;
	}, {});
}
