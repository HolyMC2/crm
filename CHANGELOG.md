# crm Changelog

Newest first. Every lane adds its entry at the top (`CHANGELOG.md merge=union` in `.gitattributes`, so parallel lanes keep both entries; do not hand-resolve it). Say what changed for the worker or the operator, the commit, and whether it is deployed; link long evidence instead of pasting it.


## 2026-11-21 — crm builds on Vite 8: each crm land and image bake spends less than half the CPU on the frontend build (lane crm-vite8; not deployed)

- **Why:** the crm production build ran on Vite 5, bound by Rollup on one JS thread. Every crm land (ci_local) and every image bake pays it.
- **Change:** vite 8.3.8 (Rolldown, Oxc, Lightning CSS), `@vitejs/plugin-vue` 6, `@vitejs/plugin-vue-jsx` 5, `vite-plugin-pwa` 2 with `workbox-build`/`workbox-window` 7.4 as direct dependencies (now its peers); `yarn.lock` changed only for those ranges, and vitest runs on the same Vite. Rolldown has no `experimentalMinChunkSize`, so `vite.config.js` splits with `codeSplitting`: a `$initial` group keeps what the entry loads statically in one chunk, and shared chunks under 8 KB of transformed source are copied into the chunks that import them (styles excluded; Rolldown keeps one instance of each copied module). The entry file is now a facade that starts the chunk holding `main.js`, so `version.json` names that chunk (`scripts/version-json.mjs`; the build fails when no chunk holds `main.js`), which is the file the silent update compares with what a tab runs. Tailwind blocklists `[-:T]`: the regex in `useArchivos.js` reads as an arbitrary property, and Lightning CSS rejects the declaration. The emoji table stays its own chunk as a dynamic import, without a manual group.
- **What a worker sees:** nothing on screen. A phone fetches fewer script files per daily route and a smaller first load (below).
- **Proved:** `vite build` in a node 24.13.0 container (3 CPUs, 4096 MiB heap as the bake), 5 alternating runs per side on the workstation: 68.0 s to 28.6 s (ranges 62.7–74.2 and 26.2–32.4), 108.4 to 48.2 CPU-s (102.4–117.6 and 44.3–53.3), every run green on all three verify scripts. Bundle budget against mainline, same container: entry 178.3 to 171.0 KB gzip; files per daily route hoy 32→23, pendientes 44→33, contactos 36→22, deals 60→39, prospectos 47→32, inbox 42→31, dashboard 47→32, documentos 37→28, facturas 41→31, nueva factura 27→21; script gzip per route −2.9 % to +1.0 %. Phone smoke on the perf copy of doco (cell-1): the prod image's own bundle against the same source built on Vite 8, each with its own gunicorn and nginx, 14 screens plus the Deal 360 «Conversación» tap: same result on every screen, no error only the Vite 8 side has, 13 of 14 screenshots pixel-identical (Bandeja differs by a relative time, 18h to 19h), `version.json` names a script the page ran on all 14. Evidence `muelle-releases/speed-ram-20261120/evidence/crm-vite8/`.
- **Costs:** all script across the app is +7 % gzip (3.93 to 4.20 MB), because the small shared modules are copied into each chunk that uses them; a worker who opens many screens downloads those copies again. Peak build memory is about the same (4.3 to 4.1 GiB at the 4096 MiB heap). The lab's `crm/frontend/node_modules`, which lanes link for tests, moves to Vite 8 on the first lab build after this lands (the bench build's frozen install; the in-place upgrade and the downgrade both install cleanly).
- **Tests:** `frontend/tests/unit/versionJson.test.js` (3; the facade and missing-`main.js` cases fail on the previous logic); the whole unit suite (489 files) passes on Vite 8. Rollback: revert.

## 2026-11-21 — «Autorizaciones del encargado» per register; «Resumen de ayer» only for those who see the money (lane limites-caja, with posawesome; not deployed)

- **Hub:** a switch an app reads and writes itself may carry `args` (a dict) to its `get` and `set`, so an app lists one switch per record. posawesome uses it for «Autorizaciones del encargado en <caja>», the register's guided identity. That switch is what lets a supervisor approve above a person's limit.
- **Resumen de ayer:** the morning notice goes to managers who have signed in at least once and see the business's money. Before, it also reached staff with Sales Manager whose money the owner hides, and accounts only integrations use.

## 2026-11-20 — «Resumen de ayer»: what yesterday left, each morning on the owner's phone (lane resumen-manana, with taller and posawesome; not deployed)

