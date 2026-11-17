"""Whether the owner keeps the business's money from a person.

The owner decides it per person (doco's Equipo, «Ve el dinero del negocio»). Off closes
Bancos and Resultados (and Hoy's «Ventas de hoy», Resultados' own card) for that person,
on every endpoint, not just in the shell. It never grants anything: who sees the money
still needs the roles each module asks for.

Apps answer through the `muelle_money_hidden` hook (`fn(user) -> bool`); a site without
one hides nothing. A hook that fails hides the money: a broken answer must not show it.
"""

import frappe
from frappe import _

HOOK = "muelle_money_hidden"


def hidden(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	for path in frappe.get_hooks(HOOK) or []:
		try:
			if frappe.get_attr(path)(user):
				return True
		except Exception:
			frappe.logger("crm.money").exception("muelle_money_hidden hook failed: %s", path)
			return True
	return False


def reason() -> str:
	return _("The owner does not share the business's money with you. Ask them if you need it.")
