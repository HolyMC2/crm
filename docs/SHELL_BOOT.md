# Shell boot: one call, every module answers

`crm.api.shell.boot` is the one call the Muelle shell makes when it opens. It returns the
worker's identity, locale, palette, saved layout and one entry per module under `modules`.
Each module has a builder (`_contactos`, `_ventas`, ... and the `muelle_shell_modules` hooks of
other apps) that reports what this worker can do there. Builders report; they never grant.
Every module route and API checks its own permissions on every request.

## One entry per module

`modules[key]` is a tagged union on `state`:

| `state` | Meaning | Who said so |
| --- | --- | --- |
| `ready` | The worker can open it. `enabled` is true. | The builder |
| `off` | Not here, or not for this worker. `reason` says why. | The builder |
| `unavailable` | The builder raised. The tile stays, with the reason and a way out. | The shell |

Every entry carries:

- `key`, `state`, `enabled` (`state == "ready"`; what the pages read today)
- `reason_code`: `permission`, `missing_app`, `error`, or the builder's own; null when ready
- `reason_text`: the reason in the worker's words (`reason` is its alias for the pages that read it)
- `resolve`: `{label, route}` or null
- `retry`: true when a new boot may fix it (the tile offers «Reintentar»)
- `capabilities`: the builder's; `{}` when unavailable

An `unavailable` entry also carries `detail` (the error, for admins only), and the error is in
Error Log under «shell boot <key>».

A hook provider of another app (`muelle_shell_modules`) is keyed by the `key` it returns, like
the built-ins. When it raises before it can say its key, the tile is named after its function
(`doco.taller.shell._taller` → `taller`). That name is a fallback, not an identity: two hooks
whose functions share a name (`doco.taller.shell._shell`, `mercado.shell._shell`) both boot.

## Why a builder never takes the shell down

Before 2026-10-25 a Contactos builder that raised (one bad tenant setting was enough) killed the
whole boot, and a builder that raised `PermissionError` dropped its module with no reason. Now
`_entry` isolates each builder: a raising builder becomes an `unavailable` entry for its key
alone and the other modules load. The reason comes from the error class:

| Error | `reason_code` | `retry` | Reason text |
| --- | --- | --- | --- |
| `frappe.PermissionError` | `permission` | yes | «No tienes acceso a <módulo>. Pídele acceso a <dueño> y vuelve a intentar.» |
| `ImportError` | `missing_app` | no | «Esta tienda aún no tiene <módulo>. Pide a soporte que actualice la aplicación.» |
| anything else | `error` | yes | «No se pudo cargar <módulo>. Vuelve a intentar; si sigue igual, avisa a soporte.» |

Only the builders are isolated. An error in the boot endpoint's own code (identity, palette,
saved layout) still raises, so a broken shell is never hidden behind a half-empty one.

`first_module` (where `/crm` opens) uses the same isolation, so a raising builder is skipped
instead of breaking the page render.

Tests: `crm/tests/test_shell_boot.py` (the contract) and
`crm/tests/test_shell_boot_resilience.py` (raising builders).