- **Why:** owners are often away from the counter and had nothing like a morning brief: yesterday's sales, who dropped follow-ups, the cash count, late repairs and what waits for their approval were each on a different screen.
- **Change:** `crm/morning.py` and `crm.api.morning`. At the owner's hour (an hourly job, `2 * * * *`, checks Hoy's settings; default 8:00 site time) each owner and manager (System Manager, Sales Manager) gets one Notification Log («Resumen de ayer: ventas $12,400 · 3 cosas por atender»), once a day and never when nothing was sold and nothing needs attention. It opens Hoy (`/crm/hoy?resumen=1`) on `MorningSheet.vue`, also on Hoy's Accesos card for owners: Resultados' «Ventas» for yesterday (only for those who see the money), follow-ups due by yesterday still open with the people who hold them, approvals waiting, and what other apps add through the new `muelle_morning_summary` hook (taller: overdue waits, ready and not picked up, delivered with a balance; posawesome: yesterday's cash differences per cashier, registers still open from before today). Each row opens its screen; the rows are read as the person who opens them. The owner turns it off or picks the hour (6–11) in the sheet, or in «Ajustes del negocio» (`FCRM Settings.hoy_settings`: `morning`, `morning_hour`).
- **Also:** the shift handover (landed earlier) and this summary count only dated work: Frappe reads a missing date as the earliest one, so undated pendientes showed as due; the handover also leaves out a record's owner mark and decisions asked of the person, as Pendientes does. Found on doco-mirror (11-21 00:0x): «Asignación para CRM Deal …» in «Tus pendientes sin terminar».
- **Proved:** doco-mirror (lab gen 3664): yesterday's rows were Ventas $0, 19 follow-ups not done (Brandon 12, Jennifer 3, no owner 2), 55 approvals waiting, 4 registers open from before today, 39 devices ready over 7 days, $38,020 delivered with a balance; the sales facts first read as raw objects, now in words.
- **Tests:** `crm/tests/test_morning.py` (7), `crm/tests/test_handover.py` (+1), `frontend/tests/unit/morningSheet.test.js` (4).
## 2026-11-21 — Phones open a deal, a Bandeja conversation and the Agenda with less to load (lane crm-carga-movil; not deployed)

- **Why:** on the perf copy of doco (phone profile: CPU 4x, 150 ms, 9/1.5 Mbps), a deal opened on a phone loaded the hidden conversation behind «Resumen», the Bandeja warmed «Datos y contacto» although a phone's tap opens the conversation, and the Agenda read one date range and then a wider one.
- **Change:** `DealWorkspace.vue` keeps only the tab a record settles on, decided by an effect before the render instead of a sync watch that saw the 'conversation' default on the way; desktop direct opens now mount the conversation with the idle warm-up, as intended. `utils/prefetch.js`: on a phone or a slow line, a deal page warms Activities in idle time after it paints, because it opens on «Resumen» with no conversation behind it and «Conversación» needs that code; a phone on the Bandeja warms Activities too (the thread its tap opens); a wide screen on a slow line keeps warming the deal panel the Bandeja shows; the entry's dynamic imports stay the same, since changing them regrouped the chunks (+0.8 KB entry gzip). `AgendaSchedule.vue` asks for more days only when its end comes into view; an end already in view as the list mounts (no rows yet, a short range, after the skeleton rows) asks for nothing. What a worker sees: on a phone the Agenda list opens with two weeks; it used to open with up to six because its end was in view before the rows arrived. «Ver más días» adds two weeks per tap, up to six.
- **Proved:** phone A/B on the perf stack, the prod crm commit against the same commit with this diff, each built with node 24.13 and served by its own nginx and gunicorn, 6 interleaved pairs per screen, 0 failed requests, HTTP/1.1 (evidence `muelle-releases/speed-ram-20261120/evidence/crm-carga-movil/`, the deal-page tap in `ab-r3/`). Deal 360 open: LCP 6.30 to 4.76 s (per pair -1.56 s, 6/6); the verifier's HTTP/2 A/B of the same change, closer to prod, gives -0.42 s [-0.14..-0.94]; 54 to 29-31 API calls, 132 to 85-90 scripts, 260-287 KB less script, the hidden pane 6/6 to 0/6. Deal 360 «Conversación» tap, after the idle warm-up: today 0.32 s to the composer (the pane was mounted behind «Resumen»); this lane without the deal-page warm-up 2.41 s (42 scripts, 261 KB fetched at the tap); with it 0.59 s (-1.83 s per pair, 6/6). Against today, open plus tap: LCP -1.59 s (6/6) and the tap +0.29 s [+0.20..+0.45] (6/6), because its messages are read at the tap. The warm-up does not move LCP (+0.07 s, lower in 3/6), downloads 256-283 KB after it and starts 3 small reads that today's open makes too (is_whatsapp_installed, get_channel, one getdoctype). Bandeja tap, after the idle warm-up: the conversation's composer shows 1.81 to 0.74 s after the tap (-1.05 s, 6/6), 175 KB less script at the tap; a tap before the warm-up (it starts 4 s after the first page mounts, in idle time) gets part of that. Its header shows 0.12 s later (DealHeader is not warmed), and the cold load downloads 104 KB more after LCP. Agenda: query_many 3 to 2 and pendientes queue reads 6 to 4 (the rest is the socket's first-connect resync, not changed here), LCP unchanged (-0.07 s). Bundle budget on mainline: entry 178.2 to 178.3 KB gzip, daily routes unchanged; the deal-page warm-up keeps the entry at 176.9 KB and every chunk name on the prod-commit builds.
- **Costs:** on a phone the first «Datos y contacto» in the Bandeja now loads its panel at the tap (not measured; CS-6 put that code at about 207 KB in 37 files).
- **Tests:** `convoSpeed.test.js` (+2), `prefetch.test.js` (phone Inbox, wide slow line, deal page on a phone and on a slow line), `agendaPage.test.js` (+1); each new case fails without its change. Rollback: revert.

## 2026-11-20 — «Datos por persona» under the goals in Equipo › Metas (lane acompanar, with doco, taller and posawesome; not deployed)

