# Proyectos

A proyecto is a named group of pendientes with dates (Shell SPEC §7 DE7, Q6 decided as option B,
2026-11-05). The record is ERPNext's **Project**; the work is the Pendientes rows (ToDo and CRM
Task) that carry a hidden project link and a start day. There is no ERPNext Task.

## Pieces

| Where | What |
|---|---|
| `muelle/workspace/packages/shell-contracts` 0.19.0 | `proyectos` after `pendientes`: «Proyectos», `lucide-folder-kanban`, `/proyectos`, `g t`. No puesto class puts it on the phone bar; a worker adds it from «Más», the owner through «Barra por puesto». |
| `doco/proyectos/schema.py` | Hidden `doco_project` (Link Project) and `doco_start` (Date) on ToDo and CRM Task, added by `ensure_schema` on install and migrate. |
| `doco/proyectos/reglas.py` | What a pendiente's project and start must satisfy: an existing, readable, open project; a start on or before the due day. Shared by both writers. |
| `doco/proyectos/api.py` | `bootstrap`, `lista(scope, search)`, `proyecto(name)`, `crear(values, request_id)`, `actualizar(name, modified, values, request_id)`. Projects are created with `percent_complete_method = Manual`, so ERPNext never recomputes their state from Tasks it does not have. |
| `doco/pendientes/api.py` | Rows carry `project`, `project_name` and `start`; `create` and `update` take `project` and `start` (one activity line each). A project's rows come through the same reader (`_stream` with `project=`), so redaction and ownership match Pendientes. |
| `crm/api/shell.py` | `_proyectos()` provider: enabled when doco answers that the worker reads Project; capabilities `read`, `create`, `write`, `pendientes`. |
| `frontend/src/pages/Proyectos.vue` | The list: scopes En curso, En pausa, Terminados, Todos (AppBar scopes on the phone, ModuleLayout entries on desktop), search, one create door (`ProyectoSheet`). |
| `frontend/src/pages/Proyecto.vue` | One project: state chip, dates, progress bar (done over total), notes, then Lista, Tablero (`PendientesBoard`) or Cronograma (`components/proyectos/Cronograma.vue`) over the same rows. Row actions write through the Pendientes API. |
| `components/pendientes/CreateDialog.vue` | The «Proyecto» chip (open projects by name, «Quitar del proyecto») and the «Empieza» day. `prefill: {project, project_name}` from the project page. |
| `components/pendientes/PendienteDetail.vue` | The «Proyecto» row: a chip that opens the project, «Empieza el …». |

## Rules

- **Who sees what.** The module needs the Projects User role (Project read). Counts and rows of a
  project are what this person may read of its pendientes (Frappe's own ToDo rule), so an owner
  sees everything and a worker their own. A pendiente's `project_name` reads for its assignee even
  without the role: the owner named the plan and put the work in it.
- **Late** means still open past its end day. A paused or finished project is never late. The
  overdue figure is the one red thing on a row.
- **Cronograma.** One bar per dated pendiente from its start day (or its due day) to its due day,
  at least two weeks wide, with the project's own span and today's line. Undated rows are counted
  under it, never drawn. Pure numbers from `ganttModel` in `composables/useProyectos.js`, a CSS grid,
  no chart library.
- **Writes** are lock-first and idempotent (`request_id`, the Pendientes `_once`); a stale
  `modified` is refused with «El proyecto cambió».

## Proving it

- Unit: `tests/unit/proyectos.test.js` (scopes, rows, sections, the Gantt model and component).
- Python: `doco.proyectos.tests.test_api`, `doco.pendientes.tests.test_api`, `crm.tests.test_shell_boot`
  on a `lane test --profile full-retail` lease.
- Phone shots at 412 and 305 px, light and dark: the list, a project in its three views, the
  pendiente editor with the «Proyecto» chip.
