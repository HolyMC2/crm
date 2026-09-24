"""Department queues for customer conversations: fixed ids, role eligibility, owned records.

Routing a conversation to a department never grants a sales role. A member
reaches only conversations routed to their department, and a record they
cannot read stays hidden unless their own department links a record they can
read. HR requests are internal work and never enter customer conversations.
"""
import frappe
from frappe import _

# Contract ids (doco.docoutils.assistant.automation). Order is the display order.
DEPARTMENTS = {
    "marketing": {
        "label": "Marketing", "customer": True,
        "members": ("Marketing Manager", "Marketing User"), "managers": ("Marketing Manager",),
        "records": ("CRM Lead", "CRM Inquiry"),
    },
    "sales": {
        "label": "Sales", "customer": True,
        "members": ("Sales User", "Sales Manager"), "managers": ("Sales Manager",),
        "records": ("CRM Inquiry", "CRM Lead", "CRM Deal", "Quotation", "Sales Order"),
    },
    "support": {
        "label": "Support", "customer": True,
        "members": ("Support Team", "Agent", "Agent Manager"), "managers": ("Agent Manager",),
        "records": ("Issue", "Warranty Claim", "CRM Inquiry"),
    },
    "finance": {
        "label": "Finance", "customer": True,
        "members": ("Accounts User", "Accounts Manager"), "managers": ("Accounts Manager",),
        "records": ("Sales Invoice", "POS Invoice", "Payment Entry", "Payment Request"),
    },
    "hr": {
        "label": "HR", "customer": False,
        "members": ("HR User", "HR Manager"), "managers": ("HR Manager",),
        "records": (),
    },
    "warehouse": {
        "label": "Warehouse", "customer": True,
        "members": ("Stock User", "Stock Manager"), "managers": ("Stock Manager",),
        "records": ("Material Request", "Stock Entry", "Delivery Note", "Purchase Receipt", "Pick List"),
    },
    "technicians": {
        "label": "Technicians", "customer": True,
        "members": ("Doco Repair Technician", "Doco Repair Manager", "Doco Repair Counter"),
        "managers": ("Doco Repair Manager",),
        "records": ("Repair Order", "Repair Checkin Request"),
    },
}
ADMIN = "System Manager"
MAX_LINKS = 12


def ids():
    return tuple(DEPARTMENTS)


def customer_ids():
    return tuple(key for key, value in DEPARTMENTS.items() if value["customer"])


def department(value, *, customer=True, required=False):
    """Validated department id or None. Never accepts labels or unknown ids."""
    if value in (None, "") and not required:
        return None
    if not isinstance(value, str) or value not in DEPARTMENTS:
        frappe.throw(_("Choose a supported department."))
    if customer and not DEPARTMENTS[value]["customer"]:
        frappe.throw(_("This department handles internal requests, not customer conversations."))
    return value


def is_member(roles, value):
    if not value or value not in DEPARTMENTS:
        return False
    roles = set(roles or ())
    return ADMIN in roles or bool(roles.intersection(DEPARTMENTS[value]["members"]))


def is_manager(roles, value):
    if not value or value not in DEPARTMENTS:
        return False
    roles = set(roles or ())
    return ADMIN in roles or bool(roles.intersection(DEPARTMENTS[value]["managers"]))


def member_departments(roles, *, customer=True):
    return [key for key in DEPARTMENTS if is_member(roles, key) and (DEPARTMENTS[key]["customer"] or not customer)]


def member_roles(*, customer=True):
    """Every role that can belong to a customer department queue."""
    roles = set()
    for value in DEPARTMENTS.values():
        if value["customer"] or not customer:
            roles.update(value["members"])
    return roles


def record_doctypes(value=None):
    if value:
        return tuple(DEPARTMENTS[value]["records"]) if value in DEPARTMENTS else ()
    seen = []
    for key in customer_ids():
        for doctype in DEPARTMENTS[key]["records"]:
            if doctype not in seen:
                seen.append(doctype)
    return tuple(seen)


def installed_roles(value):
    """Current site roles for this department; absent optional apps simply have none."""
    wanted = DEPARTMENTS[value]["members"]
    return [role for role in wanted if frappe.db.exists("Role", role)]


def describe(roles):
    """Finite metadata only: no member lists, counts or record contents."""
    out = []
    for key, value in DEPARTMENTS.items():
        present = installed_roles(key)
        out.append({
            "id": key, "label": _(value["label"]), "customer": value["customer"],
            "member": is_member(roles, key), "manager": is_manager(roles, key),
            "available": bool(present) or not value["members"],
            "blocker": None if present else _("No role for this department is installed on this site."),
            "record_doctypes": [dt for dt in value["records"] if frappe.db.exists("DocType", dt)],
        })
    return out


def parse_links(raw):
    """Stored link list: [{doctype, name, department, added_by, added_at}], bounded."""
    if not raw:
        return []
    try:
        value = frappe.parse_json(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:MAX_LINKS]:
        if isinstance(item, dict) and isinstance(item.get("doctype"), str) and isinstance(item.get("name"), str):
            out.append({key: item.get(key) for key in ("doctype", "name", "department", "added_by", "added_at", "source")})
    return out
