// Connection form: every blocked step says why and offers the action that resolves it.
const API = "crm.api.integration.";

function showSecret(secret, title) {
	frappe.msgprint({
		title: title || __("Signing secret"),
		message: `<p>${__(
			"Paste it into n8n to check the «webhook-signature» header of each request.",
		)}</p><pre style="user-select:all">${frappe.utils.escape_html(secret)}</pre>`,
	});
}

function renderSummary(frm, data) {
	const counts = data.counts || {};
	const parts = ["Delivered", "Pending", "Failed", "Dead", "Skipped"]
		.filter((s) => counts[s])
		.map((s) => `${__(s)}: ${counts[s]}`);
	if (parts.length) frm.dashboard.add_comment(parts.join(" · "), "blue", true);
	if (data.blocker && !frm.doc.enabled) frm.dashboard.add_comment(data.blocker, "yellow", true);
	if (!data.api_key_ready) {
		frm.dashboard.add_comment(
			__(
				"{0} has no API key yet, so n8n cannot call the CRM. Open the user and use «Generate Keys».",
				[frm.doc.integration_user],
			),
			"yellow",
			true,
		);
	}
	for (const p of data.problems || []) {
		frm.dashboard.add_comment(
			`${frappe.utils.escape_html(p.event)} · ${__(p.status)}: ${frappe.utils.escape_html(p.last_error || "")}`,
			p.status === "Skipped" ? "orange" : "red",
			true,
		);
	}
}

frappe.ui.form.on("CRM Integration", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Send test event"), () =>
			frappe.call({
				method: API + "send_test",
				args: { name: frm.doc.name },
				freeze: true,
				callback: ({ message }) => {
					const ok = message && message.status === "Delivered";
					frappe.msgprint({
						title: ok ? __("Test event delivered") : __("Test event not delivered"),
						indicator: ok ? "green" : "red",
						message: ok
							? __("Your webhook answered {0}. You can enable the connection now.", [message.response_code])
							: frappe.utils.escape_html(message?.last_error || __("No answer.")),
					});
					frm.reload_doc();
				},
			}),
		);
		frm.add_custom_button(
			__("Show signing secret"),
			() =>
				frappe.call({ method: API + "show_secret", args: { name: frm.doc.name } }).then(({ message }) =>
					showSecret(message.secret),
				),
			__("Secret"),
		);
		frm.add_custom_button(
			__("Rotate signing secret"),
			() =>
				frappe.confirm(
					__("Events will be signed with a new secret from now on. For 24 hours they also carry the old signature, so update n8n within that time."),
					() =>
						frappe
							.call({ method: API + "rotate_secret", args: { name: frm.doc.name } })
							.then(({ message }) => {
								showSecret(message.secret, __("New signing secret"));
								frm.reload_doc();
							}),
				),
			__("Secret"),
		);
		frm.add_custom_button(__("Deliveries"), () =>
			frappe.set_route("List", "CRM Integration Delivery", { integration: frm.doc.name }),
		);
		if (frm.doc.integration_user) {
			frm.add_custom_button(
				__("API key"),
				() => frappe.set_route("Form", "User", frm.doc.integration_user),
				__("Secret"),
			);
		}
		frappe
			.call({ method: API + "summary", args: { name: frm.doc.name } })
			.then(({ message }) => message && renderSummary(frm, message));
	},
});
