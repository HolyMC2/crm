"""Product cards a Bot intent may carry: a title, a detail line, the product page link
and an optional photo, frozen into each provider's own message.

A card is the only rich content a Bot reply may hold, and only the server-side producer
(the pinned customer run) creates one; people's replies stay plain text. Every URL in a
card must be one the tenant publishes:
- the link: https to this site, or to a host the public-media owner names;
- the photo: a public /files file of this site (JPEG or PNG), or an image the owner
  confirms is its public proxy over such a file.
The owner is the one app registered in hook `crm_public_media` (functions
`public_hosts()` and `public_media(url)`); without it only this site's own files and
pages qualify. The check runs when the card is frozen and again before every dispatch,
so a file made private or a domain removed later stops the send. The provider's
transport then validates its exact wire payload, as it does for text.

Per provider:
- WhatsApp: a catalog product message when the account's catalog publishes the item
  (catalog_commerce, the catalog owner's reviewed freeze), else the photo with the caption,
  else the caption as text;
- Webchat: a card in the visitor's transcript;
- Messenger and Instagram: the owning transport's card (hook `crm_channel_adapters`,
  `freeze_card`).
"""

import json
import re
from urllib.parse import unquote, urlsplit

import frappe
from frappe import _
from frappe.utils import cint, get_url

CARD_FIELDS = frozenset({"type", "title", "detail", "link", "image", "button", "catalog_item"})
TITLE_MAX = 80
DETAIL_MAX = 80
BUTTON_MAX = 20
URL_MAX = 2000
SITE_IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png")


def _invalid(message=None):
	frappe.throw(message or _("Invalid product card."))


def _line(value, maximum, *, required=True):
	if value is None and not required:
		return ""
	if not isinstance(value, str):
		_invalid()
	value = " ".join(value.split())
	if (required and not value) or len(value) > maximum:
		_invalid()
	return value


def normalize(card):
	"""The card's fields, bounded; refuses unknown keys and malformed values."""
	if not isinstance(card, dict) or card.get("type") != "card" or set(card) - CARD_FIELDS:
		_invalid()
	out = {
		"type": "card",
		"title": _line(card.get("title"), TITLE_MAX),
		"detail": _line(card.get("detail"), DETAIL_MAX, required=False),
		"button": _line(card.get("button") or _("View product"), BUTTON_MAX),
	}
	link = card.get("link")
	if link not in (None, ""):
		if not isinstance(link, str):
			_invalid()
		out["link"] = link
	image = card.get("image")
	if image not in (None, ""):
		if not isinstance(image, str):
			_invalid()
		out["image"] = image
	code = card.get("catalog_item")
	if code not in (None, ""):
		if not isinstance(code, str) or not 0 < len(code) <= 140 or code != code.strip():
			_invalid()
		out["catalog_item"] = code
	return out


# ---- which URLs a card may carry ----------------------------------------------------------


def _site_hosts():
	host = urlsplit(get_url()).hostname
	return {host.lower()} if host else set()


def _owner():
	from crm.api.outbox import _adapter_module

	paths = frappe.get_hooks("crm_public_media") or []
	paths = [paths] if isinstance(paths, str) else paths
	if not isinstance(paths, list) or len(set(paths)) != 1:
		return None
	module = _adapter_module(paths[0])
	if not callable(getattr(module, "public_hosts", None)) or not callable(
		getattr(module, "public_media", None)
	):
		return None
	return module


def _public_file(path):
	if not path.startswith("/files/") or ".." in path or "\\" in path or any(ord(c) < 32 for c in path):
		return False
	rows = frappe.get_all("File", filters={"file_url": path}, pluck="is_private", limit=20)
	return bool(rows) and not any(cint(value) for value in rows)


def url_reason(url, *, media):
	"""None when `url` may go in a customer card (`media`: as its photo); else a reason code."""
	if (
		not isinstance(url, str)
		or not 8 < len(url) <= URL_MAX
		or any(c.isspace() or ord(c) < 32 for c in url)
	):
		return "card_url_invalid"
	try:
		parts = urlsplit(url)
		port = parts.port
	except ValueError:
		return "card_url_invalid"
	if (
		parts.scheme != "https"
		or not parts.hostname
		or parts.username
		or parts.password
		or port not in (None, 443)
		or parts.fragment
	):
		return "card_url_invalid"
	host = parts.hostname.lower()
	if host in _site_hosts():
		if not media:
			return None
		path = unquote(parts.path)
		if parts.query or not path.lower().endswith(SITE_IMAGE_SUFFIXES) or not _public_file(path):
			return "card_image_not_public"
		return None
	owner = _owner()
	if owner is None:
		return "card_host_not_public"
	try:
		if host not in {str(h).lower() for h in owner.public_hosts() or []}:
			return "card_host_not_public"
		if media and owner.public_media(url) is not True:
			return "card_image_not_public"
	except Exception:
		return "card_host_not_public"
	return None


