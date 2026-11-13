"""«Importar productos» / «Importar clientes» (crm.api.importar) over doco's importer: who may
import, the template, the review of a sheet (columns, rows with errors, their download), the shop's
catalog answers on the new products, the import as the person, its state (with why the stock is
missing) and «Deshacer».

The site tests need a doco whose importer has the seams the screen calls (`importar.SEAMS`). They
skip where doco is not installed or is older than those seams, naming the missing ones, and fail
where the seams are there and the screen still cannot load them."""

# ci: shell-apis

import io
import json
from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import importar

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

PREFIX = "Importar SPA"
NO_ROLES = "importar-spa-sin-permiso@example.com"
OTHER = "importar-spa-otra@example.com"


def _engine():
	if not HAS_FRAPPE:
		return None
	try:
		return importar._engine()
	except Exception:
		return None


def _why_skip() -> str | None:
	"""Why the site tests cannot run here, or None: doco absent, or older than the screen's seams."""
	if not HAS_FRAPPE:
		return "Frappe integration dependency is not installed"
	if "doco" not in frappe.get_installed_apps():
		return "doco is not installed"
	missing = importar.missing_seams()
	if missing is None:
		return "doco on this site has no sheet importer (doco.docoutils.importacion)"
	if missing:
		return "doco on this site predates the shell's import seams: " + ", ".join(missing)
	return None


ENGINE = _engine()
SKIP = _why_skip()


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestImportarHelpers(TestCase):
	"""What the screen shows of a sheet, without a site."""

	def setUp(self):
		lang = getattr(frappe.local, "lang", None)
		frappe.local.lang = "en"
		self.addCleanup(setattr, frappe.local, "lang", lang)

	def test_column_letters_follow_the_sheet(self):
		self.assertEqual(
			[importar._letter(index) for index in (0, 1, 25, 26, 27, 51, 52)],
			["A", "B", "Z", "AA", "AB", "AZ", "BA"],
		)

	def test_a_cell_reads_as_one_short_line(self):
		self.assertEqual(importar._texto(None), "")
		self.assertEqual(importar._texto(12.0), "12")
		self.assertEqual(importar._texto("  Funda \n rosa "), "Funda rosa")
		self.assertEqual(len(importar._texto("x" * 200)), 80)

	def test_the_undo_line_names_the_opening_stock_by_what_it_is(self):
		text = importar._undone_text(
			"Deshecha: 3 eliminados, inventario inicial en borrador MAT-RECO-2026-00004 borrado",
			{"inventario": "MAT-RECO-2026-00004"},
		)
		self.assertEqual(text, "3 eliminados, inventario inicial en borrador borrado")
		self.assertEqual(importar._undone_text("Deshecha: 2 eliminados", {}), "2 eliminados")
		self.assertEqual(importar._undone_text("Deshecha: nada que deshacer", {}), "Nada que deshacer")

	def test_a_row_message_stands_alone_on_the_screen(self):
		self.assertEqual(importar._capital("falta nombre"), "Falta nombre")
		self.assertEqual(importar._capital("«F-1» repetido"), "«F-1» repetido")
		self.assertEqual(importar._capital(None), "")
		self.assertEqual(
			importar._generic("el código de barras «7501001112223» ya es de otro producto"),
			"El código de barras «…» ya es de otro producto",
		)

	def test_the_stock_outcome_says_why_the_stock_is_missing(self):
		self.assertEqual(importar._stock_lines({}), [])
		self.assertEqual(importar._stock_lines(None), [])
		lines = importar._stock_lines({"motivo": "sin_cuenta", "sin_costo": 2})
		self.assertEqual(len(lines), 1)
		self.assertIn("temporary opening account", lines[0])
		lines = importar._stock_lines({"documento": "X", "sin_costo": 2, "serie": 3, "lote": 0})
		self.assertEqual(len(lines), 2)
		self.assertIn("2 products", lines[0])
		self.assertIn("3 products have a serial number", lines[1])

	def test_doco_facts_read_in_the_screens_words(self):
		line = importar._fact(
			{"codigo": "seguimiento", "serie": True, "lote": False, "filas": 4, "con_existencia": 2},
			"productos",
		)
		self.assertIn("4 new products are created with a serial number", line)
		self.assertIn("The stock of 2 of them", line)
		self.assertIn(
			"lots",
			importar._fact(
				{"codigo": "seguimiento", "serie": False, "lote": True, "filas": 1, "con_existencia": 0},
				"productos",
			),
		)
		self.assertEqual(importar._fact({"codigo": "precios_en", "lista": "X"}, "productos"), "")
		self.assertIn("phone and email", importar._fact({"codigo": "actualiza", "filas": 1}, "clientes"))

	def test_sicar_facts_read_in_the_screens_words(self):
		"""doco's `sicar_…` facts (tabular.sicar): prices with their taxes, what is not imported yet."""
		prices = importar._fact(
			{
				"codigo": "sicar_precios_mas_impuestos",
				"impuestos": [
					{"impuesto": "I.V.A.", "tasa": 16.0, "origen": "archivo", "productos": 3191},
					{
						"impuesto": "IEPS",
						"tasa": 8.0,
						"origen": "precios",
						"productos": 990,
						"redondos": 958,
						"probados": 990,
					},
					{"impuesto": "I.V.A 0", "tasa": 0.0, "origen": "archivo", "productos": 3193},
				],
			},
			"productos",
		)
		self.assertIn("PRECIO 1 plus I.V.A. 16% (3191 products), IEPS 8% (990 products).", prices)
		self.assertNotIn("I.V.A 0", prices)
		self.assertIn("The rate of IEPS is not in the file: at 8%, 958 of 990 prices", prices)
		levels = importar._fact(
			{"codigo": "sicar_otros_precios", "precio_2": 2868, "precio_3": 0, "precio_4": 8, "mayoreo": 15},
			"productos",
		)
		self.assertEqual(
			levels,
			"Not imported yet: PRECIO 2 (2868 products), PRECIO 4 (8 products), wholesale prices (15 products). "
			"Only PRECIO 1 becomes the selling price.",
		)
		parties = importar._fact(
			{"codigo": "sicar_datos_sin_importar", "credito": 8, "domicilio": 2, "correos": 1}, "clientes"
		)
		self.assertIn("address (2), credit limit and days (8)", parties)
		self.assertIn("the first one is used", parties)
		self.assertEqual(importar._fact({"codigo": "sicar_algo_nuevo"}, "productos"), "")
		plan = type("Plan", (), {"source": {"sistema": "sicar", "exportacion": "articulos"}})()
		self.assertEqual(
			importar._source_note(plan),
			["This is SICAR's products export: its columns are read as SICAR writes them."],
		)
		self.assertEqual(importar._source_note(type("Plan", (), {})()), [])


