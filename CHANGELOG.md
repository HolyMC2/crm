# crm Changelog

Newest first. Every lane adds its entry at the top (`CHANGELOG.md merge=union` in `.gitattributes`, so parallel lanes keep both entries; do not hand-resolve it). Say what changed for the worker or the operator, the commit, and whether it is deployed; link long evidence instead of pasting it.

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