def check(card):
	"""The normalized card when every URL in it may be sent; raises otherwise."""
	card = normalize(card)
	if card.get("link") and url_reason(card["link"], media=False):
		_invalid(_("The product link is not a page of this shop."))
	if card.get("image") and url_reason(card["image"], media=True):
		_invalid(_("The product photo is not a public image of this shop."))
	return card


# ---- freezing one card for the conversation's provider ------------------------------------


def caption(card, *, bold=False):
	title = card["title"].replace("*", "") if bold else card["title"]
	head = f"*{title}*" if bold else title
	if card.get("detail"):
		head += " — " + card["detail"]
	return head + ("\n" + card["link"] if card.get("link") else "")


def freeze(card, conversation):
	"""Exact frozen payload (canonical JSON text) of one card for this conversation."""
	from crm.api.outbox import HOOKED_CHANNELS, channel_adapter

	card = check(card)
	provider = conversation.provider
	if provider == "WhatsApp":
		return _whatsapp(card, conversation)
	if provider == "Webchat":
		from crm.api.webchat import validate_payload

		view = {k: card[k] for k in ("title", "detail", "link", "image", "button") if card.get(k)}
		try:
			return validate_payload(
				{"type": "card", "text": caption(card), "card": view},
				account_id=conversation.account_id,
				peer_id=conversation.peer_id,
			).decode()
		except ValueError:
			_invalid()
	if provider in HOOKED_CHANNELS:
		adapter = channel_adapter(provider)
		if not adapter or not callable(getattr(adapter, "freeze_card", None)):
			frappe.throw(_("Native sending is not ready for this channel."))
		try:
			frozen = adapter.freeze_card(
				{k: v for k, v in card.items() if k != "catalog_item"},
				provider=provider,
				account_id=conversation.account_id,
				peer_id=conversation.peer_id,
			)
		except ValueError:
			_invalid()
		if not isinstance(frozen, str):
			_invalid()
		return frozen
	frappe.throw(_("Native sending is not ready for this channel."))


def _whatsapp(card, conversation):
	from frappe_whatsapp.native_outbox import validate_payload

	text = caption(card, bold=True)
	if card.get("catalog_item"):
		from crm.api.catalog_commerce import bot_product

		frozen = bot_product(conversation, card["catalog_item"], text)
		if frozen:
			return frozen
	payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": conversation.peer_id}
	if card.get("image"):
		payload.update({"type": "image", "image": {"link": card["image"], "caption": text}})
	else:
		payload.update({"type": "text", "text": {"body": text, "preview_url": False}})
	try:
		return validate_payload(
			payload, account_id=conversation.account_id, peer_id=conversation.peer_id
		).decode()
	except ValueError:
		_invalid()


# ---- before every dispatch ------------------------------------------------------------------


_CAPTION_URL = re.compile(r"https?://[^\s<>\"')]+", re.I)


def _urls(provider, payload):
	"""(url, is_photo) of every card URL a frozen payload carries (on WhatsApp the link
	rides in the photo's caption or the product message's body)."""
	if provider == "WhatsApp":
		if payload.get("type") == "image":
			image = payload.get("image") or {}
			return [(image.get("link"), True)] + [
				(u, False) for u in _CAPTION_URL.findall(image.get("caption") or "")
			]
		if payload.get("type") == "interactive":
			body = ((payload.get("interactive") or {}).get("body") or {}).get("text") or ""
			return [(u, False) for u in _CAPTION_URL.findall(body)]
		return []
	if provider == "Webchat":
		if payload.get("type") != "card":
			return []
		view = payload.get("card") or {}
		return [(view[key], key == "image") for key in ("link", "image") if view.get(key)]
	attachment = (payload.get("message") or {}).get("attachment")
	if not isinstance(attachment, dict):
		return []
	out = []
	for element in (attachment.get("payload") or {}).get("elements") or []:
		if element.get("image_url"):
			out.append((element["image_url"], True))
		if element.get("default_action"):
			out.append((element["default_action"].get("url"), False))
		out.extend((button.get("url"), False) for button in element.get("buttons") or [])
	return out


def frozen_reason(intent):
	"""None when every card URL in this Bot intent is still public; else a reason code."""
	try:
		payload = json.loads(intent.payload)
	except (TypeError, ValueError):
		return "frozen_payload_invalid"
	if not isinstance(payload, dict):
		return "frozen_payload_invalid"
	try:
		for url, media in _urls(intent.provider, payload):
			reason = url_reason(url, media=media)
			if reason:
				return reason
	except (AttributeError, TypeError):
		return "frozen_payload_invalid"
	if intent.provider == "WhatsApp":
		from crm.api.catalog_commerce import bot_product_reason, is_catalog_payload

		if is_catalog_payload(payload):
			return bot_product_reason(intent, payload)
	return None
