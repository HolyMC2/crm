frappe.ui.form.on("CRM Integration Delivery", {
	refresh(frm) {
		if (["Failed", "Dead", "Skipped"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Send again"), () =>
				frappe
					.call({ method: "crm.api.integration.redeliver", args: { delivery: frm.doc.name } })
					.then(() => {
						frappe.show_alert({ message: __("Queued again with the same id"), indicator: "green" });
						frm.reload_doc();
					}),
			);
		}
		frm.add_custom_button(__("Open connection"), () =>
			frappe.set_route("Form", "CRM Integration", frm.doc.integration),
		);
	},
});
