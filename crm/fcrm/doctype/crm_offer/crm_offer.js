// Desk uses the same revision and permission boundary as the CRM workspace.
(() => {
  const api = async (action, args) => {
    const response = await frappe.call({
      method: `crm.api.offers.${action}`,
      args,
      freeze: true,
      freeze_message: __("Working on the offer…"),
    });
    return response.message;
  };
  const requestId = () => crypto.randomUUID();
  const esc = (value) => frappe.utils.escape_html(String(value ?? ""));
  const rows = (products = []) =>
    products.map((row) => ({
      product_code: row.product_code || "",
      product_name: row.product_name || "",
      qty: row.qty ?? 1,
      rate: row.rate ?? 0,
      discount_percentage: row.discount_percentage ?? 0,
    }));

  async function openResult(frm, result) {
    frm.__offer_localDraft = null;
    if (!frm.is_new() && frm.doc.name === result.name) await frm.reload_doc();
    else frappe.set_route("Form", "CRM Offer", result.name);
  }

  function freezeFields(dialog) {
    dialog.fields.forEach((field) => {
      if (field.fieldname)
        dialog.set_df_property(field.fieldname, "read_only", 1);
    });
  }

  async function preview(name) {
    const result = await api("preview", { name });
    const dialog = new frappe.ui.Dialog({
      title: __("Offer preview"),
      size: "extra-large",
      fields: [{ fieldname: "preview", fieldtype: "HTML" }],
      primary_action_label: __("Print / save PDF"),
      primary_action: () => frame.contentWindow.print(),
    });
    const frame = document.createElement("iframe");
    frame.title = __("Offer preview");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.cssText = "width:100%;height:65vh;border:0";
    dialog.fields_dict.preview.$wrapper.append(frame);
    dialog.show();
    dialog.get_primary_btn().prop("disabled", true);
    frame.onload = () => dialog.get_primary_btn().prop("disabled", false);
    frame.srcdoc = result.html;
  }

  async function draftDialog(frm, offer = null) {
    let source = offer || {};
    const deal = offer?.deal || frm.doc.deal;
    if (!offer && deal) {
      const linked = await frappe.db.get_doc("CRM Deal", deal);
      source = {
        title: __("Offer for {0}", [linked.name]),
        currency: linked.currency,
        products: linked.products,
      };
    }
    const retained = frm.__offer_localDraft;
    if (retained && retained.name === offer?.name) {
      source = { ...source, ...retained.values };
    }
    const dialog = new frappe.ui.Dialog({
      title: offer ? __("Edit draft offer") : __("Create draft offer"),
      size: "extra-large",
      fields: [
        {
          fieldname: "deal",
          fieldtype: "Link",
          options: "CRM Deal",
          label: __("Deal"),
          reqd: 1,
          default: deal,
          read_only: Boolean(deal),
        },
        {
          fieldname: "title",
          fieldtype: "Data",
          label: __("Title"),
          reqd: 1,
          default: source.title,
        },
        {
          fieldname: "currency",
          fieldtype: "Link",
          options: "Currency",
          label: __("Currency"),
          reqd: 1,
          default: source.currency,
        },
        {
          fieldname: "valid_until",
          fieldtype: "Date",
          label: __("Valid through"),
          reqd: 1,
          default:
            source.valid_until ||
            frappe.datetime.add_days(frappe.datetime.get_today(), 14),
        },
        {
          fieldname: "products",
          fieldtype: "Table",
          label: __("Products and services"),
          reqd: 1,
          in_place_edit: true,
          data: rows(source.products),
          fields: [
            {
              fieldname: "product_code",
              fieldtype: "Link",
              options: "CRM Product",
              label: __("Product"),
              in_list_view: 1,
            },
            {
              fieldname: "product_name",
              fieldtype: "Data",
              label: __("Product or service name"),
              reqd: 1,
              in_list_view: 1,
            },
            {
              fieldname: "qty",
              fieldtype: "Float",
              label: __("Quantity"),
              reqd: 1,
              default: 1,
              in_list_view: 1,
            },
            {
              fieldname: "rate",
              fieldtype: "Currency",
              label: __("Rate"),
              options: "currency",
              reqd: 1,
              in_list_view: 1,
            },
            {
              fieldname: "discount_percentage",
              fieldtype: "Percent",
              label: __("Discount %"),
              default: 0,
              in_list_view: 1,
            },
          ],
        },
        {
          fieldname: "terms",
          fieldtype: "Small Text",
          label: __("Terms"),
          default: source.terms,
        },
        {
          fieldname: "notice",
          fieldtype: "HTML",
          options: `<p>${esc(__("Totals are calculated by the server when saved. Review the saved preview before issuing. Taxes are not calculated here."))}</p>`,
        },
      ],
      primary_action_label: __("Save draft"),
      async primary_action(values) {
        if (!values || dialog.__busy) return;
        if (!dialog.__command) {
          const payload = {
            title: values.title,
            currency: values.currency,
            valid_until: values.valid_until,
            terms: values.terms || "",
            products: rows(values.products),
          };
          dialog.__command = {
            deal: values.deal,
            values: payload,
            name: offer?.name,
            modified: offer?.modified,
            request_id: requestId(),
          };
          frm.__offer_localDraft = { name: offer?.name, values: payload };
          freezeFields(dialog);
        }
        dialog.__busy = true;
        try {
          const result = await api("save_draft", dialog.__command);
          dialog.hide();
          await openResult(frm, result);
        } finally {
          dialog.__busy = false;
          dialog.get_primary_btn().text(__("Retry unchanged request"));
        }
      },
      secondary_action_label: __("Close and review saved offer"),
      secondary_action() {
        dialog.hide();
        if (offer) frm.reload_doc();
      },
    });
    dialog.show();
  }

  function decisionDialog(frm, offer, decision) {
    const dialog = new frappe.ui.Dialog({
      title:
        decision === "Accepted"
          ? __("Record customer acceptance")
          : __("Record customer rejection"),
      fields: [
        {
          fieldname: "channel",
          fieldtype: "Select",
          label: __("Decision channel"),
          options: "Email\nPhone\nWhatsApp\nIn Person\nOther",
          reqd: 1,
        },
        {
          fieldname: "evidence",
          fieldtype: "Small Text",
          label: __("Customer decision evidence"),
          description: __(
            "Identify the customer and the message or conversation that confirms this exact revision.",
          ),
          reqd: 1,
        },
      ],
      primary_action_label: __("Record decision"),
      async primary_action(values) {
        if (!values || dialog.__busy) return;
        dialog.__command ||= {
          name: offer.name,
          modified: offer.modified,
          decision,
          ...values,
        };
        freezeFields(dialog);
        dialog.__busy = true;
        try {
          const result = await api("record_decision", dialog.__command);
          dialog.hide();
          await openResult(frm, result);
        } finally {
          dialog.__busy = false;
        }
      },
    });
    dialog.show();
  }

  async function erpDialog(frm, offer) {
    const review = await api("preview_erp", { name: offer.name });
    if (review.quotation)
      return frappe.set_route("Form", "Quotation", review.quotation);
    const detail = `<p>${esc(__("Customer"))}: ${esc(review.customer)} · ${esc(review.company)}</p><p>${esc(__("Commercial offer"))}: ${esc(review.offer_total)} ${esc(review.currency)}<br>${esc(__("ERP payable total"))}: ${esc(review.payable_total)} ${esc(review.currency)}<br>${esc(__("Tax amount"))}: ${esc(review.taxes)} · ${esc(__("Difference"))}: ${esc(review.total_difference)}</p><table class="table"><thead><tr><th>${esc(__("Item"))}</th><th>${esc(__("Quantity"))}</th><th>${esc(__("Rate"))}</th><th>${esc(__("Amount"))}</th></tr></thead><tbody>${review.items.map((r) => `<tr><td>${esc(r.item_code)}</td><td>${esc(r.qty)} ${esc(r.uom)}</td><td>${esc(r.rate)}</td><td>${esc(r.amount)}</td></tr>`).join("")}</tbody></table><p>${esc(__("This creates an ERP quotation draft. Changed terms require their own customer approval; the offer's acceptance is not transferred."))}</p>`;
    const dialog = new frappe.ui.Dialog({
      title: __("Review ERP quotation"),
      size: "large",
      fields: [
        { fieldname: "review", fieldtype: "HTML", options: detail },
        {
          fieldname: "review_note",
          fieldtype: "Small Text",
          label: __("Financial difference review"),
          reqd: review.financial_drift,
        },
      ],
      primary_action_label: __("Create ERP quotation draft"),
      async primary_action(values) {
        if (!values || dialog.__busy) return;
        dialog.__command ||= {
          name: offer.name,
          review_hash: review.review_hash,
          review_note: values.review_note || "",
        };
        freezeFields(dialog);
        dialog.__busy = true;
        try {
          const result = await api("create_erp_quotation", dialog.__command);
          dialog.hide();
          frappe.set_route("Form", "Quotation", result.quotation);
        } finally {
          dialog.__busy = false;
        }
      },
    });
    dialog.show();
  }

  frappe.ui.form.on("CRM Offer", {
    async refresh(frm) {
      frm.disable_save();
      frm.set_intro(
        __(
          "Use the offer actions to preserve revisions and recorded customer decisions. Issuing does not send a message.",
        ),
      );
      if (frm.is_new()) {
        frm.add_custom_button(__("Create draft"), () => draftDialog(frm));
        return;
      }
      const data = await api("get_offer", { name: frm.doc.name });
      const caps = data.capabilities;
      frm.add_custom_button(__("Return to deal"), () =>
        frappe.set_route("Form", "CRM Deal", data.deal),
      );
      frm.add_custom_button(__("Offer history"), () =>
        frappe.set_route("List", "CRM Offer", { deal: data.deal }),
      );
      frm.add_web_link(
        `/crm/deals/${encodeURIComponent(data.deal)}?tab=offers`,
        __("Open in CRM"),
      );
      if (caps.can_export)
        frm.add_custom_button(__("Preview / export"), () => preview(data.name));
      if (caps.can_edit)
        frm.add_custom_button(__("Edit draft"), () => draftDialog(frm, data));
      if (caps.can_issue)
        frm.add_custom_button(__("Issue offer"), () =>
          frappe.confirm(
            __("Issue this exact revision? Review its saved preview first."),
            async () =>
              openResult(
                frm,
                await api("issue", {
                  name: data.name,
                  modified: data.modified,
                }),
              ),
          ),
        );
      if (caps.can_decide) {
        frm.add_custom_button(__("Customer accepted"), () =>
          decisionDialog(frm, data, "Accepted"),
        );
        frm.add_custom_button(__("Customer rejected"), () =>
          decisionDialog(frm, data, "Rejected"),
        );
      }
      if (caps.can_revise) {
        const request_id = requestId();
        frm.add_custom_button(__("New revision"), async () =>
          openResult(frm, await api("revise", { name: data.name, request_id })),
        );
      }
      if (caps.can_expire)
        frm.add_custom_button(__("Record expiry"), async () =>
          openResult(
            frm,
            await api("expire", { name: data.name, modified: data.modified }),
          ),
        );
      if (caps.can_erp)
        frm.add_custom_button(__("ERP quotation"), () => erpDialog(frm, data));
    },
  });
})();
