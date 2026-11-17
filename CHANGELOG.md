# crm Changelog

Newest first. Every lane adds its entry at the top (`CHANGELOG.md merge=union` in `.gitattributes`, so parallel lanes keep both entries; do not hand-resolve it). Say what changed for the worker or the operator, the commit, and whether it is deployed; link long evidence instead of pasting it.

## 2026-11-17 — Twilio: a call log retried after a write conflict locks the log first (lane twilio-call-log-1020; not deployed)

- **Bug:** Twilio fires one call's callbacks close together. The save that lost the race (MariaDB 1020) rolled back and retried, but asked Twilio for the call before locking the log, so callbacks committing during that fetch failed the retry with 1020 again: «Error while updating call record» twice per pair on docomexico (11-14, 11-15).
- **Fix:** after the rollback the retry's first statement locks the log (`_lock_call_log`), then fetches and saves; the other callbacks wait for the lock instead of conflicting.
- **Tests:** `crm/tests/test_twilio_status_callback.py` (+1: rollback, lock, then fetch). Rollback = revert.
## 2026-11-17 — Bancos › Colchón: months of expenses kept, when it is full, and the month's plan (lane colchon; not deployed)

- **Page `/bancos/colchon` (`pages/Colchon.vue`, served by the «Tu dinero» route with Deudas and ¿A dónde va?):** «Tu meta: 3 meses de gastos fijos», what the savings accounts hold against it with a bar marked per month, and how many months it already covers; «1 Primero tus deudas … libre en jul 2027 · 2 Colchón completo en feb 2028» with a chip for each month of expenses reached; «Tus cuentas de ahorro» (bank or books figure) and «Elegir» (checkboxes over the book's bank and cash accounts); «Plan del mes» in the owner's order (fixed costs, what varies, the card minimums, the extra to the first card, the cushion, goods) down to «Te queda para retirar», and «¿Cuánto quieres retirar este mes?» says whether it fits and what it would come out of; «Ajustes del colchón»: 1–12 months and the monthly amount while debt is paid (with the two-week starter cushion as a hint).
- Bancos › Tu dinero now reads in the plan's order (Deudas, Colchón, ¿A dónde va?); ¿A dónde va? uses the plan's months and links to the cushion. Gate `bancos_routes` accepts `/crm/bancos/colchon`.
- **Tests:** `tests/unit/colchon.test.js` (7), `crm/tests/test_bancos.py` (the path). Shots at 412 px light, 305 px dark and 1280 px on a seeded lease (`.scratch/proof/`). Rollback = revert with the doco half.

## 2026-11-16 — Bancos › ¿A dónde va el dinero? (lane a-donde-va; not deployed)

- **Page `/bancos/a-donde-va` (`pages/ADondeVa.vue`):** the month (‹ ›, never past this one): «Entró / Salió / Te quedó»; «Tus gastos fijos al mes» (average of the three months before) and the 3-month cushion it asks for; «En qué se fue»: each destination with its bar, share of what came in and «+16 % vs tu promedio», «fijo» chips; a destination opens its accounts, and «Cambiar» moves one to another destination and says whether it is fixed (two taps); the bank movements still unexplained, with the way to Bancos; six months of in and out.
- Gate `bancos_routes` accepts `/crm/bancos/a-donde-va`.
- **Tests:** `tests/unit/aDondeVa.test.js` (6), `crm/tests/test_bancos.py` (the path). Shots at 412 px light, 305 px dark and 1280 px on a seeded lease (`.scratch/proof/`). Rollback = revert with the doco half.
## 2026-11-16 — Personal mailboxes and «Who reads it» (lane correo-buzones; not deployed)

- **Why:** correo program lane 2 (`~/muelle-host/correo-program/PLAN.md`). Marco connects his personal Gmail and Hotmail next to the shop's mailboxes; tenants will too. Frappe lets every System Manager read every mailbox, and a mail linked to a record shows on its timeline to whoever reads the record.
- **Personal mailbox** (Email Account «Who reads it» = Personal, with an owner; `crm/permissions/correo.py`): its mail is left out of every permission-aware list and refused on open for everyone but its owner, System Managers included; it never links itself to contacts, leads or deals (Frappe re-links on every save, so the links are dropped every time); «Vincular» refuses it and says to forward it to a shared mailbox; it never creates contacts or leads, is nobody's default, and the account is hidden from other users' settings lists. Administrator keeps full access.
- **Settings › Email › Accounts › a mailbox:** «Who reads it»: «Only me» or «My team» with a people picker; each change saves at once (`crm/api/correo_buzones.py`, written straight to the scope fields so no IMAP/SMTP login is retried). A reader also gets «Inbox User» (Frappe's role for reading mail; their «User Emails» still decide which mailboxes). The list shows a «Personal» badge.
- **Migration:** two custom fields on Email Account (`crm_alcance` default Shared, `crm_dueno`), added by patch `v1_0.email_account_scope_fields`; existing mailboxes stay Shared, so nothing changes until someone chooses «Only me».
- **Tests:** `crm/tests/test_correo_privado.py` (8: lists, open, settings list, auto-links, vincular, defaults, who reads it, who may change it); `test_d12_correo` still passes. Lease walk through the live preview: Shared → «Only me» (owner set) → Personal badge → «My team» with a seller. Rollback = revert; personal mailboxes go back to Frappe's rule.
## 2026-11-16 — Redes: the taller post takes one after photo, with its repair type (lane repair-card; not deployed)

- «Foto del taller» in the composer lists the repairs with a photo after the repair, each with its repair type and device, and picks one photo («Usar esta foto»); the card is drawn on the server (doco_marketing `repair_card`). A line reminds the reviewer that no face, name or price may show. `socialDaily.pickPhoto` replaces the before/after pair pick.
- Tests: `tests/unit/socialDaily.test.js`.

## 2026-11-16 — Bancos › Deudas: the debts, the monthly amount and order, the date the owner is free (lane deudas; not deployed)

- **Page `/bancos/deudas` (`pages/Deudas.vue`):** what is owed and where each figure comes from, «Libre de deudas en ago 2027 (9 meses)», the interest and what the plan saves against paying only the minimums; «¿Cuánto abonas al mes?» recomputes as it is typed (`simular`), chips «Salir en 12 / 24 meses» set the amount, «Tasa más alta primero» / «La más chica primero» with the other order's numbers beside it, «Guardar plan»; the debts in the order they get paid with their payoff month; cards Muelle sees added in one tap; a debt opens `DeudaSheet.vue` (rate, tax on interest, minimum, cut and due day, the typed balance only when nothing else knows it, «Ya la terminé de pagar»). A personal book switches in with the book chips.
- **Bancos:** «Tu dinero › Deudas y plan de pago» with «Debes $X · libre en mes año». Gate `bancos_routes` accepts `/crm/bancos/deudas`.
- **Plan doc:** `docs/DINERO_EN_ORDEN.md` §3c, the same plan for every tenant (two books, who sees what, any bank, a few taps, safe, the assistant).
- **Tests:** `tests/unit/deudas.test.js` (7), `crm/tests/test_bancos.py` (the path). Shots at 412 px light, 305 px dark and 1280 px on a lease (`.scratch/proof/`). Rollback = revert with the doco half.
## 2026-11-16 — «Usar en la tienda» on the product page (lane equipo-tienda; not deployed)

- **What:** the product's actions and «⋯» tools offer «Usar en la tienda» (doco `product_equipo`): a sheet asks the store, the serial number from the box (or how many), who uses it and what for, says what stays for sale, and sends one request a retry repeats with the same id. The answer says the piece left as the shop's equipment, not as a sale, and links its asset.
- **Files:** `components/productos/EquipoSheet.vue`, `equipo.js`, `pages/Producto.vue`.
- **Tests:** `tests/unit/productoEquipo.test.js` (8); `productoMerma`, `productoRecord`, `productosSpanish`, `recordKitTools` unchanged and green.
## 2026-11-16 — The mail queue shows what the assistant sorted (lane correo-agente; not deployed)

- **`/crm/correo`:** a received mail that doco's correo agent sorted shows its bucket and line under the subject («Te necesita · $899.00 · vence 28 nov — Pagar el recibo de Telcel»), in the tenant's currency unless the mail said another. «Ordenado» chips (Te necesita, Dinero, Agenda, Papeles, Esperando, Seguridad, Leer luego, Ruido; only those with mail) filter the queue; `?cubeta=action` is where the morning brief lands. `bandeja(cubeta=…)` and `conteos.cubetas`; rows come only for mail from the worker's own permission-aware list. Mail sorted as Te necesita, Dinero, Agenda, Papeles or Esperando stays in the list instead of folding into «Avisos del sistema» (a bank's no-reply charge alert used to hide there).
- **Settings › Email › a mailbox:** «Sort with the assistant» switch (`EmailAgent.vue`, sites with doco).
- **Tests:** `crm/tests/test_correo_cubetas.py` (4), `tests/unit/correoTriaje.test.js` (5); lease walk through the live preview: lines and chips on desktop and phone, «Dinero» filters, the switch turns on. Rollback = revert with the doco half.
## 2026-11-16 — Ventas opens again from the desktop rail (lane ventas-rail; not deployed)

- **Fix:** the rail's Ventas tile links to `/ventas`, which redirected to Home; since «everyone lands on Hoy» (051a91d29, 11-15) that meant Hoy, which has no Ventas sidebar, so on a desktop Ventas did not open (the phone reaches its lists from «Más» and was fine). `/ventas` now opens the Inbox (the native Leads list without doco_marketing), as it did before 11-15 (`gateRoute`). «Configuración de ventas» opened from another module enters Ventas through `/ventas` too, and now finds its runtime.
- **Tests:** `tests/unit/routerVentas.test.js` (through the real router: `/ventas` → Inbox, `/` → Hoy; fails on the old router with «expected 'Hoy' to be 'Inbox'»), `crmCapabilities.test.js`.

## 2026-11-16 — Redes: Hoy shows the day's posts, the post diario del taller and a composer that says what's next (lane redes-diario; not deployed)

- **Hoy:** «Agenda de hoy» lists today's posts (calendar «Redes», read from doco_marketing) with their state; a tap opens the post in Redes with the way back to Hoy (`useHoy.eventLink`). Continuar shows a «Redes» card (posts I review, posts waiting for approval, today's posts). A Pendiente on a post opens it in Redes (`usePendientes.referenceTarget`).
- **Redes on the phone:** `/social` is no longer desk-only (D3 list updated); on a phone the calendar is the list. A «Te toca» strip lists the posts in my Pendientes; `?post=SP-…` opens a post (Hoy, Pendientes, the Agenda, notices).
- **Composer:** one «Siguiente:» line per saved post (fotos → texto → aprobar / publicar a mano, `composables/socialDaily.js`); who has it and «Pedir revisión» (`ReviewPanel`); «Fotos del taller» to pick before and after and approve them in place (`TallerPhotosPanel`); «Música»: a Reel with a song the shop has rights to, or «La publico a mano con música de la app» (`MusicPanel`); «Publicar a mano»: download, copy the text, paste the link, «Ya lo publiqué» (`ManualPublishPanel`). Someone who cannot approve gets «Guardar y enviar a aprobar» instead of Programar/Publicar ahora.
- **Post diario del taller (managers):** «🔧 Post diario» in Redes: switch, hours, who reviews, «Sale sola al aprobarla» or «La publican a mano», «Dar acceso y guardar» for people without Redes, «Preparar el de hoy» (`TallerDailySheet`).
- **Tests:** `tests/unit/socialDaily.test.js`, `hoy.test.js` (Redes event link), `ventasNav.test.js` (Social off the desk-only list).

