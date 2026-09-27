"""Controller-only disposable seed. Run with bench's Python, never a live site.

No Frappe import occurs until the filesystem/provisioning guard succeeds. All
business writes use normal insert/save or the owning public command. This is
fixture setup, not latency or complete PERF-01 acceptance evidence.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

# Executed as a script with the bench interpreter; no app endpoint is installed.
from contract import ContractError, canonical, checksum, read_json, require
from seed_plan import (
	ACTORS,
	PROFILES,
	SIZES,
	STAGES,
	activity_schedule,
	actor_scope,
	deal_recipe,
	due_date,
	label,
	namespace,
	repair_parent,
)

DISABLED = {
	"Doco Tenant Settings": ("printing_enabled",),
	"ERPNext CRM Settings": ("enabled",),
	"FCRM Settings": ("conversation_automation_enabled",),
	"Taller App Settings": (
		"smtp_enabled",
		"whatsapp_enabled",
		"whatsapp_status_notify",
		"sms_enabled",
		"chatbot_enabled",
		"crm_followups_enabled",
	),
	"Marketing Settings": (
		"auto_assign_enabled",
		"auto_assign_deals",
		"enable_automation",
		"enable_auto_ack",
		"enable_auto_ack_comment",
		"enable_review_asks",
		"enable_repair_status_updates",
		"enable_whatsapp_broadcast",
		"enable_messenger",
		"enable_email_campaigns",
		"enable_sms",
		"enable_channel_rules",
	),
}
REQUIRED_APPS = {
	"frappe",
	"erpnext",
	"crm",
	"doco",
	"taller",
	"doco_marketing",
	"doco_meta_catalog",
	"frappe_whatsapp",
	"posawesome",
	"mercadopago_connector",
	"scanner_kit",
}
BUSINESS = (
	"CRM Deal",
	"CRM Lead",
	"CRM Task",
	"FCRM Note",
	"CRM Call Log",
	"Repair Order",
	"CRM Conversation",
	"CRM Outbound Intent",
)


def keys(value, expected, code):
	require(isinstance(value, dict) and set(value) == set(expected), code)


def private_file(path):
	path = Path(path)
	require(path.is_file() and not path.is_symlink(), "seed_file")
	require(path.stat().st_mode & 0o077 == 0, "seed_private_file")
	return path


def atomic_json(path, value):
	path = Path(path)
	require(not path.is_symlink(), "seed_symlink")
	temporary = path.with_name(path.name + ".new")
	descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
	try:
		with os.fdopen(descriptor, "wb") as stream:
			stream.write(canonical(value))
			stream.flush()
			os.fsync(stream.fileno())
		os.replace(temporary, path)
		directory = os.open(path.parent, os.O_RDONLY)
		try:
			os.fsync(directory)
		finally:
			os.close(directory)
	except BaseException:
		# Keep an interrupted .new file for diagnosis; never silently adopt it.
		raise


def provision_guard(receipt, sites):
	keys(
		receipt,
		{
			"version",
			"site",
			"created_at",
			"database",
			"redis",
			"image",
			"sources",
			"network_internal",
			"workers_disabled",
			"scheduler_disabled",
			"outbound_disabled",
			"topology_digest",
			"anchor_date",
		},
		"seed_provision",
	)
	require(receipt["version"] == 1, "seed_version")
	tag = namespace(receipt["site"])
	require(
		all(
			receipt[key] is True
			for key in ("network_internal", "workers_disabled", "scheduler_disabled", "outbound_disabled")
		),
		"seed_topology",
	)
	created = datetime.fromisoformat(receipt["created_at"])
	require(
		created.tzinfo is not None and 0 <= (datetime.now(timezone.utc) - created).total_seconds() <= 3600,
		"seed_provision_age",
	)
	require(date.fromisoformat(receipt["anchor_date"]) <= created.date(), "seed_anchor")
	for key in ("image", "topology_digest"):
		require(
			re.fullmatch(r"sha256:[a-f0-9]{64}" if key == "image" else r"[a-f0-9]{64}", receipt[key]),
			"seed_digest",
		)
	keys(receipt["database"], {"name", "host", "port"}, "seed_database")
	require(receipt["database"]["name"] == "crm_perf_" + tag, "seed_database")
	# The provisioner names isolated services per project, never localhost or a
	# production DNS name. Isolation itself requires retained Compose evidence.
	require(receipt["database"]["host"] == f"crm-perf-{tag}-db", "seed_database_host")
	require(receipt["database"]["port"] == 3306, "seed_database_port")
	keys(receipt["redis"], {"redis_cache", "redis_queue", "redis_socketio"}, "seed_redis")
	for address in receipt["redis"].values():
		parsed = urlsplit(address)
		require(
			parsed.scheme == "redis"
			and parsed.hostname == f"crm-perf-{tag}-redis"
			and parsed.port == 6379
			and not parsed.username
			and not parsed.password
			and parsed.path in ("", "/0", "/1", "/2")
			and not parsed.query
			and not parsed.fragment,
			"seed_redis",
		)
	sites = Path(sites).resolve(strict=True)
	site = sites / receipt["site"]
	require(site.is_dir() and not site.is_symlink(), "seed_site_directory")
	conf = {}
	for path in (sites / "common_site_config.json", site / "site_config.json"):
		if path.exists():
			conf.update(read_json(path))
	require(
		conf.get("db_name") == receipt["database"]["name"]
		and conf.get("db_host") == receipt["database"]["host"]
		and int(conf.get("db_port", 3306)) == 3306,
		"seed_config_database",
	)
	require(all(conf.get(key) == value for key, value in receipt["redis"].items()), "seed_config_redis")
	require(conf.get("mute_emails") is True and conf.get("pause_scheduler") is True, "seed_config_delivery")
	require(not conf.get("developer_mode") and not conf.get("server_script_enabled"), "seed_config_execution")
	# Sources are externally exported, pinned and hashed by the provisioning
	# owner. Verify all Python/JSON files, including hooks/controllers/schema.
	require(REQUIRED_APPS <= set(receipt["sources"]), "seed_sources")
	for app, source in receipt["sources"].items():
		require(re.fullmatch(r"[a-z][a-z0-9_]{0,47}", app), "seed_source_app")
		keys(source, {"commit", "root", "files"}, "seed_source")
		require(re.fullmatch(r"[a-f0-9]{40}", source["commit"]), "seed_source_commit")
		root = Path(source["root"])
		require(root.is_absolute() and root.is_dir() and not root.is_symlink(), "seed_source_root")
		require(isinstance(source["files"], dict) and source["files"], "seed_source_files")
		actual = {}
		for path in root.rglob("*"):
			relative = path.relative_to(root)
			if any(
				part in (".git", "node_modules", "__pycache__", ".venv", "env") for part in relative.parts
			):
				continue
			if path.suffix not in (".py", ".json") or not path.is_file():
				continue
			require(not path.is_symlink(), "seed_source_symlink")
			actual[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
		require(actual == source["files"], "seed_source_changed")
	return sites


@contextmanager
def actor(frappe, user):
	previous = frappe.session.user
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user(previous)


def projection(doc, fields):
	"""Compare only declared business fields, preserving native generated values."""
	output = {}
	for key, value in fields.items():
		stored = doc.get(key)
		if isinstance(value, list):
			require(isinstance(stored, (list, tuple)) and len(stored) == len(value), "seed_child_drift")
			output[key] = [projection(row, expected) for row, expected in zip(stored, value, strict=True)]
		elif value is None or value == "":
			output[key] = stored or None
		elif isinstance(value, (int, float)):
			output[key] = stored
		else:
			output[key] = str(stored) if stored is not None else None
	return output


def resume_name(recorded, matches):
	require(len(matches) <= 1, "seed_duplicate_identity")
	if matches:
		require(not recorded or recorded["name"] == matches[0], "seed_identity_changed")
		return matches[0]
	require(not recorded, "seed_record_missing")
	return None


def verify_preflight(proof, receipt):
	require(isinstance(proof, dict), "seed_preflight_required")
	expected = SIZES["preflight"]
	require(
		proof.get("scale") == "preflight" and proof.get("native_controllers") is True,
		"seed_preflight_required",
	)
	require(proof.get("sources_digest") == checksum(receipt["sources"]), "seed_preflight_source")
	require(
		proof.get("counts") == expected and set(proof.get("scopes", {})) == set(PROFILES),
		"seed_preflight_incomplete",
	)
	require(proof.get("site") != receipt["site"], "seed_preflight_separate_site")
	namespace(proof["site"])


def verify_fields(doc, fields):
	expected = {k: None if v == "" else v for k, v in fields.items()}
	require(projection(doc, fields) == expected, "seed_record_drift")


class Seed:
	def __init__(self, frappe, receipt, output, scale):
		self.f = frappe
		self.receipt = receipt
		self.scale = scale
		self.sizes = SIZES[scale]
		self.site = receipt["site"]
		self.tag = namespace(self.site)
		self.output = Path(output)
		require(
			self.output.is_dir() and not self.output.is_symlink() and self.output.stat().st_mode & 0o077 == 0,
			"seed_output_private",
		)
		self.journal_path = self.output / "native-seed.json"
		self.binding = checksum(
			{
				"site": self.site,
				"database": receipt["database"],
				"sources": receipt["sources"],
				"image": receipt["image"],
				"anchor_date": receipt["anchor_date"],
				"scale": scale,
			}
		)
		if self.journal_path.exists():
			private_file(self.journal_path)
			require(self.journal_path.stat().st_size < 64 * 1024 * 1024, "seed_journal_size")
			self.journal = json.loads(self.journal_path.read_text())
			require(self.journal.get("binding") == self.binding, "seed_resume_binding")
		else:
			# An empty, freshly installed site, not a migrated correctness-test
			# tenant. No guessing which pre-existing customer records are ours.
			require(all(not frappe.db.count(dt) for dt in BUSINESS), "seed_site_not_empty")
			require(
				not frappe.get_all(
					"User", filters={"name": ["not in", ["Administrator", "Guest"]]}, limit_page_length=1
				),
				"seed_users_not_empty",
			)
			require(
				not frappe.db.count("Company")
				and not frappe.db.count("Customer")
				and not frappe.db.count("Contact"),
				"seed_masters_not_empty",
			)
			self.journal = {
				"version": 1,
				"binding": self.binding,
				"records": {},
				"commands": {},
				"complete": False,
			}
			self.save()
		self.records = self.journal["records"]
		self.pending = 0

	def save(self):
		atomic_json(self.journal_path, self.journal)

	def checkpoint(self):
		self.runtime_guard()
		self.f.db.commit()  # Normal before/after-commit hooks and real queueing.
		self.save()  # Crash here is recovered by exact fixture identity lookup.
		self.pending = 0

	def runtime_guard(self):
		from frappe.utils.background_jobs import get_redis_conn
		from rq import Worker

		f = self.f
		require(not Worker.all(connection=get_redis_conn()), "seed_active_workers")
		require(
			f.local.site == self.site
			and f.db.sql("SELECT DATABASE()")[0][0] == self.receipt["database"]["name"],
			"seed_connected_database",
		)
		require(
			not f.in_test
			and not any(
				getattr(f.flags, key, False)
				for key in (
					"in_test",
					"in_install",
					"in_migrate",
					"in_import",
					"ignore_permissions",
					"ignore_mandatory",
					"ignore_links",
				)
			),
			"seed_test_bypass",
		)
		require(f.conf.mute_emails and f.conf.pause_scheduler, "seed_delivery_changed")
		installed = set(f.get_installed_apps())
		require(REQUIRED_APPS <= installed <= set(self.receipt["sources"]), "seed_apps")
		for app in installed:
			require(
				Path(f.get_app_path(app)).resolve().parent
				== Path(self.receipt["sources"][app]["root"]).resolve(),
				"seed_import_source",
			)
		for doctype, fields in DISABLED.items():
			doc = f.get_doc(doctype)
			for field in fields:
				require(f.get_meta(doctype).has_field(field), "seed_setting_missing")
				require(not doc.get(field), "seed_delivery_enabled")
		settings = f.get_doc("FCRM Settings")
		require(
			settings.currency == "MXN"
			and settings.enable_sales_hierarchy == 1
			and not settings.auto_update_expected_deal_value,
			"seed_crm_config",
		)
		for doctype, field in (
			("Notification", "enabled"),
			("Webhook", "enabled"),
			("Server Script", "disabled"),
			("Assignment Rule", "disabled"),
			("CRM Service Level Agreement", "enabled"),
		):
			require(
				not f.db.exists(doctype, {field: 0 if field == "disabled" else 1}), "seed_active_automation"
			)
		for doctype, filters in (
			("CRM Campaign", {"status": "Active"}),
			("Bot Workflow Definition", {"status": "Published"}),
			("Doco Printer Route", {"enabled": 1}),
		):
			require(not f.db.exists(doctype, filters), "seed_active_workflow")
		# Queue producers remain real; none of these external-effect ledgers may
		# exist on this fresh fixture. The later Webchat phase owns its intents.
		for doctype in (
			"Email Queue",
			"Integration Request",
			"CRM Outbound Intent",
			"Doco Print Job",
			"Asistente Agent Run",
		):
			require(not f.db.count(doctype), "seed_external_effect")

	def ensure(self, key, doctype, identity, values, *, create=None):
		self.last_key = key
		f = self.f
		matches = f.db.get_values(
			doctype, filters=identity, fieldname="name", pluck=True, limit=2, for_update=True
		)
		recorded = self.records.get(key)
		existing = resume_name(recorded, matches)
		if existing:
			doc = f.get_doc(doctype, existing)
			doc.check_permission("read")
		else:
			doc = create() if create else f.get_doc({"doctype": doctype, **values}).insert()
		verify_fields(doc, values)
		self.records[key] = {"doctype": doctype, "name": doc.name, "fields_digest": checksum(values)}
		require(not recorded or recorded == self.records[key], "seed_recipe_changed")
		self.pending += 1
		if self.pending >= 100:
			self.checkpoint()
		return doc

	def name(self, key):
		require(key in self.records, "seed_phase_missing")
		return self.records[key]["name"]

	def user(self, alias):
		return f"perf-{self.tag}-{alias}@example.invalid"

	def masters(self):
		f = self.f
		with actor(f, "Administrator"):
			restricted = "PERF Private " + self.tag
			self.ensure(
				"private_role", "Role", {"role_name": restricted}, {"role_name": restricted, "desk_access": 1}
			)
			for alias in ACTORS:
				roles = (
					["Sales Manager"]
					if alias in ("manager_a", "manager_b", "broad_manager")
					else ["Sales User"]
				)
				if alias == "counter":
					roles.append("Doco Repair Counter")
				if alias in ("seller_11", "broad_manager"):
					roles.append(restricted)
				self.ensure(
					alias,
					"User",
					{"email": self.user(alias)},
					{
						"email": self.user(alias),
						"first_name": "PERF " + alias,
						"enabled": 1,
						"send_welcome_email": 0,
						"roles": [{"role": r} for r in roles],
					},
				)
			for doctype, root, field, parent in (
				("Customer Group", "All Customer Groups", "customer_group_name", "parent_customer_group"),
				("Territory", "All Territories", "territory_name", "parent_territory"),
			):
				root_doc = f.get_doc(doctype, root)
				require(root_doc.is_group == 1 and not root_doc.get(parent), "seed_erp_root")
				self.ensure(
					"customer_group" if doctype == "Customer Group" else "territory",
					doctype,
					{field: "PERF " + self.tag},
					{field: "PERF " + self.tag, parent: root, "is_group": 0},
				)
			for branch in ("a", "b"):
				title = f"PERF {self.tag} {branch.upper()}"
				self.ensure(
					"company_" + branch,
					"Company",
					{"company_name": title},
					{
						"company_name": title,
						"abbr": self.tag[:3].upper() + branch.upper(),
						"default_currency": "MXN",
						"country": "Mexico",
						"chart_of_accounts": "Standard",
					},
				)
				self.ensure(
					"shop_" + branch, "Social Shop", {"shop_name": title}, {"shop_name": title, "enabled": 1}
				)
				self.ensure(
					"customer_" + branch,
					"Customer",
					{"customer_name": title},
					{
						"customer_name": title,
						"customer_type": "Individual",
						"customer_group": self.name("customer_group"),
						"territory": self.name("territory"),
						"marketing_opt_in": 0,
					},
				)
				self.ensure(
					"contact_" + branch,
					"Contact",
					{"first_name": title},
					{
						"first_name": title,
						"links": [{"link_doctype": "Customer", "link_name": self.name("customer_" + branch)}],
					},
				)
				members = (
					[{"user": self.user("counter"), "role": "Technician", "is_default_for_user": 1}]
					if branch == "a"
					else []
				)
				self.ensure(
					"lab_" + branch,
					"Laboratorio",
					{"lab_id": title},
					{
						"lab_id": title,
						"lab_name": title,
						"status": "Active",
						"company": self.name("company_" + branch),
						"whatsapp_status_notify": 0,
						"members": members,
					},
				)
			self.ensure(
				"device",
				"Device Model",
				{"brand": "PERF", "model": self.tag},
				{"brand": "PERF", "model": self.tag},
			)
			for stage, outcome, probability in STAGES:
				title = f"PERF {self.tag} {stage}"
				self.ensure(
					"stage_" + stage,
					"CRM Deal Status",
					{"deal_status": title},
					{"deal_status": title, "type": outcome, "probability": probability},
				)
			self.ensure(
				"loss",
				"CRM Lost Reason",
				{"lost_reason": "PERF " + self.tag},
				{"lost_reason": "PERF " + self.tag},
			)
			for pipeline in ("a", "b", "private"):
				title = f"PERF {self.tag} {pipeline}"
				values = {
					"pipeline_name": title,
					"sales_company": self.name("company_" + ("a" if pipeline == "a" else "b")),
					"currency": "MXN",
					"probability_policy": "Manual",
					"roles": [{"role": restricted}] if pipeline == "private" else [],
					"stages": [
						{"status": self.name("stage_" + key), "probability": probability}
						for key, _, probability in STAGES
					],
				}
				self.ensure("pipeline_" + pipeline, "CRM Pipeline", {"pipeline_name": title}, values)
			for branch in ("a", "b"):
				manager = "manager_" + branch
				self.ensure(
					"hierarchy_" + manager,
					"CRM Sales Hierarchy",
					{"user": self.user(manager)},
					{"user": self.user(manager), "is_group": 1, "enabled": 1},
				)
			for i in range(12):
				alias = f"seller_{i:02}"
				self.ensure(
					"hierarchy_" + alias,
					"CRM Sales Hierarchy",
					{"user": self.user(alias)},
					{
						"user": self.user(alias),
						"reports_to": self.name("hierarchy_manager_" + ("a" if i < 6 else "b")),
						"enabled": 1,
					},
				)
			for alias in ACTORS:
				companies, pipelines = actor_scope(alias)
				dimensions = {
					"Company": [self.name("company_" + b) for b in companies],
					"CRM Pipeline": [self.name("pipeline_" + p) for p in pipelines],
				}
				if alias == "counter":
					dimensions.update(
						{"Social Shop": [self.name("shop_a")], "Laboratorio": [self.name("lab_a")]}
					)
				for doctype, names in dimensions.items():
					for value in names:
						values = {
							"user": self.user(alias),
							"allow": doctype,
							"for_value": value,
							"apply_to_all_doctypes": 1,
						}
						self.ensure(
							f"grant:{alias}:{doctype}:{value}",
							"User Permission",
							{k: values[k] for k in ("user", "allow", "for_value")},
							values,
						)
			self.checkpoint()

	def deal_values(self, index):
		recipe = deal_recipe(index, self.scale)
		return {
			"deal_name": label(self.site, "deal", index),
			"pipeline": self.name("pipeline_" + recipe["pipeline"]),
			"sales_company": self.name("company_" + recipe["company"]),
			"deal_owner": self.user(recipe["owner"]) if recipe["owner"] else "",
			"status": self.name("stage_" + recipe["stage"]),
			"currency": "MXN",
			"expected_deal_value": recipe["value"],
			"expected_closure_date": str(
				date.fromisoformat(self.receipt["anchor_date"]) + timedelta(days=30)
			),
			"probability": recipe["probability"],
			"lost_reason": self.name("loss") if recipe["stage"] == "lost" else None,
			"doco_shop": self.name("shop_" + recipe["company"]),
			"contacts": [{"contact": self.name("contact_" + recipe["company"]), "is_primary": 1}],
		}

	def deals(self):
		for index in range(self.sizes["deals"]):
			values = self.deal_values(index)
			with actor(self.f, self.user(deal_recipe(index, self.scale)["actor"])):

				def create(values=values):
					initial = {**values, "status": self.name("stage_open"), "lost_reason": None}
					doc = self.f.get_doc({"doctype": "CRM Deal", **initial}).insert()
					if values["status"] != initial["status"]:
						doc.update(values)
						doc.save()
					return doc

				self.ensure(
					f"deal:{index}", "CRM Deal", {"deal_name": values["deal_name"]}, values, create=create
				)
		self.checkpoint()

	def activities(self):
		from crm.api.comment import add_comment

		for kind, index, parent in activity_schedule(self.scale):
			title = label(self.site, kind, index)
			parent_name = self.name(f"deal:{parent}")
			recipe = deal_recipe(parent, self.scale)
			reference = {"reference_doctype": "CRM Deal", "reference_docname": parent_name}
			create = None
			if kind == "task":
				doctype = "CRM Task"
				values = {
					**reference,
					"title": title,
					"status": "Todo" if index % 5 else "Done",
					"assigned_to": self.user(recipe["actor"]),
					"due_date": due_date(self.receipt["anchor_date"], index),
				}
				identity = {"title": title}
			elif kind == "comment":
				doctype = "Comment"
				values = {
					"reference_doctype": "CRM Deal",
					"reference_name": parent_name,
					"content": f"<p>{title}</p>",
					"comment_type": "Comment",
				}
				identity = {"reference_doctype": "CRM Deal", "content": values["content"]}

				def create(p=parent_name, c=values["content"]):
					return add_comment("CRM Deal", p, c)
			elif kind == "note":
				doctype = "FCRM Note"
				values = {**reference, "title": title, "content": f"<p>{title}</p>"}
				identity = {"title": title}
			else:
				doctype = "CRM Call Log"
				values = {
					**reference,
					"medium": title,
					"telephony_medium": "Manual",
					"type": "Outgoing",
					"status": "Completed",
					"from": "+12025550100",
					"to": "+12025550101",
					"caller": self.user(recipe["actor"]),
					"duration": 60,
				}
				identity = {"medium": title}
			with actor(self.f, self.user(recipe["actor"])):
				self.f.get_doc("CRM Deal", parent_name).check_permission("write")
				self.ensure(f"{kind}:{index}", doctype, identity, values, create=create)
		self.checkpoint()

	def repairs(self):
		from taller.repair.repair_orders import (
			create_and_link_repair_order,
			get_deal_repair_context,
			resolve_deal_repair_request,
		)

		for index in range(self.sizes["repairs"]):
			key = f"repair:{index}"
			self.last_key = key
			parent = self.name(f"deal:{repair_parent(index, self.scale)}")
			if key not in self.journal["commands"]:
				self.journal["commands"][key] = str(uuid4())
				self.save()  # Identity durable before the first native command.
			request = self.journal["commands"][key]
			with actor(self.f, self.user("counter")):
				require(get_deal_repair_context(parent)["can_create"], "seed_intake_denied")
				payload = {
					"deal_name": parent,
					"device_model": self.name("device"),
					"falla_reportada": label(self.site, "repair", index),
					"laboratorio": self.name("lab_a"),
					"client_uuid": request,
				}
				name = create_and_link_repair_order(**payload)
				require(create_and_link_repair_order(**payload) == name, "seed_intake_replay")
				require(
					resolve_deal_repair_request(parent, request) == {"status": "created", "name": name},
					"seed_intake_resolution",
				)
				doc = self.f.get_doc("Repair Order", name)
				verify_fields(
					doc,
					{
						"crm_deal": parent,
						"client_uuid": request,
						"device_model": self.name("device"),
						"laboratorio": self.name("lab_a"),
						"client": self.name("contact_a"),
						"customer": self.name("customer_a"),
						"falla_reportada": payload["falla_reportada"],
						"owner": self.user("counter"),
					},
				)
				old = self.records.get(key)
				record = {"doctype": "Repair Order", "name": name, "fields_digest": checksum(payload)}
				require(not old or old == record, "seed_intake_drift")
				self.records[key] = record
				# Commit each intake before the next UUID journal write. A
				# crash cannot leave journaled records from an uncommitted RO.
				self.checkpoint()
		self.checkpoint()

	def archive(self):
		with actor(self.f, "Administrator"):
			for key in ("a", "b", "private"):
				doc = self.f.get_doc("CRM Pipeline", self.name("pipeline_" + key))
				row = next(row for row in doc.stages if row.status == self.name("stage_history"))
				if not row.archived:
					row.archived = 1
					doc.save()
		self.checkpoint()

	def _verify_activity_distribution(self, expected_activity):
		"""Check exact per-parent counts through the native grouped query API."""
		f = self.f
		for kind, dt in (
			("task", "CRM Task"),
			("comment", "Comment"),
			("note", "FCRM Note"),
			("call", "CRM Call Log"),
		):
			field = "reference_name" if kind == "comment" else "reference_docname"
			filters = {"reference_doctype": "CRM Deal"}
			if kind == "comment":
				filters["comment_type"] = "Comment"
			rows = f.get_all(
				dt,
				fields=[field, {"COUNT": "name", "as": "row_count"}],
				filters=filters,
				group_by=field,
				order_by=None,
				limit_page_length=0,
			)
			require(
				{row[field]: row.row_count for row in rows} == dict(expected_activity[kind]),
				"seed_activity_distribution",
			)

	def verify(self):
		from seed_plan import expected_visible

		f = self.f
		self.runtime_guard()
		expected_names = {self.name(f"deal:{i}") for i in range(self.sizes["deals"])}
		require(
			set(f.get_all("CRM Deal", pluck="name", limit_page_length=0)) == expected_names, "seed_deal_count"
		)
		for dt, prefix in (("Company", "company_"), ("Customer", "customer_"), ("Contact", "contact_")):
			require(
				set(f.get_all(dt, pluck="name", limit_page_length=0))
				== {self.name(prefix + branch) for branch in ("a", "b")},
				"seed_master_population",
			)
		for i in range(self.sizes["deals"]):
			doc = f.get_doc("CRM Deal", self.name(f"deal:{i}"))
			verify_fields(doc, self.deal_values(i))
			require(
				len(doc.status_change_log) >= (1 if deal_recipe(i, self.scale)["stage"] == "open" else 2),
				"seed_status_history_missing",
			)
			require(doc.exchange_rate == 1, "seed_currency_rate")
			if deal_recipe(i, self.scale)["stage"] == "won":
				require(bool(doc.closed_date), "seed_won_date")
			if doc.deal_owner:
				require(
					f.db.exists(
						"ToDo",
						{
							"reference_type": "CRM Deal",
							"reference_name": doc.name,
							"allocated_to": doc.deal_owner,
							"status": "Open",
						},
					),
					"seed_assignment_missing",
				)
		counts = {}
		for kind, dt in (
			("task", "CRM Task"),
			("note", "FCRM Note"),
			("call", "CRM Call Log"),
			("repair", "Repair Order"),
		):
			counts[kind + "s"] = f.db.count(dt)
			require(counts[kind + "s"] == self.sizes[kind + "s"], "seed_activity_count")
		counts["comments"] = f.db.count(
			"Comment", {"comment_type": "Comment", "reference_doctype": "CRM Deal"}
		)
		require(counts["comments"] == self.sizes["comments"], "seed_comment_count")
		from collections import Counter

		expected_activity = {kind: Counter() for kind in ("task", "comment", "note", "call")}
		for kind, _, parent in activity_schedule(self.scale):
			expected_activity[kind][self.name(f"deal:{parent}")] += 1
		self._verify_activity_distribution(expected_activity)
		for key in ("a", "b", "private"):
			stages = f.get_doc("CRM Pipeline", self.name("pipeline_" + key)).stages
			require(
				[row.status for row in stages if row.archived] == [self.name("stage_history")],
				"seed_archive_history",
			)
		for index in range(self.sizes["repairs"]):
			parent = self.name(f"deal:{repair_parent(index, self.scale)}")
			links = f.get_all(
				"CRM Deal Repair Order",
				filters={
					"parent": parent,
					"parenttype": "CRM Deal",
					"repair_order": self.name(f"repair:{index}"),
				},
				pluck="name",
			)
			require(len(links) == 1, "seed_intake_parent_link")
		scopes = {}
		for profile, alias in PROFILES.items():
			expected = {
				self.name(f"deal:{i}")
				for i in range(self.sizes["deals"])
				if expected_visible(alias, deal_recipe(i, self.scale))
			}
			actual = []
			with actor(f, self.user(alias)):
				for start in range(0, self.sizes["deals"] + 200, 200):
					page = f.get_list(
						"CRM Deal",
						fields=["name"],
						order_by="name asc",
						limit_start=start,
						limit_page_length=200,
					)
					actual.extend(row.name for row in page)
					if len(page) < 200:
						break
				require(
					len(actual) == len(set(actual)) and set(actual) == expected, "seed_permission_projection"
				)
				# Include a real explicit denial, not just filtered queue parity.
				hidden = expected_names - expected
				if hidden:
					require(
						not f.has_permission(
							"CRM Deal", "read", doc=f.get_doc("CRM Deal", sorted(hidden)[0])
						),
						"seed_parent_denial",
					)
			scopes[profile] = {"actor": alias, "count": len(actual), "names_digest": checksum(sorted(actual))}
		generated = {dt: f.db.count(dt) for dt in ("Version", "CRM Status Change Log", "ToDo")}
		return {
			"version": 1,
			"site": self.site,
			"scale": self.scale,
			"binding": self.binding,
			"counts": {"deals": len(expected_names), **counts},
			"scopes": scopes,
			"generated": generated,
			"native_controllers": True,
			"perf_01_ready": False,
			"missing": [
				"webchat_seed",
				"account_scope",
				"field_mask_scenario",
				"http_bindings",
				"sql_http_bridge",
				"browser_measurements",
			],
		}


def run(receipt_path, sites, output, scale="preflight", preflight=None):
	require(scale in SIZES, "seed_scale")
	receipt = read_json(private_file(receipt_path))
	sites = provision_guard(receipt, sites)
	if scale == "full":
		proof = read_json(private_file(preflight)) if preflight else None
		verify_preflight(proof, receipt)
	import frappe

	frappe.init(site=receipt["site"], sites_path=str(sites))
	frappe.connect()
	lock = "crm-performance-seed:" + namespace(receipt["site"])
	acquired = False
	try:
		frappe.set_user("Administrator")
		require(frappe.db.sql("SELECT GET_LOCK(%s, 0)", (lock,))[0][0] == 1, "seed_locked")
		acquired = True
		seed = Seed(frappe, receipt, output, scale)
		seed.runtime_guard()
		for phase in ("masters", "deals", "activities", "repairs", "archive"):
			seed.phase = phase
			getattr(seed, phase)()
		seed.phase = "verify"
		result = seed.verify()
		result["sources_digest"] = checksum(receipt["sources"])
		seed.journal["complete"] = True
		seed.checkpoint()
		atomic_json(Path(output) / "native-postconditions.json", result)
		return result
	except BaseException as error:
		frappe.db.rollback()
		if "seed" in locals():
			atomic_json(
				Path(output) / "native-failure.json",
				{
					"state": "failed",
					"phase": getattr(seed, "phase", "guard"),
					"fixture_alias": getattr(seed, "last_key", None),
					"error_type": type(error).__name__,
					"code": str(error) if isinstance(error, ContractError) else "native_controller_failure",
					"binding": seed.binding,
				},
			)
		raise
	finally:
		if acquired:
			frappe.db.sql("SELECT RELEASE_LOCK(%s)", (lock,))
		frappe.destroy()


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--provision", required=True)
	parser.add_argument("--sites", required=True)
	parser.add_argument("--output", required=True)
	parser.add_argument("--scale", choices=tuple(SIZES), default="preflight")
	parser.add_argument("--preflight")
	args = parser.parse_args()
	try:
		result = run(args.provision, args.sites, args.output, args.scale, args.preflight)
		print(
			json.dumps(
				{
					"state": "native_seed_verified",
					"scale": result["scale"],
					"counts": result["counts"],
					"perf_01_ready": False,
				}
			)
		)
		return 0
	except ContractError as exc:
		print("NOT_READY: " + str(exc), file=sys.stderr)
		return 2
	except (OSError, ValueError, TypeError):
		print("NOT_READY: native seed configuration failed", file=sys.stderr)
		return 2
	except Exception:
		# Native controller errors remain failures. No traceback/customer/config
		# body escapes into public CI; inspect the disposable site's private log.
		print("FAILED: native controller rejected the seed; retain private site evidence", file=sys.stderr)
		return 1


if __name__ == "__main__":
	raise SystemExit(main())