- **Change:** `components/metas/PorPersona.vue` (loaded with the page's goals, its own read) shows each person's figure for the chosen facts in the period: a table at a desk, a card per person on a phone, «—» where the person was not judged. «Elegir datos» picks up to 8 facts by group; the choice is each manager's own.
- **Tests:** `frontend/tests/unit/metasPorPersona.test.js` (5).
## 2026-11-20 — «Ajustes del negocio»: every switch the owner may change, in one place (lane ajustes-negocio, with taller and scanner_kit; not deployed)

- **Why:** owner switches were spread over separate sheets, and some still needed Desk (Scanner Settings `conteo_ui`, G-14, unset on doco prod). The owner could not find where a behaviour is switched, or what a switch does.
- **Change:** Más › Configuración › «Ajustes del negocio» (`/crm/negocio`, owner only) lists, by area, what each app offers through the new `muelle_business_settings` hook (`crm/business_settings.py`): a Single's Check (`doctype` + `field`), a switch the app reads and writes with its own rules (`get` / `set`), or a link to its own settings screen. Below, «Todos los demás interruptores» lists every other Check of the installed Muelle apps' settings Singles (Frappe and ERPNext stay in Desk) with their own label and description, searchable without accents. A tap saves through the Single document (its validations and write permission, the same as Desk); a refusal puts it back. crm lists «Cómo registras prospectos» (`/prospectos?ajustes=1` now opens that sheet) and, once the shift handover is in, «Pedir la entrega de turno»; taller its follow-ups switch and its settings screen; Escáner «Conteo del día» and «Reposición automática».
- **Tests:** `crm/tests/test_business_settings.py` (7), `frontend/tests/unit/ajustesNegocio.test.js` (4).
## 2026-11-20 — «Entregar turno»: the closing person hands the shift over from Hoy (lane entrega-turno, with taller; not deployed)

- **Why:** the next shift learned what stayed open from memory or a WhatsApp line: a repair promised for today, a customer who said they would come back, a supplier coming to collect.
- **Change:** Hoy's Accesos card offers «Entregar turno» (`components/hoy/HandoverSheet.vue`, `crm/handover.py`, `crm.api.handover`). Hoy builds the handover: the closer's own pendientes due by today (ToDo and CRM Task), tomorrow's follow-ups (anyone's), and what other apps add through the new `crm_handover_sections` hook (taller: devices promised by today and not ready, devices ready and not picked up). A note and one tap save a `CRM Shift Note` (note + snapshot; the team reads it, live through Hoy's watch). Everyone else's Hoy shows «Del turno anterior» with the note and what was open, for a day, until «Enterado». The owner turns it off in the sheet itself (`FCRM Settings.hoy_settings`, overrides only; on by default).
- **Tests:** `crm/tests/test_handover.py` (6), `frontend/tests/unit/handoverSheet.test.js` (5).

## 2026-11-20 — Por explicar updates by itself: counts, groups, accounts and cash follow every change, from any phone (lane por-explicar-vivo; not deployed)

- **Why:** Marco: «I want qty and fields to update auto on RT». Bancos and an account's page already followed changes; Por explicar read its numbers only on open and after its own taps, so the bank's import, a teammate or his other phone left it stale.
- **Change:** `pages/PorExplicar.vue` follows Bank Transaction, Payment Entry, Journal Entry and Sales Invoice (`useLiveList`, at most every 5 s) and reads `estado` and the balances again in place, with no reload and no button. Saves by the same person count too (`me: () => ''`): they may come from their other phone. What each tap did stays where it was; a group or account whose count or amount changed is marked a moment (`porExplicar.liveKeys`, `data-fresh`). Every write goes through `paint`, so a live read that started before a tap's answer never paints over it; the balances' reads keep only the latest. An open «¿Qué fue?» follows its group (its count and button follow); when the group was explained elsewhere the sheet says «Ya no queda nada por explicar aquí: se explicó desde otro lado.» and offers only «Cerrar». A failed live read keeps the page.
- **Proved:** on the lab through the lane's live preview, two phones as the same person: phone B explained «SAT …» (answer in 0.9 s); phone A, never reloaded, went 287 → 286 movimientos 2.2 s after the tap, the group left and BBVA Debito (24 → 23) was marked; B's «Deshacer» brought A back to 287 in 4.9 s. Two live reads, no reload.
- **Tests:** `tests/unit/porExplicar.test.js` (+5: the doctypes and same-person saves, a read in place that keeps the tap's result and marks what changed, a stale read never painting over a tap, the sheet following its group and saying when it was explained elsewhere, a failed read keeping the page); removing the stale-read guard or the sheet's follow fails them. Rollback: revert.
## 2026-11-20 — «¿Qué pasó?»: a follow-up's outcome in one tap from Hoy and Pendientes (lane seguimiento-un-toque, with taller; not deployed)

- **Why:** on Doco prod 26 of the 28 open follow-ups were overdue (11-20), and only 13 of 128 deals from the last 30 days had a next step. Logging a call meant opening the record, closing the task and writing the next one with a date (about 6 taps and typing).
- **Change:** a CRM Task owed to a prospect or a deal gets «Resultado» on Hoy («Para ahora») and «¿Qué pasó?» in the Pendientes row menu. The sheet (`components/hoy/OutcomeSheet.vue`) offers WhatsApp with the shop's text already written (manual mode: wa.me, logged as opened, never as sent; official account: the record's chat with the text copied), a call, the record, and the outcomes (`crm/pipeline/services/outcomes.py`, `crm.api.follow_up_outcomes`): «Contestó» → when is the next one (the same task again at that time, for the same person), «No contestó» → it comes back later and counts the try (`CRM Task.no_answer_count`), «Ya compró» (deals: the pipeline's first Won stage the deal may enter) and «Ya no quiere» → the reason (lead or deal, lost reasons most used first); a settled record cancels its other person-made follow-ups. A source app owns its tasks' outcomes through the new `crm_follow_up_outcomes` hook (taller: «Ya le avisé», «Viene a recoger»). A phone or an ID in the name field is never said as the customer's name.
- **Settings:** «Cómo registras prospectos» gains «Si no contesta» (En 2 horas / Mañana / En 2 días, default Mañana) and «Mensaje de seguimiento» (`{nombre}`, `{vendedor}`, `{negocio}` tapped in; empty = Muelle's own words), stored in `FCRM Settings.prospect_settings`.
- **Proved:** doco-mirror (lab push gen 3632): `options` on a real person task answered «Contestó» and «No contestó» only (a repair deal: taller owns its status), WhatsApp as the Bandeja thread (Doco's official account), a call link and the default message; the first draft said «Hola 6951199223» because the deal's first name is a phone, now fixed. The mirror has no automated repair tasks, so «Ya le avisé» and «Viene a recoger» were proved on a lease only.
- **Tests:** `crm/tests/test_follow_up_outcomes.py` (15), `frontend/tests/unit/outcomeSheet.test.js` (6), `prospectosAjustes.test.js` (+2).
## 2026-11-20 — «Límites» on a person in Equipo (lane limites-caja, with posawesome and doco; not deployed)

- **Change:** `EquipoPersona.vue` shows the limits the enforcing apps report (doco's `doco_equipo_limits`) as chips under «Límites», with what the current one means; a tap saves through `doco.erp_experience.equipo.set_limit`, the answer is said under the rows and a refusal puts the chip back. Owner only.
- **Tests:** `frontend/tests/unit/equipoLimites.test.js` (4).

## 2026-11-20 — Etiquetas prints straight to the computer's label printer through Muelle QZ, with no print dialog (lane etiquetas-qz; not deployed)

- **Why:** shops printed labels as a PDF and then from a PDF app, because the browser's dialog was flaky on label paper. A kiosk Chrome (`--kiosk-printing`) sends `window.print()` to its last printer, usually the ticket one.
- **Change:** «Elegir impresora» beside the print button (from 1024 px) opens «Impresora de etiquetas»: the browser's dialog or a printer Muelle QZ sees on this computer, kept in this browser (`muelle:etiquetas:impresora`). With one picked, «Imprimir» asks doco for the PDF (`print_labels(output="pdf")`, one label a page at its size) and QZ prints it with no dialog (`printLabelPdfViaQz`: the label's size in mm, no margins, no orientation). The job is marked as before. If QZ is closed or the printer is gone, it says why, and offers «Volver a intentar» (QZ again) and «Imprimir con el diálogo». A computer without QZ sees the installers the site offers. A template without a size, and phones, keep the dialog.
- **Proved:** QZ 2.2.5's own `PrintPDF` sent a lab 38 × 25 PDF to a stopped CUPS queue with the Phomemo M110 driver: with a size and no orientation, every page is an upright 38 × 25 label; without a size, QZ prints it upside down. Shots at 1280 and 1440, light and dark, against doco-mirror.
- **Tests:** `tests/unit/etiquetasDirecto.test.js` (9: the QZ config, the base64 PDF, listing without choosing the ticket printer, the worker's words), `tests/unit/etiquetas.test.js` (+5: picking the printer, a direct print, QZ closed with the dialog fallback, the retry, a computer without QZ).
## 2026-11-20 — Each shop chooses how it registers prospects: companies, phone, Consultas, first follow-up, origins (lane prospectos-ajustes; not deployed)

- **Why:** Prospectos asked every shop for a company (organization, website, revenue, employees, industry) plus salutation and gender; none of Doco's 12 leads or Mumu's 1 has an organization. The deal form and the deal data tab hid the organization for every shop in code (`DealModal.vue`, `DataFields.vue`), so a shop that sells to companies could not get it back.
- **Change:** a sheet «Cómo registras prospectos» (Prospectos' «⋯» on a desk, the search panel on a phone; managers only, `components/ventas/ProspectosAjustesSheet.vue`) with «Vendo a empresas», «Pedir teléfono», «Preguntar el trato» and «Preguntar el género», «Registrar consultas», «Primer seguimiento» (No agendar, En 2 horas, Mañana) and «Orígenes» (which ones the form offers, and new ones such as TikTok). Each tap saves; a refusal puts it back and says why. The choices live in `FCRM Settings.prospect_settings` (JSON of what the owner changed; `crm/lead/settings.py`), so a site that never opened the sheet gets the defaults: companies off except for the giros that sell to businesses (refaccionaria, laboratorio dental; Abordo Settings.giro), Consultas on, phone required, no automatic follow-up, salutation and gender not asked. The new-prospect, deal and convert forms and the deal and lead data tabs read their layout with `entry=1` and get the shop's rules (`crm/lead/fields.py`); the side panels follow; the layout editors still read the whole layout, so turning companies back on brings every field back. With companies off the list drops the company line and its search, the prospect page drops «Empresa» and the convert form asks for no organization. «Registrar consultas» off removes «Registrar consulta», the «Nuevo» choice and the Tipo tabs; Consultas that arrive by themselves (doco_marketing's comments and referrals) still list. A new lead gets its first follow-up through the follow-up service (`crm/lead/follow_up.py`, one slot per lead, WhatsApp, call or email by what the lead has), and the task moves with the lead's assignment; a follow-up that fails is logged and never costs the lead. `CRM Lead Source.disabled` keeps an origin out of the form; an origin the vocabulary does not know is its own chip in the list. Doco and Mumu need no kit: their giros give companies off, and the first follow-up stays off until the owner picks one.
- **Tests:** `crm/tests/test_prospect_settings.py` (19: defaults by giro, saves, refusals, form rules for lead and deal, side panels, follow-up timing, owner, failures, assignment, chips, the API's answer), `crm/tests/test_prospects.py`; `tests/unit/prospectosAjustes.test.js` (+7), `prospectosPage.test.js` (+4), guards (`spanishCatalog`, `dailySpanish`, contrast, tokens). Build: entry JS 177.6 KB gzip, 11 daily routes within 60 files. Shots at 1280, 412 and 305 px, light and dark (lane `.scratch/shots/out/`). Rollback: revert; the JSON field and the origin flag stay unused.

## 2026-11-20 — A phone's first /crm load mounts with a 30 KB first dictionary; the whole set follows (lane golive-crm-es; not deployed)

- **Why:** go-live audit 11-19 (finding 79): the mount waits for the translations script, about 320 KB gzip, bigger than the app's entry. On a phone's first /crm load over Slow 4G it ended last and first paint waited for it. Lane golive-crm covered the load after a deploy (the kept dictionary); a browser's very first load still waited.
- **Change:** each built set gets a first part (`crm/shell_dictionary.py`): the shipped keys among the literals of the entry, the shell, the desktop rail's bell, Hoy and the «Primeros pasos» sheets abordo's welcome opens on Hoy (`/crm/hoy?paso=…`), and the chunks they import statically (`translation-keys.json` `first`, from `frontend/scripts/translation-keys.mjs`), plus the record names of the small DocTypes the build names (a deal's stage), under its own content-hashed version (`translations?part=first&v=…`, immutable, sets `window.translated_messages_first`). `crm.py` links it for `/crm` and `/crm/hoy` only, with `data-full` naming the whole set; a deep link links the whole set as before. `utils/translationsReady.js` mounts once the first part has run, loads the whole set when the router's first route is in, makes it the config and keeps it in IndexedDB; it repaints only when a render missed a key the whole set has (`translation.js` notes the misses), so a warm load does not repaint the app. Until the whole set is in, what the first part does not cover waits for it (10 s cap): a navigation to any other route (`router.beforeEach`, before the route's chunk evaluates), the sheets the first screen opens on a tap (Más, Escanear, the palette, the camera, the assistant, «Completar», the bell's Ventas panel: `afterWholeDictionary`) and the idle route warm-up. A whole set the browser kept after a deploy is shown at once and nothing waits for the new one, also when IndexedDB answers after the first part ran. Call statuses (`utils/callLog.js`) translate on access instead of once at module load. The build fails when a `FIRST_ROUTE` module is in no chunk. A set cached or stored before first parts, a dev server or a pending build link the whole set as before. `docs/TRANSLATIONS.md` «The first part».
- **Measured** (lab /crm as playwright-bot, cold, Moto G4, Slow 4G 150 ms / 1.6 Mbps / 4x CPU; lane `.scratch/proof/SUMMARY.txt`): first paint 4.86 s and 6.08 s before (the whole set, 329 KB on the wire, ended at 4.38 s and 5.45 s), 2.70, 2.70 and 2.73 s after (the first part, 25.6 KB on the wire, ends at 1.73 s; the entry at 2.02 s; the whole set starts at 3.77–4.00 s, after Hoy's chunks, and ends at 5.67–5.85 s, so the first part alone is the config for about 3 s); measured from the end of the HTML, 4.50 and 4.67 s before, 2.33–2.36 s after. LCP (Hoy's list) 4.86 and 6.08 s before, 4.01 and 4.06 s after; one run had 8.88 s, which is unexplained (its `hoy.page` read ended at 4.21 s and the whole set at 5.85 s; that build still repainted the whole app when the set arrived, which the miss-aware repaint now skips when Hoy needs no key from it). At 9 Mbps / 60 ms / 4x CPU nothing measurable changes (first paint 0.89 s from the end of the HTML before, 0.76 and 0.90 s after): there the entry, not the dictionary, sets the pace. With the whole set held back, the phone and desktop Hoy screens showed no English text, aria-label, title or placeholder (`flash-check.json` and screenshots). After the review (070df7295, the «Primeros pasos» sheets in the first part: 31.0 KB on the wire, 2,292 keys): first paint 2.80 and 2.83 s, LCP 4.27 and 4.22 s, the whole set 3.90→5.84 s; with the whole set held back, `/crm/hoy?paso=todos` opens «Primeros pasos» in Spanish, and Escanear and Más open only once the whole set is in, with no English (`.scratch/proof/v3-*`).
- **Tests:** `crm/tests/test_translations_script.py` (+6: the first part's keys and immutable version, the landing paths link it and other paths the whole set, a set without one, a cache clear restores it, context keys, record keys; 29 green on a full-retail lease), `tests/unit/translationsReady.test.js` (+18: gated sheets, the cap, kept sets, a late IndexedDB answer, misses and the skipped repaint, call statuses), `translationsScript.test.js` (+1), `translationKeys.test.js` (+7: chunks matched by module, a FIRST_ROUTE module in no chunk, the landing route and crm.py's paths). Entry JS 177.5 KB gzip (budget 180). Rollback: revert (the old code reads the new cache tuples and files as its own).

## 2026-11-20 — The English the Spanish check could not see gets its Spanish: Deal 360 activity, Ajustes, notifications, uploads, the onboarding pieces (lane golive-crm-es; not deployed)

- **Why:** go-live audit 11-19 (finding 31, crm half). After lane golive-crm every `__('…')` literal had its msgstr, but English still reached the screen two ways the check does not read: strings a component stores in a variable and renders raw or through `__(variable)`, and the vendored `framework-ui` components.
- **Change:** `Activities.vue`'s empty states (Notas, Tareas, Archivos, Correos, Comentarios, WhatsApp, the Deal 360 workspace uses it), `EventArea`'s «creó un evento», the file uploader's «No se pudo subir el archivo», the table multiselect errors, the assignment rules' routing and priority options («Por turnos», «Según la carga de trabajo», «Medio-bajo», «Medio-alto»), the invite and add-user role descriptions and an archived stage's «Archivada» now go through `__()`; the dynamic keys `__()` already received get their msgstr (the notifications groups «Empiezan ahora», «Eventos en curso», «Próximos eventos», ERPNext sync tabs, «En persona», «No se pudo crear el registro», «Análisis del embudo») and the event popup's fallback title «Aviso de evento» goes through `__()`. `src/framework-ui` (HelpModal, HelpCenter, SignupBanner, OnboardingSteps, GettingStartedBanner, IntermediateStepModal, TrialBanner) wraps its labels, aria-labels, placeholders and text in `__()`, recorded in `SOURCE.json` `local_changes.i18n`. 67 es.po rows; where frappe already translates a msgid («Reset all», «Welcome to {0}», «Skip») the crm row repeats frappe's words, so Desk keeps them.
- **Guard:** `spanishCatalog.test.js` now checks static attributes in `framework-ui` too, and a new case fails on template text anywhere in `src/` that uses a word of the detector's English list (`helpers/spanishCopy.js` `ENGLISH`, which now knows document, random and default; a URL path, product names and the license notice are listed as not copy). Single words outside that list still pass; crm `AGENTS.md` names that gap. WhatsApp activity's «Documento», the SLA list's «Predeterminado» and «Prospecto»/«Trato», and the emoji picker's «Al azar», its category titles and «Sin resultados» (msgctxt `Emoji`, so Desk keeps its own words) now go through `__()`. The shared template reader ends a one-line `<template>` at its own closing tag. crm `AGENTS.md`'s rules table names the check and its gap (a string kept in a variable).
- **Tests:** `spanishCatalog.test.js`, `dailySpanish.test.js`, `translationCollisions.test.js`, `pipelineConfiguration.test.js`, `settingsAssignment.test.js`, `crmOnboarding.test.js`, `activitiesStandalone.test.js`; msgfmt and `check_po_duplicates.py`. Rollback: revert.

## 2026-11-19 — After a deploy, /crm mounts with the dictionary the browser kept instead of waiting for the new one (lane golive-crm; not deployed)

- **Why:** go-live audit 11-19 (finding 79): the mount waits for the translations script (312 KB gzip); on Slow 4G it ended at 4.2 s, after the entry (2.3 s), and first paint came at 4.5 s. Warm loads hit the immutable HTTP cache, but each deploy that changes the words links a new version, so every person's first load after a roll waited for the download again.
- **Change:** `utils/translationsReady.js` keeps the last built dictionary in IndexedDB (`crm-translations`, key site and language, only content-hashed versions). When the page links a version the browser has not run yet, the mount uses the kept one at once; when the new script arrives it becomes frappe-ui's dictionary and `translation.js`'s `dictionaryRevision` moves, so every translated render repaints with the new words, and the new one is kept at idle. A browser with nothing kept, an unversioned page, or no IndexedDB waits for the script as before (10 s cap). A localStorage note (`crm-translations-version|<site>|<lang>`) names the kept version, so a load between two deploys (the script is in the HTTP cache) does not read the kept megabyte back from IndexedDB. **Not covered:** a browser's very first /crm load still waits for the whole script; finding 79 stays open for a smaller first-route dictionary.
- **Tests:** `tests/unit/translationsReady.test.js` (+14: early mount and repaint, same version no repaint or write, the noted version skips IndexedDB, an older note still reads it, the note never throws, nothing kept, the script first, unversioned page, failing store, bad entry, no IndexedDB, a mounted screen repaints). Real Chromium (Playwright): mounted 1.2 ms after the call from the kept set while the script was held back, repainted when it ran, kept the new version (lane `.scratch/proof/idb-proof.json`). Build: entry JS 176.9 KB gzip (budget 180). Rollback: revert.

## 2026-11-19 — After a deploy or a cache clear, the first /crm load gets the trimmed dictionary, not the whole 1 MB one (lane golive-crm; not deployed)

- **Why:** go-live audit 11-19 (finding 80): the lab's first /crm load after a migrate linked `translations?v=` (empty) and got the whole dictionary, 3.5 MB raw, 1.08 MB gzip, uncacheable. crm's after_migrate rebuild ran, but every app after crm re-saves its custom fields in its own after_migrate, and each save (`clear()`) deleted the stored sets.
- **Change (`crm/shell_dictionary.py`):** a DocType, Custom Field or Property Setter change now marks the stored sets stale (`crm-shell-dictionary/changed`) instead of deleting them. A stale set, a set older than a day, or, for a field with no set yet (a new build's keys, a Translation edit), the newest set of the same language is served under its own content-hashed version (immutable for a year) while the page load's queued build runs; a meta change during a build serves that build and queues another. Only a language that was never built gets the whole dictionary. Each language keeps its two newest sets; files of the old naming are removed.
- **Tests:** `crm/tests/test_translations_script.py` (+6, one rewritten: a meta change serves the stored set while it rebuilds; later apps' after_migrate keeps the trimmed set; a new build borrows its language's last set, never another language's; two sets per language; a day-old set is rebuilt; a meta change mid-build). Rollback: revert (the old code ignores the new file names and builds again).

## 2026-11-19 — The whole /crm speaks es-MX: 446 English strings get their Spanish (lane golive-crm; not deployed)

- **Why:** go-live audit 11-19 (findings 31 and 36): a deal's Orders tab (sales orders, payment links, the register handoff), Offers, the conversion review and Ajustes showed English copy about money and permissions to a Spanish-speaking owner or seller.
- **Change:** `crm/locale/es.po` gains the es-MX msgstr of the 377 English msgids the detector found outside the daily routes, 54 short English labels it does not catch («Billing», «Outstanding», «Taxes», «Register handoff»…) 10 template literals now wrapped in `__()` (SLA, assignment-rule, email-template, lead-source and events empty states, the lead-sync form, the icon search), and Ajustes' effective-settings and Offers leftovers («Sin fecha de inicio», «Renglón {0}», «Zona horaria no disponible»…). Wording keeps the catalog's terms (trato, prospecto, embudo, caja, enlace de pago, orden de venta). A bare msgid is shared site-wide (Desk, POS) and later-installed apps override it, so where crm needs other words than frappe, erpnext, posawesome or doco («Submitted», «Outstanding», «Delivery», «Customer Group», «Terms»…) the crm caller passes a context (`Pedido`, `Trato`, `Oferta`, `Ajustes`, `Automatizaciones`, `ERPNext`, `Archivos`) and es.po has it under that `msgctxt`; every bare row crm adds matches the other apps' Spanish where they have one, so Desk and the register keep their words. The order panel's «Delivery» now reads «Entrega», not doco's «Domicilio». The score-rule field hint keeps the real field name («Campo (p. ej. source)»). «The order status is incomplete» now says «Try again» (es «Vuelve a intentar») instead of asking for a refresh; retry buttons say «Volver a intentar».
- **Guard:** `tests/unit/spanishCatalog.test.js` fails when any English string a module passes to `__()` / `tr()` / `shellT()` has no es-MX msgstr, or when a component passes English as a static placeholder / aria-label / title / label / alt / tooltip / description attribute, anywhere in `src/` but the vendored `framework-ui/` (the daily-route check, `dailySpanish.test.js`, keeps its full template scan). The English detector also knows limit, timezone, restriction, line and unavailable. It reads contexts from imports and from a module's own `tr()` default. The shared reader moved to `tests/unit/helpers/spanishCopy.js`.
- **Tests:** `spanishCatalog.test.js` (new: red on the old catalog with 405 strings, green now), `dailySpanish.test.js`, `translationCollisions.test.js`, `iconPicker.test.js` (provides `__`). Rollback: revert.

## 2026-11-19 — Más offers places other apps open outside the shell: Asistencia first (lane asistencia-puerta-crm, with doco asistencia-puerta; not deployed)

- **`muelle_more_places`** (`crm.api.shell.more_places`, boot `places`): each provider returns `{key, label, icon, href}` or None; only this site's Desk and app paths pass, a module key or a repeat is dropped, at most six, and a failing provider costs only its place.
- **Más** shows them with the modules as links with the way back (`shellRail.placeHref`); doco's Asistencia (`/desk/asistencia`) is the first. Hoy's card from doco's Asistencia source gets the clock icon.
- **Tests:** `crm/tests/test_shell_more_places.py` (new), `tests/unit/shellSiblingHref.test.js` (+2). Rollback: revert with the doco half.

## 2026-11-19 — The Messenger reply-window and answered/waiting work, on WhatsApp too (lane origen-canales, with doco_marketing; not deployed)

- **«Sin asignar» WhatsApp rows** get the chip: «Esperando 3 h · quedan 21 h», «Sin respuesta · 2 d» past 24 h (WhatsApp then takes only an approved template), or «Respondido · CRM/Bot/Celular».
- **WhatsApp orphan chat:** a line above the reply bar says until when one can answer, and past 24 h that only a template goes out and the lead or deal must be created to send it (this reply bar has no templates).
- **`MessengerArea`** takes `window` (default on); the deal view turns it off, where `MessengerBox` already says it.
- `utils/messengerOrigin.js`: `replyWindow`/`windowFromServer` take the channel (WhatsApp: 24 h, then `template`).
- **Tests:** `tests/unit/messengerOrigin.test.js` (+3). Rollback: revert.

## 2026-11-19 — Pregúntale a Muelle: several files in one message (lane sheet-multi-files, with doco; not deployed)

- **Why:** Marco, 11-19: the sheet took one file at a time; he wanted to send an order's three pictures (the order, its shipping, its payment) in one go.
- **Change:** «+» opens the picker with several files (up to five, as the Desk composer and doco `workspace_turns.submit` take). One file keeps its chip; several show as square tiles, each with its ×, all in view on a 305 px phone; a sixth is left out with «Un mensaje lleva hasta 5 archivos. Quita uno para agregar otro.». They go as one message: each uploaded once as a private File, then sent as the Desk composer's attachments («auto»: the server reads each one with the message's words). A failed upload keeps the ones that went up, so «Reintentar» uploads only the rest. The bubble shows several photos as thumbnails.
- **Tests:** `tests/unit/assistantFiles.test.js` (+5), `tests/unit/assistantComposer.test.js` (+2). Shots at 412 and 305 px, light and dark (lane `.scratch/shots/`). Rollback = revert with the doco half.
## 2026-11-19 — Messenger: who sent each reply, Meta's reply window, «Sin asignar» answered or waiting (lane messenger-origen, with doco_marketing; not deployed)

- **Chat (`MessengerArea`):** each reply says who sent it: the teammate, «Bot», «Desde Meta» (Business Suite or the Messenger app) or «Automático de Meta». The last one is drawn outlined: Meta's greeting and opt-in card, which do not count as an answer. Ticks: ✓ sent, ✓✓ delivered, blue ✓✓ seen. The last line says until when Meta lets us answer: 24 h after the customer's last message, then «Agente humano» up to 7 days, then nothing. Conversaciones asks doco_marketing for the senders (`get_messenger_origins`).
- **«Sin asignar» Messenger rows:** «Esperando 17 h · quedan 6 h», «Sin respuesta · 1 d» once the window closed, or «Respondido · Meta/CRM/Bot»; an answered row's preview starts with ↪. Helpers in `utils/messengerOrigin.js`.
- **Tests:** `tests/unit/messengerOrigin.test.js` (11). Shots in the lane's `.scratch/proof/`. Rollback: revert with the doco_marketing half.
## 2026-11-19 — Local CI builds in RAM (lane ci-local-ram; CI only)

- `scripts/ci/local.sh` keeps its clones, venvs, `node_modules` and builds in `$CRM_CI_SCRATCH` (default `$TMPDIR`, else `/tmp`, a tmpfs on the workstation), linked as `.ci-local/<sha>-<pid>/trees`; only the logs stay in `.ci-local/`. A run wrote ~34 MB/min to the NVMe while it built (2026-11-19). A killed run's scratch goes after 6 hours. `docs/CI.md` «Local gate». Rollback: revert.
## 2026-11-19 — Catálogo en el chat: filtros, ofertas, plantillas, revisar antes de enviar, enlace a la tienda (lane catalogo-chat, with doco_marketing; not deployed)

- **Picker (`CatalogPicker`):** chips for in stock, on sale, price range, brand and the results' groups; cards show the sale price with the list price struck through and the percent off. A template selector in the footer; «Enviar» sends with it.
- **«Revisar»:** quick replies, the message before the items with a preview, the format of each item's text with variable chips, each item's price for this message and its own editable text, «Enlace a la tienda con esta búsqueda» (a short link), the message after, «Guardar como plantilla» (saved for every channel). It says when the channel shows the plain words. Helpers in `utils/catalogMessage.js` (mirror of doco_marketing `catalog_message.py`).
- **Messenger «Sin asignar»** gains «Catálogo» in its «+» menu and `/cat` in its reply bar. {{nombre}} comes from the record or the chat's profile.
- **Tests:** `tests/unit/catalogPicker.test.js` (9). Shots in the lane's `.scratch/proof/`. Rollback: revert with the doco_marketing half.

## 2026-11-18 — Colchón: «Tus logros» (lane metas-dinero; not deployed)

- A green card on `/bancos/colchon` lists the money goals reached (a card at zero, each month of cushion, the cushion full) with their day, newest first; the owner also hears each one in the chat and the bell (doco `books/metas_dinero`).
- **Tests:** `tests/unit/colchon.test.js` (+1). Rollback = revert with the doco half.

## 2026-11-18 — Por explicar: «Adjuntar ticket o factura» on a movement (lane ligar-capturas; not deployed)

- **The paperclip on each movement** (in «Ver movimientos») opens «Adjuntar ticket o factura»: Ticket / Factura / Comprobante (a CFDI's XML picks Factura), a photo or a file, a note; «Leer y registrar» sends it through the capture engine with the movement it explains and opens its review, which comes back to Por explicar. When the draft is confirmed, it is linked to the movement by itself (doco `books/ligar_aviso`).
- **Tests:** `tests/unit/porExplicar.test.js` (+1). Shots at 412 px light and 305 px dark (`.scratch/proof/`). Rollback = revert with the doco half.
## 2026-11-18 — ¿A dónde va? by money tag (lane adonde-etiquetas; not deployed)

- **Chips under the month:** «Todo» and each money tag; a tag shows only what carries it («Solo lo que lleva la etiqueta «Remodelación»: lo demás no cuenta aquí»), with its destinations, its months and what came in; the fixed-expenses card hides (one tag says nothing about the cushion). The tag rides the address (`?etiqueta=`).
- **Tests:** `tests/unit/aDondeVa.test.js` (+1). Shot at 412 px (`.scratch/proof/`). Rollback = revert with the doco half.
## 2026-11-18 — Transferencias settings: where the register charges each account, and what a second bank buys (lane cruzar-bancos, with doco and posawesome; not deployed)

- **Why:** with accounts at two banks the register sends each customer to the other bank's account, so every transfer goes through Banxico (doco CHANGELOG 2026-11-18).
- **Change:** `TransferenciasAjustesSheet`: each receiving account names the register methods that charge into it, with «Cobrar en caja» when none does; under the accounts, one line says what a same-bank transfer costs (one bank) or that the register crosses banks (two). Helpers `cruceTexto`, `enCajaTexto`.
- **Tests:** `tests/unit/transferencias.test.js` (+1). Rollback: revert.

## 2026-11-17 — Hoy: «Today's sales» is what the tickets charged; new «Credit sales» section (lane hoy-credito, with mercado; not deployed)

- **Why:** Marco, 11-17 16:14: «Today's sales IS wrong». Hoy said $5,695; the 12 tickets charged $2,654. The other $3,041 was what Payjoy pays later for one phone (Resultados counts a credit sale at what the shop gets, his 10-29 rule). He chose: tickets only on Hoy, and a section for the Payjoy credits.
- **Change:** `hoy._sales_today` shows the Ventas card's `charged` (what the tickets charged, its net and yesterday's). New section `credito` (`hoy._credit_today`, Resultados' new «Credit sales» card for today): what the provider pays later, the down payments, one row per sale (customer, provider, credit price, down payment, the provider's part or «No credit price») opening the ticket, and a link to the sales missing their credit price. Off for whom the owner keeps the money from, for whom the card is blocked, and on sites without an enabled Credit Provider. Hoy writes money as the shell does («$5,695.00», not the phone's «5695,00 MXN»). The Resultados lens lists credit sales (`tipo=credito`) with the provider's part; its picker offers that list only while it is open.
- **Tests:** `crm/tests/test_hoy_sales.py` (+2), `tests/unit/hoySales.test.js` (+4). Rollback: revert; the section falls off on a Mercado without the card.

## 2026-11-17 — Local CI's MariaDB runs in RAM (lane ssd-ci-tmpfs-crm; CI only)

- **Change:** `scripts/ci/integration-compose.yml` gives the throwaway `database` service a 4 GB tmpfs datadir and turns off crash durability (`--innodb-flush-log-at-trx-commit=0`, `--innodb-doublewrite=0`, `--sync-binlog=0`), so `scripts/ci/local.sh` runs stop writing their databases to the workstation's SSD.
- **Rollback:** revert.
## 2026-11-17 — Bancos › Transferencias and «¿Ya llegó?»: check a customer's transfer with Banxico (lane ya-llego, with doco and posawesome; not deployed)

- **Why:** Marco's employees asked him to confirm every SPEI a customer sent (docs/DINERO_EN_ORDEN.md §3e).
- **Change:** `/bancos/transferencias` (in the TuDinero route): the period's totals as filters (Llegaron, Buscando, Sin venta, No llegan), Hoy / Ayer / 7 / 30 días, views led by «Todas», search, the list by day (rows on a phone, a table from 720 px), a check's sheet (what Banxico says, who sent it, the sale it paid or the sales of the same amount to link, «Sí llegó», «Volver a intentar», discard in two taps), and the owner's settings (on/off, «Cobrar y avisarme» / «Esperar a que llegue», the notice, each account's CLABE checked digit by digit). «¿Ya llegó la transferencia?» sheet: the receipt's photo (read by the server) or amount, bank chips and tracking key or numeric reference; it follows the check live. Bancos gains the «Transferencias de clientes» row; ⌘K «Revisar una transferencia» opens the sheet. Who the owner keeps the money from sees only their checks.
- **Tests:** `tests/unit/transferencias.test.js`.

## 2026-11-17 — The Resultados ticket reads like a record: the repair, the customer, the profit and its actions (lane ticket-detalle, with mercado and taller; not deployed)

- **Why:** Marco, from a ticket on his phone: more data, a more modern page, the repair and CRM data, and the actions a sale needs. The page showed the lines, the payments and «Reprints and returns are made at the register».
- **Bar:** the customer's name with the state and folio; the island calls or WhatsApps them (the ticket's PDF on the official account), the bolt holds the ticket's steps and «⋯» every Documentos tool (print, share, comment, assign, tag, pendiente, cancel…) through `useRecordKit`.
- **Hero:** the amount, how it was paid, «Sin factura» / «Facturada (CFDI)», «Devolución hasta…», a credit sale's provider and, for whom sees margin, «Ganancia $X · N %». Money owed leads with «Cobrar en caja».
- **Sections:** the repair the ticket charged (Taller: device, IMEI, reported fault, work done, who received, repaired and delivered it, warranty, parts and their cost for whom sees cost), each line with its photo, list-price discount and cost, the payment with discount and taxes, the profit (costed lines, their cost, labour left out), the customer (purchases and total, previous visit, since when, repairs, what they owe; never the walk-in customer), details (folio to copy, sellers, pieces) and Actividad y comentarios.
- **Bolt:** «Imprimir o descargar el ticket», «Hacer la factura (CFDI)» and «Mandar al cliente el enlace para facturar» (Contador's self-billing link, only where the shop turned on public invoicing), «Devolver en caja» while the return window is open, «Abrir la reparación», «Abrir la venta en Ventas».
- **Server:** `crm.api.resultados_ticket` adds `customer`, `cfdi`, `register` and the `muelle_resultados_ticket` blocks (one per app, a failing block left out) to `resultados.document`. Shared: `documentos/recordWhatsapp.js` (DocumentoRecord uses it too), `posReturnHref` moved to `utils/posHandoff.js`, `shareLink` in `documentos/tools.js`.
- **Tests:** `tests/unit/resultadosTicket.test.js` (24, incl. every string in es.po), `crm/tests/test_resultados.py` (+3). Full vitest, build, bundle budget and translation keys green. Shots at 305, 412 (light, dark) and 1280. Rollback = revert the three lanes' commits together.
## 2026-11-17 — Por explicar: «Ya están en tus libros» and «Facturas por pagar» (lane ya-registrado; not deployed)
## 2026-11-17 — Por explicar: «Ya están en tus libros», «Facturas por pagar» and money tags (lane ya-registrado; not deployed)

- **Nothing is booked twice:** movements whose entry is already in the books (a capture by chat, Gastos' «Pagar», an entry by hand) appear in «Ya están en tus libros» with what they pair with («Póliza · JV-30»); «Ligar los N» links them. Sales or purchases the site cannot link yet say «Ya está en tus libros: no lo registres otra vez».
- **«Facturas por pagar»:** a charge for exactly what an open invoice owes («Factura de Gasolinera Sur · PINV-7»); «Registrar los N pagos» records each payment from that account and links it. «Deshacer» unlinks (and cancels the payments made).
- `crm/api/bancos_cuadre.unlinked_entries(bank_name)`: Cuadre's unlinked entries of an account, for doco.
- **Etiquetas:** a group shows its suggested tags («Muelle (software)»), «Sí, es eso» books them; the «¿Qué fue?» sheet and «Gasté en efectivo» take tags (chips, suggested ones chosen, «Nueva etiqueta»); the tag icon in the bar opens the catalog by kind with «Sugeridas para tu negocio» («Crear N etiquetas») and a new tag with the words that suggest it.
- **Tests:** `tests/unit/porExplicar.test.js` (+4). Rollback = revert with the doco half.

## 2026-11-17 — Por explicar: «Gasté en efectivo», «Contar caja» and the daily reminder (lane efectivo; not deployed)

- **«Tu efectivo» on `/bancos/por-explicar`:** each cash account with what the books say it holds and when it was last counted («Nunca contada», «Contada hace 9 días»); «Gasté en efectivo» (how much, what it was among the most used expenses or «Retiros del dueño», which cash, today or yesterday, a note: one entry, with «Deshacer») and «Contar caja» (what is there against the books, «Faltan $X» / «Sobran $X» with «¿en qué se fue?» / «¿de dónde salió?»; the button leaves the books at the counted amount).
- **The bell in the page's bar: «Recordatorio»:** on or off, the hour (6 de la tarde … 10 de la noche) and how often to ask to count the cash (7, 14, 30 days or never). Saved in the company's «Plan de Dinero».
- **Tests:** `tests/unit/porExplicar.test.js` (+5: the helpers' words, cash spent and undone, a count with its answer, the reminder). Rollback = revert with the doco half.

## 2026-11-17 — Bancos › Por explicar: say what each bank and card movement was, a merchant at a time (lane por-explicar; not deployed)

- **Page `/bancos/por-explicar` (`pages/PorExplicar.vue`, in the «Tu dinero» route):** how many movements the books do not explain, their total and since when, and how many come with an answer suggested; one card per merchant and account («ANTHROPIC · Amex · 2 movimientos · −$7,275.29») with «Parece: Gasto del negocio · Software — Así lo explicaste las últimas 3 veces», «Sí, es eso» (books the whole group), «Otra cosa» / «¿Qué fue?» (the answer for that side: gasto, personal, entre mis cuentas, ingreso; then the account, searchable, most used first) and «Ver movimientos»; the receipt says what went through and offers «Deshacer». Without the rights to book entries the page shows what waits and says who books it.
- Bancos: the hero chip now reads «N movimientos por explicar» and opens the page (the account cards and the account page say «por explicar» too); Tu dinero starts with «Por explicar». Gate `bancos_routes` accepts `/crm/bancos/por-explicar`.
- **Tests:** `tests/unit/porExplicar.test.js` (7), `tests/unit/bancosConectados.test.js` (the chip's words), `crm/tests/test_bancos.py` (the path). Shots at 412 px light, 305 px dark and 1280 px on a seeded lease (`.scratch/proof/`). Rollback = revert with the doco half.

## 2026-11-17 — Twilio: a call log retried after a write conflict locks the log first (lane twilio-call-log-1020; not deployed)

- **Bug:** Twilio fires one call's callbacks close together. The save that lost the race (MariaDB 1020) rolled back and retried, but asked Twilio for the call before locking the log, so callbacks committing during that fetch failed the retry with 1020 again: «Error while updating call record» twice per pair on docomexico (11-14, 11-15).
- **Fix:** after the rollback the retry's first statement locks the log (`_lock_call_log`), then fetches and saves; the other callbacks wait for the lock instead of conflicting.
- **Tests:** `crm/tests/test_twilio_status_callback.py` (+1: rollback, lock, then fetch). Rollback = revert.
## 2026-11-17 — Equipo › «Ve el dinero del negocio» (lane dinero-oculto, with doco, posawesome and mercado; not deployed)

- **Equipo › person › «Dinero»:** the owner's switch «Ve el dinero del negocio» («Bancos, Resultados, las ventas del día y los costos. Apagado, sigue vendiendo, comprando y cambiando precios.»), said beside it like «Puede ver facturación».
- **Off, for that person:** Bancos and Resultados are off in the shell and refuse on every endpoint (`crm/api/money.py` asks the `muelle_money_hidden` hook; a failing hook hides), so Hoy has no «Ventas de hoy» and the bot's bank tools refuse. The shell's boot copy is keyed by it (`shell.scope_hash`). Productos › Inventario rows leave out the value the server no longer sends.
- **Tests:** `tests/unit/equipoDinero.test.js` (4), `crm/tests/test_bancos.py`, `crm/tests/test_hoy_sales.py`. Rollback = revert with the doco half.

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
