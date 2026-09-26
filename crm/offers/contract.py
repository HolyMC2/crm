"""Bounded, deterministic offer arithmetic; usable without Frappe or ERPNext."""

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

INPUT_FIELDS = frozenset({"title", "currency", "valid_until", "terms", "products"})
LINE_FIELDS = frozenset({"product_code", "product_name", "qty", "rate", "discount_percentage"})
CHANNELS = frozenset({"Email", "Phone", "WhatsApp", "In Person", "Other"})
MAX_TOTAL = Decimal("1000000000000")


def text(value, label, limit, required=True):
	if not isinstance(value, str) or len(value) > limit or "\x00" in value:
		raise ValueError(f"Invalid {label}.")
	value = value.strip()
	if required and not value:
		raise ValueError(f"{label} is required.")
	return value


def number(value, label, low, high):
	if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
		raise ValueError(f"Invalid {label}.")
	try:
		result = Decimal(str(value))
	except InvalidOperation:
		raise ValueError(f"Invalid {label}.") from None
	if not result.is_finite() or not low <= result <= high or result.as_tuple().exponent < -9:
		raise ValueError(f"Invalid {label}.")
	return result


def calculate(lines, precision=2):
	if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
		raise ValueError("Choose between 1 and 100 product or service lines.")
	if type(precision) is not int or not 0 <= precision <= 6:
		raise ValueError("Unsupported currency precision.")
	unit = Decimal(1).scaleb(-precision)
	rows, total, net_total = [], Decimal(0), Decimal(0)
	for row in lines:
		if not isinstance(row, dict) or set(row) - LINE_FIELDS:
			raise ValueError("Use only product, name, quantity, rate and discount in an offer line.")
		qty = number(row.get("qty"), "quantity", Decimal("0.000001"), Decimal("1000000"))
		rate = number(row.get("rate"), "rate", Decimal(0), MAX_TOTAL)
		discount = number(row.get("discount_percentage", 0), "discount", Decimal(0), Decimal(100))
		amount = (qty * rate).quantize(unit, rounding=ROUND_HALF_UP)
		discount_amount = (amount * discount / 100).quantize(unit, rounding=ROUND_HALF_UP)
		net = amount - discount_amount
		total += amount
		net_total += net
		if total > MAX_TOTAL:
			raise ValueError("Offer total is too large.")
		rows.append(
			{
				"product_code": text(row.get("product_code") or "", "product", 140, False),
				"product_name": text(row.get("product_name"), "product or service name", 140),
				"qty": float(qty),
				"rate": float(rate),
				"discount_percentage": float(discount),
				"amount": float(amount),
				"discount_amount": float(discount_amount),
				"net_amount": float(net),
			}
		)
	return {"products": rows, "total": float(total), "net_total": float(net_total)}


def digest(value):
	return hashlib.sha256(
		json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()
	).hexdigest()


def terms_snapshot(doc):
	return {
		**{
			field: doc.get(field) or ""
			for field in ("deal", "title", "currency", "valid_until", "terms", "sales_company")
		},
		"currency_precision": int(doc.get("currency_precision") or 0),
		"products": [
			{
				field: row.get(field) or ("" if field.startswith("product_") else 0)
				for field in sorted(LINE_FIELDS)
			}
			for row in doc.get("products", [])
		],
		"total": float(doc.get("total") or 0),
		"net_total": float(doc.get("net_total") or 0),
	}
