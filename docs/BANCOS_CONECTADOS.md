# Bancos conectados in the shell

Bank, card, wallet and SAT logins made through Syncfy (`syncfy_connector`) are handled in **Bancos** (`/crm/bancos`). Routine work never sends anyone to the Desk. The Desk forms and the `syncfy-connect` page are for administrators. Release status, Marco's decisions and the lab evidence are in syncfy_connector `docs/RELEASE.md`.

## Screens

| Where | What the person sees and does |
|---|---|
| Bancos, «Conexiones con tu banco» (`ConexionesSeccion.vue`) | Each login with its state in words. When the login needs the person, an amber chip shows the state and the line under the name gives the reason. Otherwise the chip shows one number when movements wait («12 por revisar», «7,562 sin enlazar»). At 305 px a long chip wraps to two lines instead of cutting off. Managers get «Conectar un banco». Disconnected logins fold under «Desconectadas (n)». `?conectar=1` opens the connect sheet. |
| «Conectar un banco» (`ConectarSheet.vue`) | Asks what is being connected (bank or card, SAT, wallet, other institution) and says where its movements go (Contador or Bancos). It says Muelle never sees the password. On a Sandbox site it adds a note. «Abrir Syncfy» opens Syncfy's own window (`syncfyWidget.js`, widget v3, loaded on first use, mounted on `#syncfy-widget-host` at the end of `<body>`). |
| A login's page `/bancos/conexion/<name>` (`ConexionDetalle.vue`) | The hero: kind, state word, the connector's reason, when the bank last answered, and one step: «Sincronizar ahora», «Sincronizar con código», «Escribir el código», «Reconectar», «Conectar de nuevo», or «Desconectar» (asks first) for an institution Syncfy no longer supports. The reason never repeats the state word. During Syncfy's cool-down a sync is disabled with a sentence; disconnecting and connecting again are not. Someone without a manager role reads whom to ask for that step instead («Pide a quien administra Bancos que la reconecte.»). A SAT login offers «Enviar sus facturas a Contador». **Cuentas**: each account says where it lands. An unlinked account (or one Contador stopped taking) is itself the «Enlazar» button. **Por revisar**: held or removed movements, with «Reintentar» and «No importarlo» / «Ya lo revisé». One that Contador held links to `/contador/bancos` for someone with Contador's fiscal role; anyone else is told to ask accounting. **Más acciones**: «Cambiar usuario o contraseña» (not for a retired institution), «Traer lo que ya descargó Syncfy», «Desconectar» (asks first). |
| «Enlazar» (`EnlazarSheet.vue`) | Asks which Bank Account the movements go to: a free one, or «Una cuenta nueva» on a bank ledger. It asks where they are reviewed (En Contador or En Bancos) and from which day; the date is prefilled to the day after the last movement already in the account. One sentence reads the choice back. A Mercado Pago wallet that Contador already collects is refused with the next step. |
| A Bank Account's page (`CuentaDetalle.vue`) | «Se sincroniza con <login>» links to the login's page. It shows the step for a manager and «N por revisar». |

On a wide screen the login's page opens in the right pane; on a phone it is a full page.

## Server

`crm/api/bancos.py` reads the connector's doctypes directly, as the caller (`frappe.get_list` permissions, `_company` scoping). Every action is the connector's own endpoint (`syncfy_connector.api.connect.*`, `syncfy_connector.api.connections.*`). Those endpoints require System Manager or Accounts Manager (`MANAGE_ROLES`) and the company.

- `get_capabilities`: `conectados` when the connector is installed and enabled on this site (Platform mode follows Boat's `syncfy_platform` flag) and the person can read Syncfy Connection. `conectar` additionally needs a manager role.
- `conexiones(company)` lists the logins (needs first, off last) with their accounts and waiting counts. `conexion(name)` returns one login plus its «Por revisar» rows. The account header carries `conexion`: the login that feeds it.
- Words live in `crm/bancos_words.py` (`connection_state`, `connection_detail`, `connection_kind`), tested bench-free in `crm/tests/test_bancos.py`. A retired institution is a «needs» state whose step is `disconnect`: Syncfy keeps billing a login until it is disconnected.
- `relink` marks a Contador-lane account whose Contador source stopped. That means it is paused, or the person who authorized it is no longer active; Contador collects as that person and stops without a word otherwise.

## Avisos

`crm/avisos/resolve.py` maps `Syncfy Connection` to `/bancos/conexion/<name>` («Bancos»). The connector posts the notices (`services/notify.py`): an in-app Alert to the company's managers when a login needs a person and nobody was watching. It is never emailed, and it clears itself once the login works again.

## Tests and shots

- `frontend/tests/unit/bancosConectados.test.js` covers the words, the widget wrapper with a fake `SyncfyWidget`, the step runner, the login's page (manager and not), and the list.
- Before landing, the screens were shot on the lab mirror through `shell-program/scripts/live-preview.sh`, at 412 and 305 px in light and dark and at 1280 and 1440 px. The shot script only reads: it never taps a step. The states the lab data does not have were shot from real answers rewritten in the browser: needs a person, error, bank down, retired, disconnected, connecting, cool-down, Contador's relink, «Por revisar», SAT, a reader without the manager role, and no logins yet.

## Follow-ups

- «Enlazar» asks «Desde qué día» with the shared `DateField`, whose quick picks are «Hoy», «Mañana» and «En una semana». A day to import from is never in the future, so this field wants past picks. The date is prefilled with the day after the account's last movement, so the picks are rarely needed. The fix is a picks prop in `@muelle/ui` (muelle `workspace/packages/ui`). That package is checked across every app by muelle's vendor-parity gate (`scripts/ci/shell-vendor-parity.mjs`), so it ships as a package release that pins the apps left on the old copy, then crm re-vendors.
