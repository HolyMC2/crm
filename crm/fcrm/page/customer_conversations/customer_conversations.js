// One Desk list/detail workspace. Private generic doctypes are never queried.
frappe.pages["customer-conversations"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __("Conversaciones de clientes"),
    single_column: true,
  });
  wrapper.customer_conversations = new CustomerConversations(page);
};
frappe.pages["customer-conversations"].on_page_show = function (wrapper) {
  wrapper.customer_conversations?.load();
};

class CustomerConversations {
  constructor(page) {
    this.root = document.createElement("div");
    this.root.className = "customer-conversations";
    page.main.append(this.root);
    this.actor = frappe.session.user;
    this.epoch = 0;
    this.accounts = [];
    this.items = [];
    this.messages = [];
    this.busy = false;
    this.pending = null;
    this.replyPending = null;
    this.intentPending = null;
    this.outbound = [];
    this.draft = "";
    this.outboxMore = false;
    frappe.realtime?.on("crm_outbox_updated", (event) => {
      if (
        event?.conversation === this.doc?.name &&
        !this.busy &&
        !this.hasPending() &&
        frappe.get_route?.()[0] === "customer-conversations"
      )
        this.run(() => this.loadOutbox());
    });
    this.render();
  }
  el(tag, text, parent, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    if (parent) parent.append(el);
    return el;
  }
  button(text, parent, action, enabled = true) {
    const button = this.el("button", text, parent, "btn btn-default btn-sm");
    button.type = "button";
    button.disabled = this.busy || !enabled;
    button.onclick = action;
    return button;
  }
  async call(method, args) {
    const epoch = this.epoch,
      actor = this.actor;
    const response = await frappe.call({ method, args });
    if (!this.fresh(epoch, actor)) {
      this.clear();
      throw { exc_type: "AuthenticationError" };
    }
    return response.message;
  }
  fresh(epoch, actor) {
    return this.epoch === epoch && actor === frappe.session.user;
  }
  clear() {
    this.epoch++;
    this.accounts = [];
    this.account = null;
    this.items = [];
    this.doc = null;
    this.messages = [];
    this.operators = [];
    this.next = null;
    this.older = null;
    this.pending = null;
    this.replyPending = null;
    this.intentPending = null;
    this.outbound = [];
    this.draft = "";
    this.outboxMore = false;
    this.busy = false;
    this.error = "";
    this.actor = frappe.session.user;
  }
  fail(e) {
    const type = e?.exc_type || e?.responseJSON?.exc_type;
    if (["PermissionError", "AuthenticationError"].includes(type)) this.clear();
    this.error =
      "No se pudo completar la operación. Actualiza para comprobar tu acceso.";
  }
  hasPending() {
    return !!(this.pending || this.replyPending || this.intentPending);
  }
  async load() {
    if (this.actor !== frappe.session.user) this.clear();
    if (this.hasPending() || this.busy) return;
    this.clear();
    const epoch = this.epoch,
      actor = this.actor;
    this.busy = true;
    this.render();
    try {
      const result = await this.call(
        "crm.api.conversation_threads.list_accounts",
      );
      if (!this.fresh(epoch, actor)) return;
      this.accounts = result.accounts || [];
      this.account = this.accounts[0];
      if (this.account) await this.threads();
    } catch (e) {
      if (this.fresh(epoch, actor)) this.fail(e);
    } finally {
      if (this.fresh(epoch, actor)) {
        this.busy = false;
        this.render();
      }
    }
  }
  async threads(more = false) {
    if (!this.account) return;
    const result = await this.call(
      "crm.api.conversation_threads.list_threads",
      {
        provider: this.account.provider,
        account_id: this.account.account_id,
        cursor: more ? this.next : null,
      },
    );
    this.items = more ? [...this.items, ...result.items] : result.items;
    this.next = result.next_cursor;
  }
  async run(action) {
    if (this.busy || this.hasPending()) return;
    if (this.actor !== frappe.session.user) {
      this.clear();
      this.render();
      return;
    }
    const epoch = this.epoch,
      actor = this.actor;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      await action();
    } catch (e) {
      if (this.fresh(epoch, actor)) this.fail(e);
    } finally {
      if (!this.fresh(epoch, actor)) this.clear();
      this.busy = false;
      this.render();
    }
  }
  async history(name, more = false) {
    const result = await this.call("crm.api.conversation_threads.get_history", {
      conversation: name,
      cursor: more ? this.older : null,
    });
    this.doc = result.conversation;
    this.messages = more
      ? [...result.messages, ...this.messages]
      : result.messages;
    this.older = result.next_cursor;
    if (!more) {
      this.outbound = [];
      this.draft = "";
      if (this.doc.provider === "WhatsApp") await this.loadOutbox();
    }
  }
  async select(item) {
    return this.run(async () => {
      this.doc = null;
      this.messages = [];
      this.older = null;
      this.operators = [];
      const doc = item.name
        ? item
        : await this.call("crm.api.conversation_threads.open_thread", {
            provider: item.provider,
            account_id: item.account_id,
            peer_id: item.peer_id,
          });
      await this.history(doc.name);
    });
  }
  async control(action, owner, reason) {
    if (this.busy || this.replyPending || this.intentPending) return;
    if (this.actor !== frappe.session.user) {
      this.clear();
      this.render();
      return;
    }
    if (!this.pending)
      this.pending = {
        name: this.doc.name,
        action,
        owner: owner || null,
        reason: reason || null,
        expected_generation: this.doc.generation,
        command_id: crypto.randomUUID(),
      };
    const epoch = this.epoch,
      actor = this.actor,
      command = { ...this.pending };
    this.busy = true;
    this.error = "";
    this.render();
    try {
      await this.call("crm.api.conversations.apply_control", command);
      if (!this.fresh(epoch, actor)) return;
      this.pending = null;
      this.doc = null;
      this.messages = [];
      await this.history(command.name);
      await this.threads();
    } catch (e) {
      if (!this.fresh(epoch, actor)) return;
      const type = e?.exc_type || e?.responseJSON?.exc_type;
      if (
        [
          "TimestampMismatchError",
          "ValidationError",
          "PermissionError",
          "AuthenticationError",
        ].includes(type)
      ) {
        this.pending = null;
        this.doc = null;
        this.messages = [];
        this.fail(e);
        if (type === "TimestampMismatchError") {
          try {
            await this.history(command.name);
          } catch (readError) {
            this.fail(readError);
          }
          this.error =
            "Otra persona cambió el control. Revisa el estado actualizado.";
        }
      } else
        this.error =
          "La respuesta no llegó. Comprueba el mismo cambio antes de continuar.";
    } finally {
      if (!this.fresh(epoch, actor)) this.clear();
      this.busy = false;
      this.render();
    }
  }
  render() {
    this.root.replaceChildren();
    const style = this.el(
      "style",
      ".customer-conversations{min-width:0;padding:16px}.customer-conversations *{box-sizing:border-box;overflow-wrap:anywhere}.customer-conversations .cc-grid{display:grid;grid-template-columns:minmax(180px,280px) minmax(0,1fr);gap:16px}.customer-conversations .cc-row{display:block;width:100%;text-align:left;white-space:normal;margin:6px 0}.customer-conversations select,.customer-conversations input{display:block;width:100%;min-width:0;margin:6px 0}.customer-conversations .cc-message{max-width:85%;white-space:pre-wrap;border-radius:12px;background:var(--subtle-fg);padding:10px;margin:8px 0}.customer-conversations .cc-out{margin-left:auto;background:var(--blue-100)}.customer-conversations .cc-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}@media(max-width:640px){.customer-conversations .cc-grid{grid-template-columns:minmax(0,1fr)}}",
      this.root,
    );
    style.setAttribute("data-customer-style", "");
    if (this.error)
      this.el("p", this.error, this.root).setAttribute("role", "alert");
    this.button(
      this.busy ? "Cargando…" : "Actualizar cuentas",
      this.root,
      () => this.load(),
      !this.hasPending(),
    );
    if (this.pending) {
      this.el(
        "p",
        "Cambio pendiente de confirmar. Se conserva la misma solicitud.",
        this.root,
      );
      this.button("Comprobar cambio", this.root, () => this.control());
    }
    if (!this.accounts.length && !this.busy)
      this.el("p", "No tienes cuentas de conversación disponibles.", this.root);
    const grid = this.el("div", null, this.root, "cc-grid");
    const queue = this.el("section", null, grid);
    const label = this.el("label", "Cuenta del canal", queue);
    const select = this.el("select", null, label, "form-control");
    select.disabled = this.busy || !!this.hasPending();
    for (const [i, account] of this.accounts.entries()) {
      const option = this.el(
        "option",
        `${account.provider} · ${account.label} · ${account.account_id}`,
        select,
      );
      option.value = String(i);
      option.selected = account === this.account;
    }
    select.onchange = () =>
      this.run(async () => {
        this.account = this.accounts[Number(select.value)];
        this.items = [];
        this.doc = null;
        this.messages = [];
        this.older = null;
        await this.threads();
      });
    for (const item of this.items) {
      const button = this.button(
        `${item.peer_id} · ${item.human_owner || "Sin responsable"}${item.materialized ? "" : " · Abrir historial de esta cuenta y destinatario"}`,
        queue,
        () => this.select(item),
        !this.hasPending(),
      );
      button.classList.add("cc-row");
      if (item.preview) this.el("span", item.preview, button, "cc-row");
    }
    if (this.next)
      this.button(
        "Cargar más conversaciones",
        queue,
        () => this.run(() => this.threads(true)),
        !this.hasPending(),
      );
    const detail = this.el("section", null, grid);
    if (!this.doc) {
      this.el(
        "p",
        "Selecciona una conversación para ver su historial y responsable.",
        detail,
      );
      return;
    }
    this.el("h3", this.doc.peer_id, detail);
    this.el(
      "p",
      `${this.doc.provider} · Cuenta ${this.doc.account_id}`,
      detail,
    );
    const link = this.el("a", "Abrir en CRM Inbox", detail);
    link.href = `/crm/inbox?conversation=${encodeURIComponent(this.doc.name)}`;
    this.el(
      "p",
      `${{ Human: "Atención humana", Bot: "Automatización activa", Paused: "En pausa", Closed: "Cerrada" }[this.doc.control_state]} · ${this.doc.human_owner || "Sin responsable"}`,
      detail,
    );
    this.el("p", "Un envío ya iniciado puede seguir en curso.", detail);
    for (const request of this.doc.control_requests || [])
      this.el(
        "p",
        `${request.actor_user} solicitó el control · ${request.creation}`,
        detail,
      );
    if (!this.hasPending() && this.doc.allowed_actions?.length)
      this.renderControls(detail);
    if (this.older)
      this.button(
        "Cargar mensajes anteriores",
        detail,
        () => this.run(() => this.history(this.doc.name, true)),
        !this.hasPending(),
      );
    for (const message of this.messages) {
      const bubble = this.el(
        "div",
        message.content,
        detail,
        "cc-message" + (message.direction === "out" ? " cc-out" : ""),
      );
      this.el("small", message.timestamp, bubble, "cc-row");
      // Desk holds attachments; SPA uses the broker's permission-checked local links.
      if (message.attach || message.attachment_restricted)
        this.el(
          "small",
          "Adjunto: abre la conversación en CRM para consultarlo.",
          bubble,
          "cc-row",
        );
    }
    this.renderOutbox(detail);
    this.renderComposer(detail);
  }
  canReply() {
    return (
      this.doc?.provider === "WhatsApp" &&
      this.doc.send_available === true &&
      this.doc.control_state === "Human" &&
      this.doc.human_owner === this.actor
    );
  }
  canIntent(action, row) {
    if (
      !this.doc ||
      this.doc.human_owner !== this.actor ||
      !this.doc.allowed_actions?.length
    )
      return false;
    if (action === "retry")
      return (
        row.can_retry === true &&
        ["Blocked", "Failed", "Deferred"].includes(row.state) &&
        row.actor_user === this.actor &&
        row.conversation_generation === this.doc.generation &&
        this.doc.control_state === "Human"
      );
    return (
      row.can_cancel === true &&
      ["Queued", "Claimed", "Blocked", "Deferred", "Failed"].includes(row.state)
    );
  }
  async loadOutbox(more = false) {
    if (this.doc?.provider !== "WhatsApp") return;
    try {
      const rows = await this.call("crm.api.outbox.list_intents", {
        conversation: this.doc.name,
        limit: 50,
        before: more ? this.outbound.at(-1)?.name : null,
      });
      if (!Array.isArray(rows)) throw new Error("Invalid outbox response");
      this.outbound = more
        ? [
            ...new Map(
              [...this.outbound, ...rows].map((r) => [r.name, r]),
            ).values(),
          ]
        : rows;
      this.outboxMore = rows.length === 50;
    } catch (e) {
      this.outbound = [];
      this.fail(e);
    }
  }
  async queueReply() {
    if (
      this.busy ||
      this.pending ||
      this.intentPending ||
      (!this.replyPending && !this.canReply())
    )
      return;
    if (this.actor !== frappe.session.user) {
      this.clear();
      this.render();
      return;
    }
    if (!this.replyPending) {
      if (!this.draft.trim() || this.draft.length > 4096) return;
      this.replyPending = {
        conversation: this.doc.name,
        expected_generation: this.doc.generation,
        request_id: crypto.randomUUID(),
        payload: { type: "text", text: this.draft },
      };
    }
    const epoch = this.epoch,
      actor = this.actor,
      command = this.replyPending;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const row = await this.call("crm.api.outbox.queue_message", command);
      if (!row?.name || !row?.state) throw new Error("Unconfirmed response");
      this.replyPending = null;
      this.draft = "";
      await this.loadOutbox();
    } catch (e) {
      if (!this.fresh(epoch, actor)) return;
      const type = e?.exc_type || e?.responseJSON?.exc_type;
      if (
        [
          "PermissionError",
          "AuthenticationError",
          "TimestampMismatchError",
          "ValidationError",
        ].includes(type)
      ) {
        this.replyPending = null;
        this.fail(e);
        if (this.doc) {
          try {
            await this.history(this.doc.name);
          } catch (readError) {
            this.fail(readError);
          }
        }
      } else
        this.error =
          "La respuesta no llegó. Comprueba la misma solicitud antes de continuar.";
    } finally {
      if (!this.fresh(epoch, actor)) this.clear();
      this.busy = false;
      this.render();
    }
  }
  async changeIntent(action, row) {
    if (this.busy || this.hasPending() || !this.canIntent(action, row)) return;
    if (this.actor !== frappe.session.user) {
      this.clear();
      this.render();
      return;
    }
    this.intentPending = { action, name: row.name };
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const result = await this.call(`crm.api.outbox.${action}_intent`, {
        name: row.name,
      });
      if (!result?.name || !result?.state)
        throw new Error("Unconfirmed response");
      this.intentPending = null;
      await this.loadOutbox();
    } catch (e) {
      const type = e?.exc_type || e?.responseJSON?.exc_type;
      if (
        [
          "PermissionError",
          "AuthenticationError",
          "ValidationError",
          "TimestampMismatchError",
        ].includes(type)
      ) {
        this.intentPending = null;
        this.fail(e);
        if (this.doc) await this.loadOutbox();
      } else
        this.error =
          "La respuesta no llegó. Comprueba el estado; no repitas la acción.";
    } finally {
      this.busy = false;
      this.render();
    }
  }
  async reconcileIntent() {
    if (this.busy || !this.intentPending) return;
    this.busy = true;
    this.render();
    try {
      const row = await this.call("crm.api.outbox.get_intent", {
        name: this.intentPending.name,
      });
      if (!row?.name || !row?.state) throw new Error("Unconfirmed response");
      this.intentPending = null;
      this.error = "";
      await this.loadOutbox();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.render();
    }
  }
  renderComposer(detail) {
    if (!this.canReply() && !this.replyPending) {
      this.el(
        "p",
        this.doc.provider === "WhatsApp"
          ? "Para responder necesitas el control humano vigente de esta conversación."
          : "El envío nativo aún no está disponible para este canal.",
        detail,
      );
      return;
    }
    const form = this.el("form", null, detail),
      label = this.el("label", `Respuesta a ${this.doc.peer_id}`, form);
    const body = this.el("textarea", null, label, "form-control");
    body.rows = 3;
    body.maxLength = 4096;
    body.required = true;
    body.value = this.draft;
    body.disabled = this.busy || this.hasPending();
    body.oninput = () => {
      this.draft = body.value;
    };
    if (this.replyPending)
      this.el(
        "p",
        "La respuesta no se ha confirmado. Conservamos el texto y la misma solicitud.",
        form,
      );
    this.el("p", "La entrega se consulta en Envíos.", form);
    const submit = this.el(
      "button",
      this.replyPending ? "Comprobar solicitud" : "Enviar respuesta",
      form,
      "btn btn-primary btn-sm",
    );
    submit.type = "submit";
    submit.disabled = this.busy || !!this.pending || !!this.intentPending;
    form.onsubmit = (e) => {
      e.preventDefault();
      this.queueReply();
    };
  }
  renderOutbox(detail) {
    if (this.doc.provider !== "WhatsApp") return;
    const section = this.el("section", null, detail);
    section.setAttribute("aria-label", "Envíos");
    this.el("h4", "Envíos", section);
    this.button(
      this.intentPending ? "Comprobar estado del cambio" : "Actualizar envíos",
      section,
      () =>
        this.intentPending
          ? this.reconcileIntent()
          : this.run(() => this.loadOutbox()),
      !this.pending && !this.replyPending,
    );
    const labels = {
      Queued: "En cola",
      Claimed: "En preparación",
      Submitting: "Envío en curso",
      Accepted: "Aceptado por WhatsApp",
      Delivered: "Entregado",
      Read: "Leído",
      Blocked: "Bloqueado",
      Failed: "Falló",
      Cancelled: "Cancelado",
      Deferred: "Aplazado",
      Unknown: "Resultado incierto",
    };
    for (const row of this.outbound) {
      const article = this.el("article", null, section);
      article.setAttribute("data-intent", row.name);
      this.el("strong", labels[row.state] || "Estado no disponible", article);
      this.el("p", row.text, article);
      if (row.reason_code)
        this.el(
          "small",
          /^[a-z0-9_]{1,100}$/.test(row.reason_code)
            ? row.reason_code
            : "Requiere revisión",
          article,
        );
      if (row.state === "Unknown")
        this.el(
          "p",
          "Resultado incierto. Este envío no puede repetirse ni cancelarse.",
          article,
        );
      else {
        const buttons = this.el("div", null, article, "cc-actions");
        if (this.canIntent("retry", row))
          this.button(
            "Reintentar envío",
            buttons,
            () => this.changeIntent("retry", row),
            !this.hasPending(),
          );
        if (this.canIntent("cancel", row))
          this.button(
            "Cancelar envío",
            buttons,
            () => this.changeIntent("cancel", row),
            !this.hasPending(),
          );
      }
    }
    if (this.outboxMore)
      this.button(
        "Cargar envíos anteriores",
        section,
        () => this.run(() => this.loadOutbox(true)),
        !this.hasPending(),
      );
  }
  renderControls(detail) {
    const form = this.el("form", null, detail);
    const select = this.el("select", null, form, "form-control");
    const labels = {
      take: "Tomar control",
      request: "Solicitar control",
      transfer: "Transferir",
      release: "Liberar responsable",
      pause: "Pausar",
      close: "Cerrar",
      reopen: "Reabrir",
    };
    for (const action of this.doc.allowed_actions) {
      const option = this.el("option", labels[action], select);
      option.value = action;
    }
    const owner = this.el("select", null, form, "form-control");
    owner.hidden = true;
    const placeholder = this.el(
      "option",
      "Seleccionar operador autorizado",
      owner,
    );
    placeholder.value = "";
    select.onchange = async () => {
      owner.hidden = select.value !== "transfer";
      owner.required = select.value === "transfer";
      if (select.value === "transfer") {
        const name = this.doc.name,
          actor = this.actor;
        try {
          const operators = await this.call(
            "crm.api.conversation_threads.list_operators",
            { conversation: name },
          );
          if (actor !== frappe.session.user || this.doc?.name !== name) return;
          owner.replaceChildren(placeholder);
          for (const operator of operators) {
            const option = this.el(
              "option",
              `${operator.label} · ${operator.name}`,
              owner,
            );
            option.value = operator.name;
          }
        } catch (e) {
          this.fail(e);
          this.render();
        }
      }
    };
    const label = this.el(
      "label",
      "Motivo (obligatorio para intervenir como gerente)",
      form,
    );
    const reason = this.el("input", null, label, "form-control");
    reason.maxLength = 500;
    select.disabled = this.busy;
    owner.disabled = this.busy;
    reason.disabled = this.busy;
    const submit = this.el(
      "button",
      "Aplicar cambio",
      form,
      "btn btn-primary btn-sm",
    );
    submit.type = "submit";
    submit.disabled = this.busy;
    form.onsubmit = (event) => {
      event.preventDefault();
      reason.required =
        this.doc.manager_reason_required && select.value !== "request";
      if (form.reportValidity())
        this.control(
          select.value,
          select.value === "transfer" ? owner.value : null,
          reason.value,
        );
    };
  }
}
