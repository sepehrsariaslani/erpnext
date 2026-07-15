// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.provide("erpnext.selling");

erpnext.sales_common = {
	setup_selling_controller: function () {
		erpnext.selling.SellingController = class SellingController extends erpnext.TransactionController {
			setup() {
				super.setup();
				this.toggle_enable_for_stock_uom("allow_to_edit_stock_uom_qty_for_sales");
				this.frm.email_field = "contact_email";
			}

			onload() {
				super.onload();
				this.setup_queries();
				this.frm.set_query("shipping_rule", function (doc) {
					return {
						filters: {
							shipping_rule_type: "Selling",
							company: doc.company,
						},
					};
				});

				this.frm.set_query("project", function (doc) {
					return {
						query: "erpnext.controllers.queries.get_project_name",
						filters: {
							customer: doc.customer,
							company: doc.company,
						},
					};
				});
			}

			setup_queries() {
				var me = this;

				$.each(
					[
						["customer", "customer"],
						["lead", "lead"],
					],
					function (i, opts) {
						if (me.frm.fields_dict[opts[0]]) me.frm.set_query(opts[0], erpnext.queries[opts[1]]);
					}
				);

				me.frm.set_query("contact_person", erpnext.queries.contact_query);
				me.frm.set_query("company_contact_person", erpnext.queries.company_contact_query);
				me.frm.set_query("customer_address", erpnext.queries.address_query);
				me.frm.set_query("shipping_address_name", erpnext.queries.address_query);
				me.frm.set_query("dispatch_address_name", erpnext.queries.dispatch_address_query);
				me.frm.set_query("company_address", erpnext.queries.company_address_query);

				erpnext.accounts.dimensions.setup_dimension_filters(me.frm, me.frm.doctype);

				if (this.frm.fields_dict.selling_price_list) {
					this.frm.set_query("selling_price_list", function () {
						return { filters: { selling: 1 } };
					});
				}

				if (this.frm.fields_dict.tc_name) {
					this.frm.set_query("tc_name", function () {
						return { filters: { selling: 1 } };
					});
				}

				if (!this.frm.fields_dict["items"]) {
					return;
				}

				if (this.frm.fields_dict["items"].grid.get_field("item_code")) {
					this.frm.set_query("item_code", "items", function () {
						let customer = me.frm.doc.customer;
						if (me.frm.doc.doctype == "Quotation" && me.frm.doc.quotation_to == "Customer") {
							customer = me.frm.doc.party_name;
						}
						return {
							query: "erpnext.controllers.queries.item_query",
							filters: { is_sales_item: 1, customer: customer, has_variants: 0 },
						};
					});
				}

				if (
					this.frm.fields_dict["packed_items"] &&
					this.frm.fields_dict["packed_items"].grid.get_field("batch_no")
				) {
					this.frm.set_query("batch_no", "packed_items", function (doc, cdt, cdn) {
						return me.set_query_for_batch(doc, cdt, cdn);
					});
				}

				if (this.frm.fields_dict["items"].grid.get_field("item_code")) {
					this.frm.set_query("item_tax_template", "items", function (doc, cdt, cdn) {
						return me.set_query_for_item_tax_template(doc, cdt, cdn);
					});
				}
			}

			refresh() {
				super.refresh();

				frappe.dynamic_link = { doc: this.frm.doc, fieldname: "customer", doctype: "Customer" };

				this.frm.toggle_display(
					"customer_name",
					this.frm.doc.customer_name && this.frm.doc.customer_name !== this.frm.doc.customer
				);

				this.toggle_editable_price_list_rate();
				this.change_warehouse_labels_for_return();
			}

			company() {
				super.company();
				this.set_default_company_address();
				if (!this.is_onload) {
					// we don't want to override the mapped contact from prevdoc
					this.set_default_company_contact_person();
				}
			}

			set_default_company_address() {
				if (!frappe.meta.has_field(this.frm.doc.doctype, "company_address")) return;
				var me = this;
				if (this.frm.doc.company) {
					frappe.call({
						method: "erpnext.setup.doctype.company.company.get_default_company_address",
						args: {
							name: this.frm.doc.company,
							existing_address: this.frm.doc.company_address || "",
						},
						debounce: 2000,
						callback: function (r) {
							if (r.message) {
								me.frm.set_value("company_address", r.message);
							} else {
								me.frm.set_value("company_address", "");
							}
						},
					});
				}
			}

			set_default_company_contact_person() {
				if (!frappe.meta.has_field(this.frm.doc.doctype, "company_contact_person")) {
					return;
				}

				if (this.frm.doc.company) {
					frappe.db
						.get_value("Company", this.frm.doc.company, "default_sales_contact")
						.then((r) => {
							if (r.message?.default_sales_contact) {
								this.frm.set_value("company_contact_person", r.message.default_sales_contact);
							} else {
								this.frm.set_value("company_contact_person", "");
							}
						});
				}
			}

			customer() {
				var me = this;
				erpnext.utils.get_party_details(this.frm, null, null, function () {
					me.apply_price_list();
				});
			}

			customer_address() {
				erpnext.utils.get_address_display(this.frm, "customer_address");
				erpnext.utils.set_taxes_from_address(
					this.frm,
					"customer_address",
					"customer_address",
					"shipping_address_name"
				);
			}

			shipping_address_name() {
				erpnext.utils.get_address_display(this.frm, "shipping_address_name", "shipping_address");
				erpnext.utils.set_taxes_from_address(
					this.frm,
					"shipping_address_name",
					"customer_address",
					"shipping_address_name"
				);
			}

			dispatch_address_name() {
				erpnext.utils.get_address_display(this.frm, "dispatch_address_name", "dispatch_address");
			}

			sales_partner() {
				this.apply_pricing_rule();
			}

			campaign() {
				this.apply_pricing_rule();
			}

			selling_price_list() {
				this.apply_price_list();
				this.set_dynamic_labels();
			}

			discount_percentage(doc, cdt, cdn) {
				var item = frappe.get_doc(cdt, cdn);
				item.discount_amount = 0.0;
				this.apply_discount_on_item(doc, cdt, cdn, "discount_percentage");
			}

			discount_amount(doc, cdt, cdn) {
				if (doc.name === cdn) {
					return;
				}

				var item = frappe.get_doc(cdt, cdn);
				item.discount_percentage = 0.0;
				this.apply_discount_on_item(doc, cdt, cdn, "discount_amount");
			}
			commission_rate() {
				// اگر داریم کمیسیون محاسبه می‌کنیم، کاری نکن
				if (this._calculating_commission) {
					console.log("🔴 commission_rate() event blocked during calculation");
					return;
				}

				console.log("🔵 commission_rate() event triggered");
				this.calculate_commission();
			}

			// وقتی درصد تخفیف زیرکار تغییر میکنه، کمیسیون رو دوباره حساب کن
			structure_disscount() {
				if (this._calculating_commission) return;
				console.log("🔵 structure_disscount() changed - recalculating commission");
				this.calculate_commission();
			}

			// وقتی total_structure تغییر میکنه
			total_structure() {
				if (this._calculating_commission) return;
				console.log("🔵 total_structure() changed - recalculating commission");
				this.calculate_commission();
			}


			total_commission() {
				// اگر داریم کمیسیون محاسبه می‌کنیم، کاری نکن
				if (this._calculating_commission) {
					console.log("🔴 total_commission() event blocked during calculation");
					return;
				}

				console.log("🔵 total_commission() event triggered");

				frappe.model.round_floats_in(this.frm.doc, [
					"amount_eligible_for_commission",
					"total_commission",
				]);

				const { amount_eligible_for_commission } = this.frm.doc;
				if (!amount_eligible_for_commission) return;

				// فقط اگر total_commission دستی تغییر کرده باشه، commission_rate رو محاسبه کن
				this.frm.set_value(
					"commission_rate",
					flt((this.frm.doc.total_commission * 100.0) / amount_eligible_for_commission)
				);
			}


			allocated_percentage(doc, cdt, cdn) {
				var sales_person = frappe.get_doc(cdt, cdn);
				if (sales_person.allocated_percentage) {
					sales_person.allocated_percentage = flt(
						sales_person.allocated_percentage,
						precision("allocated_percentage", sales_person)
					);

					sales_person.allocated_amount = flt(
						(this.frm.doc.amount_eligible_for_commission * sales_person.allocated_percentage) /
						100.0,
						precision("allocated_amount", sales_person)
					);
					refresh_field(["allocated_amount"], sales_person);

					this.calculate_incentive(sales_person);
					refresh_field(
						["allocated_percentage", "allocated_amount", "commission_rate", "incentives"],
						sales_person.name,
						sales_person.parentfield
					);
				}
			}

			sales_person(doc, cdt, cdn) {
				var row = frappe.get_doc(cdt, cdn);
				this.calculate_incentive(row);
				refresh_field("incentives", row.name, row.parentfield);
			}

			warehouse(doc, cdt, cdn) {
				if (doc.docstatus === 0 && doc.is_return && !doc.return_against) {
					frappe.model.set_value(cdt, cdn, "incoming_rate", 0.0);
				}

				this.set_actual_qty(doc, cdt, cdn);
			}

			set_actual_qty(doc, cdt, cdn) {
				let row = locals[cdt][cdn];
				let sales_doctypes = ["Sales Invoice", "Delivery Note", "Sales Order", "Quotation"];

				if (row.item_code && row.warehouse && sales_doctypes.includes(doc.doctype)) {
					return this.frm.call({
						method: "erpnext.stock.get_item_details.get_bin_details",
						child: row,
						args: {
							item_code: row.item_code,
							warehouse: row.warehouse,
							company: doc.company,
							include_child_warehouses: true,
						},
					});
				}
			}

			toggle_editable_price_list_rate() {
				var df = frappe.meta.get_docfield(
					this.frm.doc.doctype + " Item",
					"price_list_rate",
					this.frm.doc.name
				);
				var editable_price_list_rate = cint(frappe.defaults.get_default("editable_price_list_rate"));

				if (df && editable_price_list_rate) {
					const parent_field = frappe.meta.get_parentfield(
						this.frm.doc.doctype,
						this.frm.doc.doctype + " Item"
					);
					if (!this.frm.fields_dict[parent_field]) return;

					this.frm.fields_dict[parent_field].grid.update_docfield_property(
						"price_list_rate",
						"read_only",
						0
					);
				}
			}

			// جایگزین تابع calculate_commission
			calculate_commission() {
				if (!this.frm.fields_dict.commission_rate) return;

				// گرد کردن اعداد
				frappe.model.round_floats_in(this.frm.doc, ["amount_eligible_for_commission", "commission_rate"]);

				// کنترل بازه مجاز برای نرخ کمیسیون
				if (!(0 <= flt(this.frm.doc.commission_rate) && flt(this.frm.doc.commission_rate) <= 100.0)) {
					frappe.throw(
						`${frappe.meta.get_label(this.frm.doc.doctype, "commission_rate")} ${__("must be between 0 and 100")}`
					);
				}

				// محاسبه مجموع مبلغ آیتم‌هایی که اجازه پورسانت دارند
				this.frm.doc.amount_eligible_for_commission = flt(this.frm.doc.total_structure || 0);
				this.frm.doc.total_commission = 0.0;
				console.log(`Amount eligible for commission: ${this.frm.doc.amount_eligible_for_commission}`);


				// نمایش فیلد
				refresh_field("amount_eligible_for_commission");

				// سپس سهم‌ها و مشوق‌ها رو محاسبه کن
				this.calculate_contribution();
			}


			calculate_contribution() {
				var me = this;

				// بررسی وجود فیلد sales_team
				if (!me.frm.fields_dict.sales_team) return;

				// فقط وقتی فرم Draft است اجرا شود
				if (me.frm.doc.docstatus !== 0) return;

				// Flag برای جلوگیری از cycle
				if (me._calculating_commission) {
					console.log("🔴 Commission calculation cycle prevented!");
					return;
				}
				me._calculating_commission = true;

				console.log("🔵 calculate_contribution() START");
				console.log("Current total_commission:", me.frm.doc.total_commission);

				// باقی کد...
				var total_allocated_percentage = 0.0;
				var sales_team = me.frm.doc.sales_team || [];
				me.validate_sales_team();

				var structure_discount = flt(me.frm.doc.structure_disscount || 0);
				var base_amount = flt(me.frm.doc.amount_eligible_for_commission || 0);
				console.log(`Structure discount: ${structure_discount}%`);
				console.log(`Base amount for commission: ${base_amount}`);
				var total_commission_calculated = 0.0;

				$.each(sales_team, function (i, sales_person) {
					frappe.model.round_floats_in(sales_person);

					var individual_commission_rate = flt(sales_person.commission_rate || 0);
					var effective_commission_rate = Math.max(individual_commission_rate - structure_discount, 0);
					var allocated_percentage = flt(sales_person.allocated_percentage || 0);

					sales_person.allocated_amount = flt(
						base_amount * allocated_percentage / 100.0,
						precision("allocated_amount", sales_person)
					);

					if (effective_commission_rate > 0) {
						sales_person.incentives = flt(
							base_amount * effective_commission_rate / 100.0 * allocated_percentage / 100.0,
							precision("incentives", sales_person)
						);
					} else {
						sales_person.incentives = 0.0;
					}

					total_allocated_percentage += allocated_percentage;
					total_commission_calculated += flt(sales_person.incentives || 0);
					// لاگ تفصیلی برای هر فروشنده
					console.log(`
				Sales Person: ${sales_person.sales_person}
				- Individual Commission Rate: ${individual_commission_rate}%
				- Structure Discount: ${structure_discount}%
				- Effective Rate: ${effective_commission_rate}%
				- Allocated Percentage: ${allocated_percentage}%
				- Allocated Amount: ${sales_person.allocated_amount.toLocaleString()}
				- Final Incentives: ${sales_person.incentives.toLocaleString()}
				`);

					refresh_field(["allocated_amount", "incentives"], sales_person.name, sales_person.parentfield);
				});

				// اعتبارسنجی درصدها
				if (sales_team.length > 0 && Math.abs(total_allocated_percentage - 100.0) > 0.01) {
					me._calculating_commission = false; // reset flag قبل از throw
					frappe.throw(__(`Total allocated percentage for sales team should be 100%. Current total: ${total_allocated_percentage}%`));
				}

				// تنظیم total_commission بدون trigger کردن event
				me.frm.doc.total_commission = flt(total_commission_calculated, precision("total_commission"));

				console.log("Final total_commission:", me.frm.doc.total_commission);
				console.log(`Total Commission Calculated: ${me.frm.doc.total_commission.toLocaleString()}`);


				// فقط refresh کن، set_value نکن
				refresh_field("total_commission");

				// reset flag
				me._calculating_commission = false;
				console.log("🔵 calculate_contribution() END");
			}


			// جایگزین تابع calculate_incentive (برای فراخوانی جداگانه در صورت نیاز)
			calculate_incentive(row) {
				var structure_discount = flt(this.frm.doc.structure_disscount || 0);
				var base_amount = flt(this.frm.doc.amount_eligible_for_commission || 0);
				var allocated_percentage = flt(row.allocated_percentage || 0);

				// محاسبه مبلغ تخصیصی
				row.allocated_amount = flt(
					base_amount * allocated_percentage / 100.0,
					precision("allocated_amount", row)
				);

				// محاسبه مشوق
				var individual_rate = flt(row.commission_rate || 0);
				var effective_rate = Math.max(individual_rate - structure_discount, 0);

				if (effective_rate > 0) {
					row.incentives = flt(
						base_amount * effective_rate / 100.0 * allocated_percentage / 100.0,
						precision("incentives", row)
					);
				} else {
					row.incentives = 0.0;
				}

				// محاسبه مجدد total_commission
				this.calculate_contribution();
			}

			validate_sales_team() {
				var sales_team = this.frm.doc.sales_team || [];

				$.each(sales_team, function (i, sales_person) {
					// بررسی نرخ کمیسیون
					if (!(0 <= flt(sales_person.commission_rate || 0) && flt(sales_person.commission_rate || 0) <= 100)) {
						frappe.throw(__(`Commission rate for ${sales_person.sales_person} must be between 0 and 100%`));
					}

					// بررسی درصد تخصیص
					if (!(0 <= flt(sales_person.allocated_percentage || 0) && flt(sales_person.allocated_percentage || 0) <= 100)) {
						frappe.throw(__(`Allocated percentage for ${sales_person.sales_person} must be between 0 and 100%`));
					}
				});
			}

			set_dynamic_labels() {
				super.set_dynamic_labels();
				this.set_product_bundle_help(this.frm.doc);
			}

			set_product_bundle_help(doc) {
				if (!this.frm.fields_dict.packing_list) return;
				if ((doc.packed_items || []).length) {
					$(this.frm.fields_dict.packing_list.row.wrapper).toggle(true);

					if (["Delivery Note", "Sales Invoice"].includes(doc.doctype)) {
						var help_msg =
							"<div class='alert alert-warning'>" +
							__(
								"For 'Product Bundle' items, Warehouse, Serial No and Batch No will be considered from the 'Packing List' table. If Warehouse and Batch No are same for all packing items for any 'Product Bundle' item, those values can be entered in the main Item table, values will be copied to 'Packing List' table."
							) +
							"</div>";
						frappe.meta.get_docfield(doc.doctype, "product_bundle_help", doc.name).options =
							help_msg;
					}
				} else {
					$(this.frm.fields_dict.packing_list.row.wrapper).toggle(false);
					if (["Delivery Note", "Sales Invoice"].includes(doc.doctype)) {
						frappe.meta.get_docfield(doc.doctype, "product_bundle_help", doc.name).options = "";
					}
				}
				refresh_field("product_bundle_help");
			}

			company_address() {
				var me = this;
				if (this.frm.doc.company_address) {
					frappe.call({
						method: "frappe.contacts.doctype.address.address.get_address_display",
						args: { address_dict: this.frm.doc.company_address },
						callback: function (r) {
							if (r.message) {
								me.frm.set_value(
									"company_address_display",
									frappe.utils.html2text(r.message)
								);
							}
						},
					});
				} else {
					this.frm.set_value("company_address_display", "");
				}
			}

			conversion_factor(doc, cdt, cdn, dont_fetch_price_list_rate) {
				super.conversion_factor(doc, cdt, cdn, dont_fetch_price_list_rate);
			}

			qty(doc, cdt, cdn) {
				super.qty(doc, cdt, cdn);
			}

			pick_serial_and_batch(doc, cdt, cdn) {
				let item = locals[cdt][cdn];
				let me = this;

				frappe.db.get_value("Item", item.item_code, ["has_batch_no", "has_serial_no"]).then((r) => {
					if (r.message && (r.message.has_batch_no || r.message.has_serial_no)) {
						item.has_serial_no = r.message.has_serial_no;
						item.has_batch_no = r.message.has_batch_no;
						item.type_of_transaction = item.qty > 0 ? "Outward" : "Inward";

						item.title = item.has_serial_no ? __("Select Serial No") : __("Select Batch No");

						if (item.has_serial_no && item.has_batch_no) {
							item.title = __("Select Serial and Batch");
						}

						new erpnext.SerialBatchPackageSelector(me.frm, item, (r) => {
							if (r) {
								let qty = Math.abs(r.total_qty);
								if (doc.is_return) {
									qty = qty * -1;
								}

								frappe.model.set_value(item.doctype, item.name, {
									serial_and_batch_bundle: r.name,
									use_serial_batch_fields: 0,
									incoming_rate: r.avg_rate,
									qty:
										qty /
										flt(
											item.conversion_factor || 1,
											precision("conversion_factor", item)
										),
								});
							}
						});
					}
				});
			}

			update_auto_repeat_reference(doc) {
				if (doc.auto_repeat) {
					frappe.call({
						method: "frappe.automation.doctype.auto_repeat.auto_repeat.update_reference",
						args: {
							docname: doc.auto_repeat,
							reference: doc.name,
						},
						callback: function (r) {
							if (r.message == "success") {
								frappe.show_alert({
									message: __("Auto repeat document updated"),
									indicator: "green",
								});
							} else {
								frappe.show_alert({
									message: __("An error occurred during the update process"),
									indicator: "red",
								});
							}
						},
					});
				}
			}

			project(doc, cdt, cdn) {
				if (!cdt || !cdn) {
					if (this.frm.doc.project) {
						$.each(this.frm.doc["items"] || [], function (i, item) {
							if (!item.project) {
								frappe.model.set_value(item.doctype, item.name, "project", doc.project);
							}
						});
					}
				} else {
					const item = frappe.get_doc(cdt, cdn);
					if (item.project) {
						$.each(this.frm.doc["items"] || [], function (i, other_item) {
							if (!other_item.project) {
								frappe.model.set_value(
									other_item.doctype,
									other_item.name,
									"project",
									item.project
								);
							}
						});
					}
				}
				let me = this;
				if (["Delivery Note", "Sales Invoice", "Sales Order"].includes(this.frm.doc.doctype)) {
					if (this.frm.doc.project) {
						frappe.call({
							method: "erpnext.projects.doctype.project.project.get_cost_center_name",
							args: { project: this.frm.doc.project },
							callback: function (r, rt) {
								if (!r.exc) {
									if (r.message) {
										$.each(me.frm.doc["items"] || [], function (i, row) {
											frappe.model.set_value(
												row.doctype,
												row.name,
												"cost_center",
												r.message
											);
										});
										frappe.msgprint(
											__("Cost Center for Item rows has been updated to {0}", [
												r.message,
											])
										);
									}
								}
							},
						});
					}
				}
			}

			coupon_code() {
				this.frm.set_value("discount_amount", 0);
				this.frm.set_value("additional_discount_percentage", 0);
			}

			is_return() {
				let reset = !this.frm.doc.is_return;
				this.change_warehouse_labels_for_return(reset);
			}

			change_warehouse_labels_for_return(reset) {
				// swap source and target warehouse labels for return
				let source_warehouse_label = __("Source Warehouse");
				let target_warehouse_label = __("Set Target Warehouse");

				if (this.frm.doc.doctype == "Delivery Note") {
					source_warehouse_label = __("Set Source Warehouse");
				}

				if (reset) {
					// reset to original labels
					this.frm.set_df_property("set_warehouse", "label", source_warehouse_label);
					this.frm.set_df_property("set_target_warehouse", "label", target_warehouse_label);
					return;
				}

				if (this.frm.doc.is_return) {
					this.frm.set_df_property("set_warehouse", "label", target_warehouse_label);
					this.frm.set_df_property("set_target_warehouse", "label", source_warehouse_label);
				}
			}
		};
	},
};

