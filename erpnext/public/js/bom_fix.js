// Fix BOM rm_cost_as_per undefined error
frappe.ui.form.on('BOM', {
	onload: function(frm) {
		// Set default value for rm_cost_as_per if not set
		if (!frm.doc.rm_cost_as_per) {
			frm.set_value('rm_cost_as_per', 'Valuation Rate');
		}
	},
	
	refresh: function(frm) {
		// Ensure rm_cost_as_per has a value
		if (!frm.doc.rm_cost_as_per) {
			frm.set_value('rm_cost_as_per', 'Valuation Rate');
		}
	}
});