## 2026-11-16 — Hojas: edits travel live, the others' changes replay in place, presence (lane hoja-juntos; not deployed)

- **Saves:** the editor (`hojas/univer.js`) collects the workbook's own mutations as the person types (not the cell editor's document, not the formula engine's local write-backs) and `Hoja.vue` saves them with `guardar_cambios` on the revision it has; the whole-sheet save stays as the fallback.
- **Live:** a `doco_hoja` event one revision ahead with mutations is replayed in place (`applyRemote`), then recalculated; the person's unsent edits go again on top, so a cell both touched keeps theirs, as on the server. A gap, a change too big to travel or a row or column moved under an edit reloads as before (`hoja.js` `liveStep`, `moves.js`).
- **Presence:** «Ana · Ventas!B4» chips above the sheet for 60 s after each move, and «Muelle cambió Gastos!B3: Subieron los sueldos» for 12 s after a change by Muelle.
- **Tests:** `tests/unit/hojas.test.js` (liveStep, presence rows, Muelle's note). Two-browser proof on a lease in `.scratch/proof/`. Rollback = revert with the doco half.
## 2026-11-16 — More buttons that load another app from a sheet now work on a phone (lane sheet-navega-resto; not deployed)

- **Bug:** the same one as «Verificar y acomodar» (lane bolt-sheet-navega): a tap that closes a sheet and loads another app's page in this tab had that load aborted (`net::ERR_ABORTED`) when the sheet's back over its history entry landed. Only real taps on a phone hit it. Found by an audit of every page load in the shell: Producto ⚡ «Ver en Escáner»; Inmobiliaria's ⚡ actions that link outside /crm, «Abrir en escritorio» in Herramientas and an action whose answer opens another app's page; Cuenta «Pagar» from an invoice's sheet while its checkout is in progress; Gastos de empleado «Siguiente» from the decision sheet when the way back is another app.
- **Fix:** one helper, `composables/leavePage.js` `leaveTo(href)`: it waits for the sheet's back (`sheetHistory.settle`), then loads the page, and loads at once when no sheet is closing. `AccionesMenu` uses it too. Checked and unaffected: «⋯» tools (router or a new tab), the avisos panel (no history entry), Cobranza's payment sheet (frappe-ui sheet, no history entry), list ⚡ menus, the command palette (already waits), and plain links inside a sheet.
- **Tests:** `tests/unit/leavePage.test.js` (2). Phone walk at 412 px on doco-mirror (IPN005329): before, «Ver en Escáner» aborted and stayed on the product; after, Escáner opens. Rollback = revert.
## 2026-11-16 — Fotos de lo que llega: «Tomar fotos» walks the products under the camera (lane fotos-llegada; not deployed)

- **Camera walk:** `openCamera({ photo: true, run: { items, onShot } })` keeps the camera open over a list of products: the product's name and «2 de 5» on top, one shutter press saves it and brings the next, «Saltar» moves on, «Repetir» goes back to the last one (`components/captura/photoRun.js`, `CameraSheet.vue`). `useProductPhotos.shootProducts` sends each photo behind the shutter as the principal; a retake replaces it (`replaceProductPhoto`, also used by «Guardar cambios» of an edit).
- **Productos «Llegaron sin foto»:** a new list with the line «Llegó hoy · XMovil» under each product, the camera on each empty photo, «Tomar fotos (N)» for the whole list, and `?fotos=1` (the assistant's link) starts the walk. The owner turns «Pedir fotos de lo que llega» on there and picks who is asked.
- **Recepción:** each line shows its product's photo; a line without one is the camera. **Compra:** after a receipt is confirmed, «N artículos llegaron sin foto · Tomar fotos» walks exactly those (while the shop asks for them).
- **Tests:** `photoRun.test.js` (5), `shootProducts.test.js` (4), `fotosLlegada.test.js` (3); es.po strings under the «Fotos» context. Server side in doco and scanner_kit (lane fotos-llegada). Rollback = revert.
## 2026-11-16 — Equipo › Metas: goals, score, inbox and deal measures (lane metas; not deployed)

- **Page:** Equipo › Metas (`/equipo/metas`, `pages/EquipoMetas.vue`).
  - Period switcher.
  - Team goals with bars.
  - Each person with a score chip (green / amber / red); tapping them shows a bar, «80 % de 90 % · faltan 10 puntos» and what was judged, per goal.
  - The owner's list of the period's goals to edit.
  - «Agregar meta» (`components/metas/GoalSheet.vue`: measure grouped by area, target with its unit and direction, period, each person or the team, puestos or people, weight, active).
  - «Metas sugeridas» (`SuggestedSheet.vue`).
  - The Equipo header has a «Metas» button; Hoy's «Mis metas» card uses the target icon.
- **Measures (`crm/metas.py`, hook `doco_metas_indicadores`):**
  - from the inbox report (`crm.inbox.report.measure`, which is performance() without the manager check): first reply in time, average first reply, conversations closed in time, customer rating, replies sent;
  - deals won (how many, how much, by owner and closed_date);
  - new deals and new leads answered in time (response SLA);
  - leads turned into deals.
- **Bonos rules:** a source that counts pieces only (Metas cumplidas) hides the minimum amount, «How much they add up to» and the percentage pay.
- **Tests:** `tests/unit/metas.test.js` (6), `crm/tests/test_metas.py` (3). Rollback = revert.

## 2026-11-16 — Manual de la tienda: «Empezar con plantillas» grouped by category (lane manual-equipo; not deployed)

- **Sheet:** the starter cards come in groups: Empieza aquí, Mostrador, Caja, Taller, Orden y limpieza, Guías de Muelle and more. «Elegir todas» / «Quitar todas» picks or drops a whole group. A line says the goals are examples and that a photo of the shop's own counter works best (`components/manual/TemplatesSheet.vue`). The cards themselves come from doco (lane manual-equipo).
- **Tests:** `tests/unit/manualTemplates.test.js` (3). Rollback = revert.

## 2026-11-16 — The ⚡ sheet opens Escáner and other apps on a phone (lane bolt-sheet-navega; not deployed)

- **Bug:** on a phone, «Verificar y acomodar» in a supplier bill's ⚡ sheet did nothing. The step started loading Escáner, then the sheet closed and stepped back over its history entry, and that late back cancelled the load. The same hit every ⚡ step that loads another page in the tab: «Abrir orden de reparación» on a Garantía, a Solicitud de compra's Desk step, a Producto step with a link, an Encuesta step.
- **Fix:** a ⚡ step can carry `href` (`documentos/acciones.js recordActionsFor`); `AccionesMenu` closes the sheet, waits for its back to land (`sheetHistory.settle`, as the command palette does), then loads the page. Pages pass `href` instead of a `run` that assigns the location (GastoFactura, CompraSolicitud, Encuesta, Producto, Garantía). Steps that stay in /crm or open a new tab still run inside the tap.
- **Tests:** `tests/unit/accionesMenuLeave.test.js` (3). Phone walk at 412 px on doco-mirror (ACC-PINV-2026-00033): before, the tap stayed on the bill; after, Escáner's receiving opens. Rollback = revert.
## 2026-11-16 — Bancos: «¿Cuadra con el banco?» says why the books and the bank differ (lane cuadre; not deployed)

- **Why:** Marco, on doco's accounts: «my accs are a mess and have diffs, we need the tooling and intelligence to fix this issue». Bancos showed the book balance and the bank's own figure side by side; why they differed took a developer with console kits.
- **Card and hero:** each bank or card with a figure from the bank reads «Cuadra con el banco» or «No cuadra por $X» (`cuentas` and `cuenta` carry `diferencia`; a card's bank figure now reads as what is owed). The hero's row opens the sheet; `?cuadre=1` opens it from a link.
- **The sheet (`components/bancos/CuadreSheet.vue`, `cuadre.js`):** the two balances, the difference and its reasons, in the order they get fixed: movements already on both sides, not linked yet (they cancel out); bank movements the books do not have («Ver movimientos», «Que me ayude el asistente»); connection movements that never became bank movements; book entries the bank does not show («Ver registros» → books view, new «Sin banco» filter); the history before the bank's movements start in Muelle (bank and book balance on that day); what is left unexplained. Empty months between the first movement and today are named («¿falta subir esos estados de cuenta?»). Without a bank connection the person types what the bank says; it is not saved.
- **Ligar (`crm.api.bancos_cuadre.ligar`):** «Revisar y ligar» lists the pairs; one tap links every pair the site's engine still proposes (Contador's audited service where it owns reconciliation, ERPNext's tool elsewhere), each with a stable request id; a refusal stays on its row in words. Sales and purchases paid straight into the account pair up but cannot be linked yet (both engines link only payments and journal entries; plan lane 2).
- **Arithmetic (`crm/bancos_cuadre.py`, pure):** the difference splits exactly into those lines; the cuadre starts at the last unbroken run of bank movements (a whole empty month breaks it). Plan for the rest of the program: `docs/DINERO_EN_ORDEN.md`.
- **Tests:** `crm/tests/test_bancos_cuadre.py` (17 bench-free, 8 on a full-retail site, the link on Contador's path included), `tests/unit/bancosCuadre.test.js` (11). Shots at 412 px light, 305 px dark and 1280 px. Rollback = revert with the doco half.
## 2026-11-16 — Ajustes › Asistente: the default model and the money path (lane asistente-dinero; not deployed)

- **New page** (`components/Settings/AssistantSettings.vue`, Settings › System Configuration › Assistant, «Asistente» in Spanish; System Managers on sites with doco; loaded when opened): default model and effort, «Ruta de dinero» (money path), money model and money effort from doco's Books Assistant Settings. Blank values show what actually runs (Opus 5.5 at high for money). The page shows only these fields; the doctype's tokens and keys stay in Desk. A save sends only the changed fields. English source strings, es-MX in `crm/locale/es.po`. A desk surface like its sibling settings pages (Shell D3).
- **Proof:** lease walk through the live preview (English, the save read back, Spanish shell); the new es-MX strings show once the image compiles es.po.
- **Why:** Marco 11-16: mail reading on Haiku, money always on Opus at high effort, set next to the default model. The doco half routes the turns (same lane). Rollback = revert.
## 2026-11-16 — Personalizar: the grip drags on a phone (lane arrastre-acomodar; not deployed)

- **Grip:** a finger on a row's grip (⠿) in Personalizar, Barra por puesto and a module's sections now drags as soon as it moves. It used to need a 0.4 s hold first, and a finger that moved at once was taken as a scroll, so the drag never started. The rest of the row still needs the hold, so a swipe there scrolls the sheet (`composables/useReorder.js`).
- **Long lists:** a row held near the top or bottom of the sheet scrolls the sheet and rides along. Before, the scroll ran on the wrong box (the list's wrapper, not the sheet's body) and only while the finger moved. A row held against the end of the list now lands last; before, it landed second to last.
- **Tests:** `tests/unit/useReorder.test.js` (8). Touch walks on the real sheet at 412 px (dark) and 305 px (light) against doco-mirror. Rollback = revert.
## 2026-11-16 — The assistant thinks out loud: made-up words while it works, the real steps on a tap (lane asistente-pensando; not deployed)

- **While it works:** the thinking line (`components/assistant/AssistantWork.vue`, `live`) replaces «Buscando…»: Muelle's ✦ turns through star glyphs, a made-up word changes every 3 s («Muelleando…», «Atando cabos…», «Ajolotando…»; English for an English-speaking person, from `window.lang`), with the seconds so far and the step count. doco's own progress line («Recibido (CAP-…)…») stays under it. Reduced motion keeps the ✦ still.
- **On a tap:** the steps the turn really ran, from doco's safe activity events (`doco_assistant_activity`, backfilled from `shell_api.activity` on open): «Leo tu pregunta», «Pienso el siguiente paso», each tool with its plain words («Busco en el sistema») and its name (`query_records`), «Escribo la respuesta», each with its time. The model's reasoning, a tool's arguments and its results never reach the browser (doco keeps them out).
- **Over the answer:** «Trabajó 4.1 s en 4 pasos» heads each turn's first answer; it unfolds to the same steps plus the turn's model calls and tokens (`doco_assistant_usage`, or the history row's `usage` after a reload). Steps watched while it ran fold when the answer lands, so the answer reads first (the walk at 412 px showed an open list pushing the answer below the fold).
- **Code:** `assistantActivity.js` (store, `stepsOf`, the phrase lists), `useAssistant.js` (socket, backfill, reset), `assistantText.normalizeRow` keeps `turnId` and `usage`, 16 es.po entries. A step the socket loses (a reconnect as the question goes out lost the first one on the lab walk) comes back from the snapshot, once per turn. **Tests:** `tests/unit/assistantActivity.test.js` (11). Needs doco's half (same lane) for the step words and the harness engine's steps; without it the line still thinks and the built-in engine's steps still show. Rollback = revert.
## 2026-11-15 — Citas: one list of setup problems with their fix, rest days in the sheet (lane shell-f15b-citas, Shell F15b; not deployed)

- **One renderer:** `components/agenda/CitasSetupProblems.vue` is the list the new-cita form, the settings sheet and now a reschedule show: each problem with its fix button when this person may fix it (in the sheet, every section), otherwise who can, with «Pedir configuración». A reschedule that hits a setup problem used to print the messages as one line; its fix now opens the settings at that section (`AgendaCitaPanel` → `AgendaEventPanel` `cita-settings` → `Agenda.vue`).
- **Rest days:** a site without a list of rest days no longer goes to `/app/holiday-list/new`: «¿Qué días cierras?» chips and «Guardar días de descanso» (doco `citas.api.rest_days_save`, same lane) make the list and pick it; «Abrir en Desk» stays as a secondary link from 1024 px.
- **Who can fix it:** one name «Ana puede configurarlo.», several «Ana y Beto pueden configurarlo.» (`Intl.ListFormat` in the person's language, msgctxt «several»), none «Un administrador puede configurarlo.»
- **Tests:** `tests/unit/citasSetupProblems.test.js` (5). Rollback = revert with the doco half.
## 2026-11-15 — The deal and the Taller order name their projects (lane shell-f14-proyectos, Shell F14c; not deployed)

- **Deal overview:** a «Pendientes» block (`RecordPendientes` on the CRM Deal) and `components/proyectos/RecordProyectos.vue`: each project that holds a pendiente on the deal («Motor Tsuru · 4 de 9 hechos»), opening its plan with `return_to` back to the deal; «Crear un proyecto para esto» opens the project sheet named after the deal, then the first pendiente on the deal. Both load after the overview paints (`defineAsyncComponent`).
- **Every record's pendientes** (`RecordPendientes`: Contacto, Garantía, Producto, the deal) name the project of a row.
- **Taller's handoff:** `/crm/proyectos?nuevo=1&ref_type=…&ref_name=…&return_to=…` opens the new-project sheet named after the record; once saved, the plan opens the first pendiente on that record (`utils/proyectoHandoff.js`), and the plan's way back goes to the shell route or, for Taller, a plain link.
- **Tests:** `tests/unit/recordProyectos.test.js` (9). Doco `proyectos.api.de_registro` is the endpoint (same lane). Rollback = revert.
## 2026-11-15 — Everyone lands on Hoy (lane shell-f17-hoy, Shell F17 / SPEC Q1; not deployed)

- `/` (and `/ventas`, which redirects there) opens Hoy for every worker, with or without doco_marketing. It used to open the Inbox (with the add-on) or the native Leads list. The Inbox stays in the bar for sellers.
- Hoy loses its desktop «Actualizar» button: the page already follows its records live (`useLiveWatch`) and pulls to refresh on a phone.
- `utils/crmCapabilities.gateRoute`; tests `crmCapabilities.test.js`; the wiki's landing note. Rollback = revert.
## 2026-11-15 — Carga de trabajo keeps itself current; the form builder says «Campos» (lane shell-f15-pulido, Shell F15/F13; not deployed)

- **Carga de trabajo:** the «Actualizar» button and the «Actualizado HH:MM» stamp are gone; the numbers refresh quietly when a deal, lead or task is saved (`useLiveList`) and when you come back to the tab (`useReloadOnReturn`), at most every 5 s, never while a reassignment runs.
- **Form builder:** «Preguntas» → «Campos» and «Agregar una pregunta» → «Agregar un campo» through msgctxt «Form builder», so the Facebook lead form keeps «Preguntas».
- **Not in this lane:** moving Reportes and Embudo onto the shell's `FilterChips` pushed `/crm/deals` to 61 script files (budget 60) through rollup's small-chunk merge; it waits for a lane that frees deal-list files first.
- **Tests:** `formBuilderWords.test.js`; the workload tests stub the live list. Rollback = revert.

## 2026-11-14 — «En los teléfonos»: Android steps as DAVx⁵ shows them (lane telefonos-basic; not deployed)

- **What:** the Android steps after «Agregar teléfono» follow DAVx⁵ 4.5 as set up on the first shop phone (Galaxy A35, 11-14): «Registrar», the shop's name as the account name, «Finalizar», then switch the address book on and «Sincronizar ahora» (DAVx⁵ leaves it off), and accept removing battery saving (Samsung had DAVx⁵ in deep sleep). Copy only.
## 2026-11-15 — Links into Taller Intake carry `return_to` (lane shell-f4-vendor; not deployed)

- **What:** «Recibir equipo» from a trato (`tallerIntakeHref`, `utils/repairOrders.js`) and from a cita (`receiveUrl`, `composables/useCitas.js`) now build the link with the shell's `withReturn`, so Taller gets `return_to` instead of the legacy `return`. Taller's Intake reads it from the same lane (taller `crmReturnFrom`), so both halves ride the same roll; the way back to the trato or the agenda is unchanged for the worker.
- **Tests:** `repairOrders.test.js`, `dealModalRepairIntake.test.js`, `citas.test.js`, `repairOrdersSection.test.js`, `itemWorkspace.test.js` read `return_to` and check that no `return` is sent. Rollback = revert with the taller half.

## 2026-11-15 — Contactos: «Importar del teléfono» (lane contactos-importar; not deployed)

- **What:** `/crm/contactos/importar/telefono`, from Contactos («Importar del teléfono», owner or encargado) and from «Importar clientes» («¿Los tienes guardados en un celular?»). How to export by phone (Android, iPhone, Google), choose the .vcf, then the review: how many came, are new, are already in Contactos or have no number; search; «Marcar todos como» Cliente / Otro / No; a choice per row (native select, dims «No agregar»); «Agregar N» in batches of 100 with progress; the result with the rows that failed and why.
- **Backend:** doco `doco.contactos.api.import_preview` / `import_contacts` (same lane). Words and batching in `utils/contactosImportar.js`, tested in `tests/unit/contactosImportar.test.js`. Shots: 305/412/1280, light and dark (lane `.scratch/proof`).

## 2026-11-14 — «Contactos en los teléfonos» screen (lane contactos-telefonos; not deployed)

- **What:** `/crm/contactos/telefonos`, opened from Contactos' menu («En los teléfonos», owner or encargado only). One switch, which contacts go (each kind with how many have a phone), what to add to the name with a live «Así se ve al llamar», the phones with when each last synced, «Agregar teléfono» (name, iPhone / Android / Otro) with the QR code, the DAVx⁵ links or the CardDAV data shown once, «Volver a generar» and «Quitar» (two taps in place). A worker without the role reads whether it is on and whom to ask.
- **Backend:** doco `doco.contactos.telefonos.api` (same lane). `telefonosApi` in `composables/useContactos.js`; words in `utils/contactosTelefonos.js`, tested in `tests/unit/contactosTelefonos.test.js`.

## 2026-11-14 — «Pagar lo que falta» on Prenómina (lane pagar-la-semana-spa; not deployed)

Wave 2 «Pago a tu equipo», lane 8 (crm half). Frontend over doco.nomina's `pagar_preview` / `pagar_apply` (doco lane pagar-la-semana; land them together with `land --train`).

- **Button.** «Pagar lo que falta · $X · N personas», docked at the bottom on a phone, only when the preview answers `on`, `calcular` is on and doco suggests at least one line. Each person with a suggested line also gets «Pagar» on their row (phone card and desktop table) that opens the sheet for that person alone.
- **Sheet.** Per person the suggested amount (editable), «Le falta» and what already waits at the register, the concepto (the setup's concepts), and origin chips in the setup's order: «Dejar para la caja», «Caja fuerte», «Lo pongo yo», «Transferencia» (a bank picker when the company has more than one bank account). A greyed origin says doco's reason on tap instead of being picked. «Repartir» adds a second line for the same person from another origin; a person can be left out with the checkbox.
- **Review, then pay.** The review lists every line, the total, the amount per origin and anyone paid past what is missing. «Pagar $X» sends the lines with the preview's `token` and one `request_id` kept across a retry after a lost answer (doco replays the first receipt). The receipt lists what was booked as paid and what was left for the register. A stale answer writes nothing: the sheet shows «Algo cambió…», loads the fresh preview into the lines and the page keeps its button.
- **Dark.** A company without a saved pay setup, a site without doco.nomina, a refusal (someone who may not pay) or a shop that only notes never shows the button; without a saved setup the preview is not even asked (asserted in `tests/unit/equipoPagar.test.js`). Helpers in `useEquipo.js`; the sheet loads on first open.

## 2026-11-14 — Aguinaldo card and sheet on Prenómina (lane aguinaldo-tarjeta; not deployed)

Wave 2 «Pago a tu equipo», lane 9 (crm half). Frontend over doco.nomina's `aguinaldo_preview` (landed) and `aguinaldo_apply` (doco lane aguinaldo-pagar, in parallel).

- **Card, 15 Nov to 20 Dec only.** On Prenómina, under the pay-setup door. A Mexican company with the aguinaldo switch off shows the owner «¿Quieres que Muelle calcule el aguinaldo?», one tap to /crm/equipo/como-pago. With it on: «Aguinaldo 2026», the total for N people, the deadline, and how many people are missing a piece of data.
- **Sheet.** Per person: ingreso (and baja), días trabajados, días de aguinaldo, salario diario (marked «sugerido» for a commission average), importe or «—», the server's `porque` lines and its faltantes in es-MX (`sin_ingreso`, `sin_sueldo`, `sin_promedio`, `sin_baja`, `sin_isr`). Totals (importe, people with an amount; ISR and neto only with `retenciones`) and doco's warnings.
- **«Dejar listo para pagar».** Owner only (`ajustes_get.can_edit`) and only when the preview says `pago.available`; otherwise the sheet shows the preview and doco's `pago.message`. It sends `company`, `year`, `token` (when the preview carries one) and one `request_id` kept across a retry, then shows a receipt (doco's `message`, else the rows it wrote: `filas`, `total`) and reloads the preview. A stale answer (`applied: false` / `stale`) writes nothing: the sheet shows doco's message as a notice, loads the fresh `preview` it sends and keeps the button. The button also waits for no `blockers` (shown in the sheet, e.g. `sin_caja`) and someone left to leave at the register (`totales.por_dejar`).
- **Paid and still due.** When doco sends `pagado` / `por_entregar` / `falta`, the card says «Te falta pagar $X a N personas» (or what is waiting at the register), and each row and the totals show Le toca · Ya se le dio · Por entregar · Le falta; without them it shows the gross amount. Land with doco aguinaldo-pagar (`land --train`): its apply requires the preview's `token`.
- **Dark.** Outside the season nothing is asked; a site without doco.nomina, a refusal, or a company outside Mexico renders Prenómina unchanged (asserted in `tests/unit/equipoAguinaldo.test.js`). Helpers in `useEquipo.js`; the sheet loads on first open.

## 2026-11-14 — Prenómina shows «Ya se le dio» and «Le toca / Le falta» (lane prenomina-ya-se-le-dio; not deployed)

Wave 2 «Pago a tu equipo», lane 7. Frontend over the `pagado` and `pagos[]` doco's `prenomina.get_period` carries for a company with a pay setup (doco lane prenomina-pagado), and over `le_toca` / `le_falta` / `porque` when the setup calculates (doco lane le-toca; rendered only when present).

- **Per person.** A «Ya se le dio» column with each payment under it (day, amount, origin; the owner's own money reads «Lo pusiste tú»); with «Le toca» present, «Le toca» with its reasons and «Le falta» («Nada» at zero, «Se le dio $X de más» over). On a phone each person is a row with the money first instead of the table; the faltantes column reads «Por revisar» beside the money columns.
- **Totals and «Pagos de la semana».** The period's «Le toca», «Ya se le dio» (with the count of payments) and «Le falta» above the people, and one list of the period's payments (person, concepto, origen, monto, fecha); titled by period (semana, quincena, mes). An empty list says payments count from the pay setup on.
- **The read-only line goes** («Nothing here changes payroll») when `pagado` is present. A payload without it renders the page as before: same subtitle, columns, width (asserted in `tests/unit/equipoPrenominaPagado.test.js`).
- `data-testid` anchors for the guide tool (GT-3): `prenomina-tabla`, `prenomina-fila`, `prenomina-personas`/`prenomina-persona`, `prenomina-col-*`, `prenomina-pagado`, `prenomina-le-toca`, `prenomina-le-falta`, `prenomina-totales`, `prenomina-total-*`, `prenomina-pagos`, `prenomina-pago`. No pay entry here (lane 8).

## 2026-11-13 — «¿Cómo pagas a tu equipo?» in the shell (lane nomina-ajustes-spa; not deployed)

Wave 2 «Pago a tu equipo», lane 3. Frontend over doco.nomina's `ajustes_get` / `ajustes_preview` / `ajustes_apply` (doco lane nomina-ajustes).

- **/crm/equipo/como-pago.** The one-time setup: three cards («Solo anoto lo que pago», «Muelle me dice cuánto le toca», «Muelle lleva todo») that only set switches, then «¿Cada cuándo pagas?» and «¿Qué día?» (weekly only), «¿De dónde sale el dinero?», «¿Quién lo entrega?» and the cashier privacy switch where the shop has a register, and «¿Cómo les pagas casi siempre?» only while Muelle calculates. Folds: «Más detalles del cálculo», «Lo que pide la ley» (only for a Mexican company; «Lleva todo» ticks each piece the site allows, for review), «Para tu equipo», «Cuentas (contador)» (read-only). «Guardar» sits in the thumb's reach with the reason it waits beside it; doco's preview says what changes before the tap and the receipt says what changed. Taps from Prenómina: «Solo anoto» 5, «Lleva todo» 6. No salary per person here.
- **Prenómina's first-run card.** «¿Cómo pagas a tu equipo?» shows to the owner before the first save, and a quiet link after it. Dark by default: where doco has no setup, refuses, or the viewer cannot save, Prenómina is unchanged.

## 2026-11-13 — A document's questions are full cards in the assistant (lane asi-tarjeta-articulo, with doco; not deployed)

Marco: «for some most used actions we need special UI, like for crear items, so a full component with the data, picture, etc». The questions doco asks about a captured document (which article a line is, which warehouse, which supplier) were prose with pill buttons in «Pregúntale a Muelle».

- **`DecisionCard.vue`, by type** (`decisionCards.js`: `cap_item`, `cap_warehouse`, `cap_supplier`). The line as the paper prints it, qty × price, its IMEIs and «Pregunta 2 de 12». The matches are rows with their photo, stock and last purchase price, each with «Vincular»; «Buscar otro artículo» searches the catalog instead of typing a code. «Crear artículo» shows the article it makes (name, group, unit, IMEI tracking, the next code or the variant plan, what the web said about the line), and all of it is editable first. A photo picked in its slot becomes the new article's picture. «Omitir» and «Decidir en lote (N)» close the card. Once answered, the card is one line («Vinculé …», «Creé … — Abrir») and the next one is already open. It lays out by its own width (container queries): 305 px phones, the desktop dock, full screen; light and dark.
- **Answers apply inline** through doco's `shell_api.decision_apply` (`useAssistant.answerCard`): the same resolvers and gates as a tap, and a refusal shows on the card itself. The card closes on the tap; doco's edit of the message follows.
- **History keeps the card doco rebuilt.** `normalizeRow` carries `card`, and a history row's card replaces the live one (an expired question comes back as its text, without a card).
- Tests: `tests/unit/decisionCards.test.js`. Evidence: `asistente-program/evidence/S41c/`.

## 2026-11-13 — Tratos, Prospectos and the deal record read alike (lane ventas-parejo; not deployed)

Marco: «deals, leads and prospects all have really different ui… tighter ui so it's kinda similar». Frontend only.

- **Prospectos is the one leads list, at every width.** Desktop has the shell's list look (Compras): the title with its count, «Nuevo prospecto» filled, «Registrar consulta» tonal, the kinds as a tab row beside the search, sources as chips, and a table with one header (Nombre, Origen, Estado, Puntaje where the shop scores leads, Seguimiento, Esperando). Under 760 px of list it shows rows. A lead opens the prospect record on a desk too, not the stock lead page. Several selected leads convert one reviewed form after another. A refused form stays open with its reason. A failed read keeps the rows and «Reintentar» asks the same thing again. A lead's name is never its id, and its phone is written once, in one shape. «Otro» no longer shows for a lead with no source. An inquiry reads the Consultas words («Nueva», «En seguimiento»), and Consultas' back arrow returns to Prospectos. «⋯ › Vista clásica» keeps the stock leads list's stage filters, board, Excel and delete.
- **«Lista de leads» is retired.** /leads, its legacy kanban and list links and Score rules' back button open Prospectos (a search carries over). It is gone from Ventas › Más, and a lead's pages light Prospectos. LeadsView.vue and its Fab are deleted.
- **Tratos on the same look.** The phone shows the shell's large title, the search panel and ListRow rows (stage dot and name, the equipo or phone, the amount, the next step or the age), with «⋯» beside the pill for the layouts, Vista clásica and Excel. On a desk: the title with its count and what the queue holds; Lista/Tablero/Embudo; one island (Columnas, Excel, ⋯) and «Nuevo trato»; the follow-up queues as a tab row with their counts beside the search; the filters as one row of pills with the active ones after them. The table's chosen columns fit the list's own width (`utils/fitColumns.js`), and the header says how many stepped aside («+3», with their names). It never scrolls sideways. The selection's actions sit under the list.
- **Tratos bugs.** Stage colours show again on chips, board columns, group headers and filters (the statuses store holds an ink class, not a hex). A phone reopens the list where it was. A `?layout=board` link stays on the board when the worker has a default view. «Limpiar» clears the pipeline too. The filter popovers say «Listo» (each tick filters at once). The desk no longer names a deal «CRM-DEAL-…» or «—». Empty cells stay empty. Days read «jue 15 de oct», never the browser's «11/13/2026». The empty next step reads one way, and an undated one says «Pendiente sin fecha». The lost-reason dialog is «Motivo de pérdida». The funnel's footnote has its Spanish.
- **The deal record (Deal 360, and the Bandeja header it shares).** The name owns the header, never the id, not even while it loads, and avatars are grey initials. The tools (Etiquetas, Posponer, Cadencia, Bitácora) share one island, and the way to reach the person (Llamar, Enviar mensaje) has its own island. «Resolver» is the shell's filled button. Tabs underline in the shell's accent. «Datos y contacto» is a tonal button. In the context pane, money and days are es-MX and «Mensaje» opens the conversation tab. Resumen never shows an owner's e-mail, and repair states read in Spanish.
- **«Llamar» without a phone integration dials through the device** (it did nothing). A shop with Twilio or Exotel never dials around its line: until the line is ready the worker is told to try again.
- `docs/DEALS_LIST_UNIFICATION.md`: the 2026-09-28 plan to move /deals onto the stock list is superseded for the frontend; its backend half stays.

## 2026-11-13 — Twilio noise, an expired session, HEIC photos, a clean build and this changelog (lane arreglos-tenant, with doco; not deployed)

- **Twilio (SHIP-18 B, F-26):** a dialled leg's bare HTTP 400 on the live-status push goes to the `crm.twilio` log file (INFO lines kept) instead of the Error Log; a call log save that lost a race (MariaDB 1020, a deadlock, a timestamp mismatch) rolls back, asks Twilio for the call again, reads the log again and saves once more, never moving a finished call back to an earlier status. Only a second failure is logged.
- **Expired session (PROD-4-a):** after a refusal the shell asks `frappe.auth.get_logged_user` by GET (5 s at most); Guest gets «Tu sesión terminó» with «Iniciar sesión» back to the same /crm route on every route, never «Pedir acceso», and the saved boot stays; a boot that works again (a sign-in in another tab) clears it.
- **HEIC (PROD-9-a):** a HEIC picked as a file in the capture sheet goes up as a JPEG when the browser can read it; doco refuses any other HEIC at the door with how to send it. The crm file inputs already ask for `image/*`, which iOS hands over as JPEG; `.heic` also left `captureProblem`'s fallback list.
- **Build (PROD-12-a):** `frontend/auto-imports.d.ts` is untracked and ignored like `components.d.ts`; builds no longer leave mainline dirty.
- **Changelog (F-33):** this file, seeded below from the commits past the roll-20261112 pin.

## Seeded 2026-11-13 from `git log b674c075d..46155231c` (crm on prod since roll-20261112 is b674c075d)

These 36 commits ride roll-20261113 (sources frozen 2026-11-13 05:18 MST at crm 46155231c). They are not on prod until that roll's receipt says so. Lanes come from the devflow log (land and lane done lines); newest lane first.

### cuenta-respaldos (landed 2026-11-13)

- `46155231c` feat(cuenta): «Respaldos» from Resumen's «Último respaldo» row (capability backups): each copy's day and size, the newest, the next one and the copy kept off site; «Descargar» (the account owner only, doco's account_owner; «Mi Plan» reads why) asks for the password, then gives Boat's 5-minute link, «hasta la 1:05» at one o'clock; a late copy reads «Tu respaldo más reciente es de hace N días; ya lo estamos revisando» with no download and «Pedir mis datos» instead; the row shows Boat's newest uploaded copy, the one the sheet lists; hidden without the capability

### storefront-address (landed 2026-11-13)

- `0ff42b75e` feat(cuenta): Tienda › «Tu tienda en línea» — the store's address with Boat's word on it (Funcionando, Conectando…, No abre, Sin dirección), «Elegir dirección» checks a name live (the zone right after it, as one address) and connects it, a connecting address is read again by itself until it works or Boat switches the choice off, and «Enciende tu tienda» lists the store's steps with their fixes (the store's name saved in its step) and turns it on; ?seccion=direccion opens the block (capability storefront_address)

### stamp-packages (landed 2026-11-12)

- `af4aa9a30` feat(cuenta): Tienda › CFDI shows the stamp package and «87 de 150 timbres este mes»; «Cambiar paquete» (and turning CFDI on) opens Boat's packages with the price per stamp, its quote for the one chosen, the extra-stamp price and the rules, what goes back to the saldo, and «Confirmar» sends that package once through toggle_addon; the charge, a refusal or a lost call sit under the packages and rise into view after a tap or a confirm, and with nothing to confirm the button says «Elige otro paquete»; a turned-off CFDI resized says it turns back on with its consent, and the sheet opens on a scheduled package or nothing (capability stamp_packages)

### convo-warm (landed 2026-11-12)

- `40c5f18f4` perf(inbox): a deal's conversation is ready before the worker asks for it

### revisar-crm (landed 2026-11-12)

- `10ce4158c` fix(productos): the swipe hint sits on the side that stays on screen, «aplicar el seguro» for one, and the card keeps a desk height
- `ede296a71` feat(productos): «Cambios propuestos», the swipe deck of what Enriquecer proposes

### owner-email-change (landed 2026-11-12)

- `62162ac47` feat(perfil): «Correo» in Mi perfil changes the email you sign in with (only where doco offers it)

### entry-budget (landed 2026-11-12)

- `8b2ff812a` perf(startup): telemetry loads only when it is on, out of the entry chunk

### wallet-visible-return (landed 2026-11-12)

- `7c6c40177` feat(cuenta): the saldo shows at $0.00 with «¿Para qué sirve?», a refused top-up says Boat's reason first, and the way back from paying says «Recarga acreditada» (Boat wallet_return)

### storage-blocks (landed 2026-11-12)

- `128edcb2c` feat(cuenta): Tienda › «Almacenamiento» shows the space used of what is allowed and Boat's block and price, «Agregar 10 GB» then «Confirmar» buys it over Boat's quote, a reduction is scheduled for the period's end and space already bought can be lowered while nothing is sold; «Comprar más espacio» from Resumen's meter and «Salud de tu sistema» opens that sheet once, only where Boat can sell a block (else «Ver planes»; capability storage_blocks)

### convo-room (landed 2026-11-12)

- `f34ca4b12` feat(inbox): the conversation gets its room back — one bar over the thread, one button for replies

### surtido-vivo-crm (landed 2026-11-12)

- `55eddb115` fix(compras): a line the chat changed is marked amber, so its −/+ stay visible
- `563d41fbe` feat(compras): the buy plan page follows the chat live

### convo-speed (landed 2026-11-12)

- `705da13ca` fix(activities): the pending scroll to the latest message dies with the component
- `c08d0a3fa` test(equipo): the first Puede ver facturación test gets the time a cold import takes
- `62a13b5f3` perf(inbox): a deal's tabs open faster; the conversation's messages come first

### provenance-al-instalar (landed 2026-11-12)

- `9ec9decf6` fix(settings): CRM money follows the company's currency once setup picks it
- `32cd67d02` fix(whatsapp): message provenance fields exist on sites built after their patch

### surtido-plan-crm (landed 2026-11-12)

- `502a5d5bd` fix(compras): the buy plan opens from Surtido's ?plan= instead of a route of its own
- `bd1f0e7b1` fix(compras): the plan's bar fits a 305 px phone: «Crear orden», its icon from 360 px; the table follows its own box (container query at 54rem)
- `b2da66a2f` fix(compras): the plan's year sits apart from the model; a line without reasons shows none
- `f20f25b55` feat(compras): the assistant's buy plan opens whole at /compras/surtido/plan/:id

### embudo-origen-card (landed 2026-11-12)

- `717625b11` test(hoy): the first Primeros pasos test gets the time a cold import takes
- `2a7f4a020` feat(reports): «¿Qué publicaciones y anuncios traen clientes?» — prospects, deals, won and won value by the visit's source, campaign or medium tag (doco_marketing get_origin_funnel), with drills

### addon-cancel-keeps-cycle (landed 2026-11-12)

- `fbb7445e7` feat(cuenta): Tienda says «Se apaga el 30 nov» on an add-on turned off that still runs and offers «Reanudar» through Boat's resume_addon; a resume refused after its last day turns the sheet into its «Activar» under Boat's words; a trial's turn-off says it ends today (only with Boat's addon_keeps_cycle)

### inbox-shots (landed 2026-11-12)

- `b09070342` fix(inbox): opening a WhatsApp conversation no longer lifts the whole screen

### inbox-convo-room (landed 2026-11-12)

- `074dc2667` fix(inbox): the WhatsApp conversation keeps a reading width on desktop

### syncfy-docs-crm (landed 2026-11-12)

- `9e9a515f2` style(bancos): ruff format the SAT step test
- `7b0f46423` test(bancos): the SAT step's emc stand-in covers the package chain, so it runs where syncfy_connector is not installed (CI)
- `21e5d79b4` fix(bancos): «Enviar sus facturas a Contador» only where Contador downloads CFDIs and the SAT login brings them (not tax returns); Bancos conectados runs without Contador
- `94a77f539` feat(bancos): the SAT's opinión de cumplimiento and constancia from «Conectar» — Syncfy reports only a job for them (no login), so Bancos hands the job to syncfy_connector, which keeps the files, instead of closing with nothing

### activation-plan-choice (landed 2026-11-12)

- `bb3b06891` feat(cuenta): «Activar plan» offers the plans the site may buy and Mensual or Anual, asks Boat for the total on every move and pays it with «Pagar $X» (only with Boat's activation_choice; otherwise today's sheet)

### importer-in-spa (landed 2026-11-12)

- `60c024f29` ci(shell-apis): keep the roll-20261020 shell image; the roll-20261111 image cannot create test users (Frappe 16.53 passes wrapper to doco's auth-mail mixin)
- `75857eeff` fix(importar): an upload failure reads through errorText; the site-prefixed import claim keeps nx with a nosemgrep note
- `507797045` feat(importar): «Importar productos» and «Importar clientes» in the shell, over doco's importer

### documento-estrecho (landed 2026-11-12)

- `dc48c6937` fix(documentos): a record keeps its fields readable beside the list and the assistant
