# Citas en línea in the shell: the setup chain

Online appointments (`doco.citas`) are booked from Agenda («Nueva cita»), Contactos and the
WhatsApp chat. When the shop is not ready, the booking form shows a gate instead of a dead end.
This note describes the chain and where each piece lives.

## The problem registry

`doco/citas/service.py` `PROBLEMS` is the one list of what can stop online booking. Each
entry carries the message, the `section` of the settings sheet that fixes it and the DocTypes
that fixing it writes:

| code | section | writes |
|---|---|---|
| `not_installed` | none (wait and retry) | |
| `hours` | `hours` | Appointment Booking Settings |
| `rest_days` | `rest_days` | Appointment Booking Settings |
| `scheduling` | `scheduling` (the hours fieldset; Save turns it on) | Appointment Booking Settings |
| `services` | `services` | Storefront Profile, Item |

`problems()` returns `{code, message, section, can_fix}` rows for the current user; `can_fix`
is write permission on the entry's DocTypes. `problems_cached()` caches the codes only, since
`can_fix` is per user. `options()` and `settings_get()` also return `fixers`, the names of the
administrators who receive a setup request, when some problem is not the caller's to fix.

The shell mirrors the registry in `composables/useCitas.js` `SETUP_SECTIONS` (code →
`{label, section}`): «Poner horario», «Elegir días de descanso», «Prender citas en línea»,
«Publicar servicios». `constraintActions` (`useAgenda.js`) maps the same codes to `set_up`, and
`not_installed` to `retry`. Nothing else branches on a problem code.

## The gate («Nueva cita»)

`components/agenda/AgendaCitaForm.vue`: one row per problem with its button when `can_fix`;
tapping it emits `open-settings` with the section and Agenda opens the settings sheet there.
When a problem is not the user's to fix, the gate says who can («{0} puede configurarlo») and
offers «Pedir que lo configuren», the same setup request Gastos de empleados uses
(`ClaimGuard` → `doco.workspaces.claims.request_setup`, `what="citas"`): the administrators get
one ToDo in Pendientes. «Reintentar» stays only for a failed load or `not_installed`.

## The settings sheet

`components/agenda/AgendaCitasSettings.vue` takes a `section` prop and, once loaded, scrolls to
and focuses the fieldset whose `data-section` lists it (`hours scheduling`, `rest_days`,
`services`). The problem list at the top offers the same buttons.

«Servicios» shows the booking shop (the Storefront Profile with «Agendar» on, else the first
enabled one), its service group (an Item Group select; choosing one previews the items under it)
and a switch per item for `Item.publish_on_web`. It saves with its own «Guardar servicios»
(`doco.citas.api.services_save`, idempotent) because the sheet's «Guardar» requires valid hours
and writes other DocTypes; publishing services must not wait on the schedule. After the save the
sheet reloads its problems and emits `saved`; when it was opened from the gate and nothing is
missing any more, Agenda closes it and reopens «Nueva cita».

APIs: `services_get(group=None)` → `{profile: {name, label, on}, group, groups, items:
[{id, label, published}], can_fix}`; `services_save({group, published})` → the same payload.

## Ways in

- `/crm/agenda?settings=citas[&section=<section>]` opens the sheet (Taller's «Configurar citas
  en línea» in its public tracking settings links here).
- The cita panel's «Reagendar» shows the server's refusal or the setup problems instead of «No
  free times» when `options()` cannot offer slots.

Tests: `doco/citas/test_citas_setup.py` (registry, services API, permission, idempotence,
profile fallback); crm `tests/unit/citas.test.js` and `tests/unit/agendaCitaGate.test.js`.