@skipIf(SKIP is not None, SKIP or "")
class TestImportar(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.local.response = frappe._dict()
		# the screen's own sentences in their English source, whatever the site's language
		lang = frappe.local.lang
		frappe.local.lang = "en"
		self.addCleanup(setattr, frappe.local, "lang", lang)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_the_engine_loads_where_doco_has_the_seams(self):
		self.assertIsNotNone(ENGINE, "doco has every seam the screen calls, yet the screen cannot load them")

	# ── helpers ──────────────────────────────────────────────────────────

	def _file(self, name, text):
		doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": name,
				"content": text.encode("utf-8"),
				"is_private": 1,
			}
		).insert(ignore_permissions=True)
		return doc.name

	def _user(self, email, roles=()):
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": "Prueba",
					"last_name": "Importar",
					"send_welcome_email": 0,
					"user_type": "System User",
					"roles": [{"role": role} for role in roles],
				}
			).insert(ignore_permissions=True)
		return email

	def _customers_sheet(self, tag):
		return self._file(
			f"clientes-{tag}.csv",
			"Nombre,RFC,Teléfono,Correo\n"
			f"{PREFIX} {tag} Uno,,6691234567,uno@example.com\n"
			",,6690000000,\n"
			f"{PREFIX} {tag} Dos,,,\n"
			f"{PREFIX} {tag} Uno,,,\n",
		)

	def _answers(self, **answers):
		"""Abordo's catalog answers in force for this test (doco reads them by name)."""
		if "abordo" not in frappe.get_installed_apps():
			self.skipTest("abordo is not installed")
		patcher = patch(
			"abordo.guides.preflight.catalog_preflight",
			return_value={"pending_hard": [], "answers": answers},
		)
		patcher.start()
		self.addCleanup(patcher.stop)

	def _stocked_products(self, tag):
		return self._file(
			f"productos-{tag}.csv",
			"Código,Producto,Costo,Existencia\n"
			f"IMP-{tag}-1,{PREFIX} {tag} Uno,80,5\n"
			f"IMP-{tag}-2,{PREFIX} {tag} Dos,40,3\n",
		)

	def _book(self):
		from openpyxl import load_workbook

		return load_workbook(io.BytesIO(frappe.local.response.filecontent))

	# ── opciones and the template ────────────────────────────────────────

	def test_options_say_what_the_person_may_import(self):
		out = importar.opciones("clientes")
		self.assertTrue(out["disponible"])
		self.assertTrue(out["puede"])
		self.assertEqual(out["limite_filas"], ENGINE.constants.MAX_ROWS)
		self.assertIn("customer_name", [campo["campo"] for campo in out["campos"]])
		self.assertEqual(out["tambien"], "productos")
		with self.assertRaises(frappe.ValidationError):
			importar.opciones("proveedores")

	def test_someone_who_may_not_add_customers_is_told_why_and_reads_nothing(self):
		frappe.set_user(self._user(NO_ROLES))
		out = importar.opciones("clientes")
		self.assertFalse(out["puede"])
		self.assertTrue(out["motivo"])
		self.assertEqual(out["recientes"], [])
		frappe.set_user("Administrator")
		archivo = self._customers_sheet("permiso")
		frappe.set_user(NO_ROLES)
		with self.assertRaises(frappe.PermissionError):
			importar.revisar(archivo=archivo, que="clientes")

	def test_the_template_titles_are_the_ones_the_mapper_reads(self):
		from doco.docoutils.tabular.headers import map_columns

		for que in ("productos", "clientes"):
			with self.subTest(que=que):
				frappe.local.response = frappe._dict()
				importar.plantilla(que)
				self.assertEqual(frappe.local.response.type, "binary")
				header = [cell.value for cell in next(self._book().active.iter_rows(max_row=1))]
				schema = ENGINE.schemas.ENTITIES[que]
				mapping = map_columns(header, schema)
				self.assertEqual(set(mapping.columns), {item.name for item in schema.fields})

	# ── revisar ──────────────────────────────────────────────────────────

	def test_the_review_counts_the_rows_and_says_why_one_is_refused(self):
		review = importar.revisar(archivo=self._customers_sheet("revision"), que="clientes")
		self.assertTrue(review["vista"].startswith(ENGINE.constants.PREVIEW_PREFIX))
		self.assertEqual(
			review["cuentas"], {"nuevas": 2, "actualizar": 0, "existentes": 0, "repetidas": 1, "errores": 1}
		)
		self.assertEqual(review["por_importar"], 2)
		self.assertEqual([error["fila"] for error in review["errores"]], [3])
		self.assertIn("nombre", review["errores"][0]["motivo"])
		self.assertEqual([row["fila"] for row in review["omitidas"]], [5])
		name = next(campo for campo in review["campos"] if campo["campo"] == "customer_name")
		self.assertEqual(name["columna"], 0)
		self.assertEqual(review["faltan"], [])
		self.assertEqual([row["fila"] for row in review["muestra"]], [2, 4])
		first = {item["campo"]: item["valor"] for item in review["muestra"][0]["valores"]}
		self.assertEqual(first["customer_name"], f"{PREFIX} revision Uno")

	def test_a_sicar_export_uploaded_as_the_other_kind_says_which_import_it_is(self):
		import importlib.util

		if importlib.util.find_spec("doco.docoutils.tabular.sicar") is None:
			self.skipTest("this doco does not recognize SICAR exports yet")
		header = "\t".join(
			(
				"CLAVE",
				"CLAVE ALTERNA",
				"DESCRIPCION",
				"SERVICIO (S/N)",
				"PRECIO COMPRA",
				"PRECIO 1",
				"EXIST.",
				"DEPARTAMENTO",
				"GRANEL (S/N)",
				"IMPUESTO (S/N)",
			)
		)
		row = "\t".join(
			("SICAR-1", "", "Aceite", "false", "10.000", "12.000000", "1.0000", "ABARROTES", "N", "N")
		)
		archivo = self._file("articulosExportados.xls", f"{header}\n{row}\n")
		review = importar.revisar(archivo=archivo, que="clientes")
		self.assertEqual(len(review["bloqueos"]), 1)
		self.assertIn("impórtalo como productos", review["bloqueos"][0])
		with patch.object(importar, "_catalog_pending", return_value=0):
			review = importar.revisar(archivo=archivo, que="productos")
		self.assertEqual(review["bloqueos"], [])
		self.assertIn(
			"This is SICAR's products export: its columns are read as SICAR writes them.", review["avisos"]
		)

	def test_the_rows_with_errors_download_as_a_sheet_with_the_reason(self):
		review = importar.revisar(archivo=self._customers_sheet("descarga"), que="clientes")
		importar.filas_con_error(review["vista"])
		rows = list(self._book().active.iter_rows(values_only=True))
		self.assertEqual(len(rows), 2)
		self.assertEqual(rows[0][:4], ("Nombre", "RFC", "Teléfono", "Correo"))
		self.assertEqual(str(rows[1][2]), "6690000000")
		self.assertIn("nombre", rows[1][-1])

	def test_a_sheet_without_codes_waits_until_the_name_is_the_code(self):
		archivo = self._file("sin-codigo.csv", f"Producto,Grupo\n{PREFIX} Funda,\n{PREFIX} Mica,\n")
		with patch.object(importar, "_catalog_pending", return_value=0):
			review = importar.revisar(archivo=archivo, que="productos")
			self.assertEqual(review["faltan"], ["item_code"])
			self.assertIsNone(review["vista"])
			self.assertEqual(review["por_importar"], 0)
			review = importar.revisar(
				archivo=archivo, que="productos", columnas=json.dumps({"item_name": 0, "item_code": 0})
			)
		self.assertTrue(review["nombre_como_codigo"])
		self.assertEqual(review["faltan"], [])
		self.assertEqual(review["por_importar"], 2)
		self.assertTrue(review["vista"])

	def test_column_choices_are_checked_before_any_read(self):
		archivo = self._customers_sheet("columnas")
		for columnas in ("[0]", "no", json.dumps({"customer_name": "A"}), json.dumps({"campo": 0})):
			with self.subTest(columnas=columnas), self.assertRaises(frappe.ValidationError):
				importar.revisar(archivo=archivo, que="clientes", columnas=columnas)
		with self.assertRaises(frappe.ValidationError):
			importar.revisar(
				archivo=archivo, que="clientes", columnas=json.dumps({"customer_name": 0, "tax_id": 0})
			)

	def test_products_wait_for_abordos_catalog_questions(self):
		archivo = self._file("productos-preguntas.csv", f"Código,Producto\nIMP-SPA-9,{PREFIX} Cable\n")
		with patch.object(importar, "_catalog_pending", return_value=2):
			self.assertEqual(importar.opciones("productos")["preguntas"], 2)
			if "abordo" in frappe.get_installed_apps():
				with (
					patch(
						"abordo.guides.preflight.require_catalog_preflight",
						side_effect=frappe.ValidationError("responde primero"),
					),
					self.assertRaises(frappe.ValidationError),
				):
					importar.revisar(archivo=archivo, que="productos")

	# ── importar, estado, deshacer ───────────────────────────────────────

	def test_customers_import_at_once_and_undo_takes_them_back(self):
		review = importar.revisar(archivo=self._customers_sheet("alta"), que="clientes")
		done = importar.importar(review["vista"])
		self.assertTrue(done["terminada"])
		self.assertEqual(done["estado"], "Importado")
		self.assertEqual(done["creadas"], 2)
		self.assertEqual(done["que"], "clientes")
		self.assertTrue(done["deshacible"])
		for name in (f"{PREFIX} alta Uno", f"{PREFIX} alta Dos"):
			self.assertTrue(frappe.db.exists("Customer", {"customer_name": name}))
		record = frappe.db.get_value(
			ENGINE.constants.DOCTYPE, done["registro"], ["confirmed_by", "accion"], as_dict=True
		)
		self.assertEqual(record.confirmed_by, "Administrator")
		self.assertTrue(record.accion)
		# the review is used: the same one imports nothing twice
		with self.assertRaises(frappe.ValidationError):
			importar.importar(review["vista"])
		self.assertIn(
			done["registro"], [row["registro"] for row in importar.opciones("clientes")["recientes"]]
		)

		undone = importar.deshacer(done["registro"])
		self.assertEqual(undone["estado"], "Deshecho")
		self.assertFalse(undone["deshacible"])
		self.assertTrue(undone["deshecha"])
		for name in (f"{PREFIX} alta Uno", f"{PREFIX} alta Dos"):
			# deleted, or turned off where another app already points at it
			self.assertFalse(frappe.db.exists("Customer", {"customer_name": name, "disabled": 0}))
		with self.assertRaises(frappe.ValidationError):
			importar.deshacer(done["registro"])

	def test_products_named_as_their_codes_import_and_undo(self):
		archivo = self._file(
			"productos-nombre.csv", f"Producto,Grupo\n{PREFIX} Funda azul,\n{PREFIX} Mica 9H,\n"
		)
		with patch.object(importar, "_catalog_pending", return_value=0):
			review = importar.revisar(
				archivo=archivo, que="productos", columnas=json.dumps({"item_name": 0, "item_code": 0})
			)
			done = importar.importar(review["vista"])
		self.assertEqual(done["estado"], "Importado", done)
		self.assertEqual(done["creadas"], 2)
		self.assertTrue(frappe.db.exists("Item", f"{PREFIX} Funda azul"))
		self.assertEqual(frappe.db.get_value("Item", f"{PREFIX} Mica 9H", "item_name"), f"{PREFIX} Mica 9H")
		undone = importar.deshacer(done["registro"])
		self.assertEqual(undone["estado"], "Deshecho")
		self.assertFalse(frappe.db.exists("Item", {"name": f"{PREFIX} Funda azul", "disabled": 0}))

	def test_many_rows_go_to_the_background_job_and_report_progress(self):
		lines = "".join(f"{PREFIX} fondo {n},,,\n" for n in range(1, 4))
		archivo = self._file("clientes-fondo.csv", "Nombre,RFC,Teléfono,Correo\n" + lines)
		review = importar.revisar(archivo=archivo, que="clientes")
		with (
			patch.object(ENGINE.constants, "INLINE_ROWS", 2),
			patch("frappe.enqueue") as enqueue,
		):
			self.assertTrue(importar.revisar(archivo=archivo, que="clientes")["en_segundo_plano"])
			running = importar.importar(review["vista"])
		jobs = [call for call in enqueue.call_args_list if call.args and call.args[0] == ENGINE.apply.JOB]
		self.assertEqual(len(jobs), 1)
		self.assertEqual(jobs[0].kwargs["registro"], running["registro"])
		self.assertEqual(jobs[0].kwargs["chat_id"], "")
		self.assertFalse(running["terminada"])
		self.assertEqual(running["total"], 3)
		self.assertEqual(running["hechas"], 0)
		self.assertFalse(frappe.db.exists("Customer", {"customer_name": f"{PREFIX} fondo 1"}))
		with self.assertRaises(frappe.ValidationError):
			importar.deshacer(running["registro"])  # still running

	def test_another_persons_review_and_import_stay_theirs(self):
		review = importar.revisar(archivo=self._customers_sheet("ajena"), que="clientes")
		frappe.set_user(self._user(OTHER, roles=("Sales Manager",)))
		with self.assertRaises(frappe.PermissionError):
			importar.importar(review["vista"])
		with self.assertRaises(frappe.PermissionError):
			importar.filas_con_error(review["vista"])
		frappe.set_user("Administrator")
		done = importar.importar(review["vista"])
		frappe.set_user(NO_ROLES if frappe.db.exists("User", NO_ROLES) else self._user(NO_ROLES))
		with self.assertRaises(frappe.PermissionError):
			importar.estado(done["registro"])
		with self.assertRaises(frappe.PermissionError):
			importar.deshacer(done["registro"])

	def test_a_review_that_is_gone_says_so(self):
		with self.assertRaises(frappe.ValidationError):
			importar.importar("im-000000000000")

	def test_a_template_with_empty_codes_offers_the_name_as_the_code(self):
		frappe.local.response = frappe._dict()
		importar.plantilla("productos")
		header = [cell.value for cell in next(self._book().active.iter_rows(max_row=1))]
		name = header.index(ENGINE.schemas.ENTITIES["productos"].field("item_name").label)
		lines = []
		for number in (1, 2):
			row = [""] * len(header)
			row[name] = f"{PREFIX} plantilla {number}"
			lines.append(",".join(row))
		archivo = self._file("plantilla-sin-codigo.csv", ",".join(header) + "\n" + "\n".join(lines) + "\n")
		with patch.object(importar, "_catalog_pending", return_value=0):
			review = importar.revisar(archivo=archivo, que="productos")
			self.assertEqual(review["faltan"], [])
			self.assertEqual((review["sin_codigo"], review["por_importar"]), (2, 0))
			self.assertEqual(review["cuentas"]["errores"], 2)
			# every row refused: the review is kept, so its rows download to fix
			self.assertTrue(review["vista"])
			frappe.local.response = frappe._dict()
			importar.filas_con_error(review["vista"])
			self.assertEqual(len(list(self._book().active.iter_rows(values_only=True))), 3)
			with self.assertRaisesRegex(frappe.ValidationError, "Nothing to import"):
				importar.importar(review["vista"])
			review = importar.revisar(
				archivo=archivo, que="productos", columnas=json.dumps({"item_name": name, "item_code": name})
			)
		self.assertTrue(review["nombre_como_codigo"])
		self.assertEqual((review["sin_codigo"], review["por_importar"]), (0, 2))

	def test_a_sheet_over_the_row_cap_is_refused_in_the_screens_words(self):
		with patch.object(ENGINE.constants, "MAX_ROWS", 1):
			with self.assertRaisesRegex(frappe.ValidationError, "up to 1 are imported at once"):
				importar.revisar(archivo=self._customers_sheet("tope"), que="clientes")

	def test_series_answered_reach_the_products_the_screen_imports(self):
		self._answers(
			**{"catalog.serial_numbers": True, "catalog.batches": False, "catalog.valuation": "FIFO"}
		)
		review = importar.revisar(archivo=self._stocked_products("serie"), que="productos")
		self.assertTrue(any("serial number" in line for line in review["avisos"]), review["avisos"])
		self.assertFalse(any("draft opening stock" in line for line in review["avisos"]), review["avisos"])
		done = importar.importar(review["vista"])
		self.assertEqual(done["estado"], "Importado", done)
		item = frappe.db.get_value("Item", "IMP-serie-1", ["has_serial_no", "valuation_method"], as_dict=True)
		self.assertEqual((item.has_serial_no, item.valuation_method), (1, "FIFO"))
		self.assertIsNone(done["inventario"])
		self.assertTrue(any("2 products have a serial number" in line for line in done["existencia"]), done)
		importar.deshacer(done["registro"])

	def test_an_import_that_left_the_stock_out_says_why(self):
		if "abordo" in frappe.get_installed_apps():
			self._answers()  # no catalog answer keeps any product's stock apart
		review = importar.revisar(archivo=self._stocked_products("cuenta"), que="productos")
		with patch(
			"erpnext.stock.doctype.stock_reconciliation.stock_reconciliation.get_difference_account",
			return_value=None,
		):
			done = importar.importar(review["vista"])
		self.assertEqual(done["creadas"], 2, done)
		self.assertIsNone(done["inventario"])
		self.assertEqual(len(done["existencia"]), 1, done)
		self.assertIn("temporary opening account", done["existencia"][0])
		importar.deshacer(done["registro"])