erpnext.pre_sales = {
	set_as_lost: function (doctype) {
		frappe.ui.form.on(doctype, {
			set_as_lost_dialog: function (frm) {
				var dialog = new frappe.ui.Dialog({
					title: __("Set as Lost"),
					fields: [
						{
							fieldtype: "Table MultiSelect",
							label: __("Lost Reasons"),
							fieldname: "lost_reason",
							options:
								frm.doctype === "Opportunity"
									? "Opportunity Lost Reason Detail"
									: "Quotation Lost Reason Detail",
							reqd: 1,
						},
						{
							fieldtype: "Table MultiSelect",
							label: __("Competitors"),
							fieldname: "competitors",
							options: "Competitor Detail",
						},
						{
							fieldtype: "Small Text",
							label: __("Detailed Reason"),
							fieldname: "detailed_reason",
						},
					],
					primary_action: function () {
						let values = dialog.get_values();

						frm.call({
							doc: frm.doc,
							method: "declare_enquiry_lost",
							args: {
								lost_reasons_list: values.lost_reason,
								competitors: values.competitors ? values.competitors : [],
								detailed_reason: values.detailed_reason,
							},
							callback: function (r) {
								dialog.hide();
								frm.reload_doc();
							},
						});
					},
					primary_action_label: __("Declare Lost"),
				});

				dialog.show();
			},
		});
	},
};
