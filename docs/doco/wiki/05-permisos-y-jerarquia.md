# 05 — Permisos, jerarquía de ventas y sucursales

> Verificado leyendo `crm/permissions/org_hierarchy.py` completo, su diff contra
> el merge-base, `crm/hooks.py`, y `doco_marketing/custom_fields.py`. Estado:
> `261195f4`.

---

## 1. Qué cambia el fork

Upstream trae un modelo de visibilidad por **jerarquía de ventas** sobre CRM
Lead y CRM Deal. El fork lo extiende en exactamente dos puntos:

1. **CRM Call Log entra al modelo.** `crm/hooks.py` registra el doctype en
   `permission_query_conditions` y en `has_permission`. Las llamadas ya no son
   visibles para todos: se filtran por los mismos criterios que leads y deals,
   con dos campos de propietario (`caller`, `receiver`) en lugar de uno.
2. **Poza compartida por sucursal.** Si existe el campo personalizado
   `doco_shop`, pertenecer a una sucursal amplía la visibilidad a **todos** los
   registros de esa sucursal.

`_OWNER_FIELD` (singular, un campo por doctype) pasó a `_OWNER_FIELDS`
(tupla), que es lo que permite los dos campos del Call Log.

> **Compatibilidad**: en una instalación de `crm` pelona, el campo `doco_shop`
> no existe, `_shop_names()` devuelve `()`, y el comportamiento es
> **byte-idéntico a upstream**. La extensión de sucursal sólo se activa cuando
> `doco_marketing` está instalado.

---

## 2. El orden de evaluación (la regla real)

Esto es lo que corre en `_permission_query_conditions`
(`org_hierarchy.py:43-98`), en orden. El primer corte que aplica gana:

| # | Condición | Resultado |
|---|---|---|
| 1 | `user == "Administrator"` | ve todo (`""` = sin filtro) |
| 2 | Rol **System Manager** | ve todo |
| 3 | Rol **Sales Manager** y **fuera del árbol** | ve todo |
| 4 | Está **en el árbol** | lo suyo + lo de su subárbol (por propietario **o** por asignación ToDo) |
| 5 | Cualquier otro (Sales User) | sólo lo suyo + lo asignado directamente a él |
| — | **Además**, en 4 y 5 | se **suma** (OR) todo lo de sus sucursales |

Dos consecuencias que sorprenden y son intencionales:

- **Un Sales Manager que no está en el árbol ve TODO.** Meter a un gerente al
  árbol es lo que lo *restringe* a su subárbol. Si un gerente "de pronto dejó de
  ver cuentas", casi seguro alguien lo agregó a la jerarquía.
- **La jerarquía sólo aplica si está encendida.** El disparador exacto es
  `in_tree = hierarchy_enabled() and _in_hierarchy(user)`
  (`org_hierarchy.py:54`), donde `hierarchy_enabled()` lee
  `FCRM Settings.enable_sales_hierarchy` (Single). Con la bandera **apagada**,
  **todos** los Sales Manager ven todo; con la bandera **encendida**, sólo los
  que no tienen nodo en `CRM Sales Hierarchy`.
- **Crear siempre se permite**: `ptype == "create"` devuelve `True` sin más
  (`org_hierarchy.py:127`).

`_has_permission` (a nivel documento) sigue exactamente los mismos cortes, con
dos añadidos: `ptype == "create"` siempre pasa, y un documento sin `name`
(todavía sin guardar) siempre pasa.

---

## 3. La jerarquía de ventas

- Doctype: **`CRM Sales Hierarchy`** — un árbol anidado (`lft` / `rgt`) con un
  campo `user`.
- Interruptor: **`FCRM Settings.enable_sales_hierarchy`**.
- "Está en el árbol" = `frappe.db.exists("CRM Sales Hierarchy", {"user": user})`.
- "Mi subárbol" = `_team_mem_query` — auto-join del doctype consigo mismo:
  todos los miembros cuyo `lft` cae entre el `lft` y el `rgt` del gerente. Nota
  que el rango **incluye al propio gerente**.

La regla de visibilidad para alguien en el árbol es la unión de:

```
(propietario == yo)                              OR
(propietario ∈ mi subárbol)                      OR
(existe ToDo no cancelado asignado a mí)         OR
(existe ToDo no cancelado asignado a mi subárbol)
```

**Los ToDo cancelados no cuentan** (`Todo.status != "Cancelled"`), en ambos
casos.

Para el **CRM Call Log**, "propietario" son dos campos: la condición se expande
a `caller == yo OR receiver == yo` (y lo equivalente con el subárbol). Es decir,
ves una llamada si la hiciste **o** si la recibiste.

### 3.1 Estado de `docs/user-hierarchy.md`

La guía de usuario existente
([`../../user-hierarchy.md`](../../user-hierarchy.md)) describe la **UI** de
Settings → User Hierarchy: activar, agregar usuarios, arrastrar para reordenar,
quitar con o sin reportes, buscar, y "sólo administradores pueden editar".

Sigue siendo correcta en lo que describe, con **dos precisiones** que el código
añade y ella no menciona:

- Dice "Sales Managers ven leads y deals de sí mismos y de quien esté debajo".
  Cierto **sólo si el gerente está en el árbol**. Un Sales Manager fuera del
  árbol ve todo, sin restricción.
- No menciona **CRM Call Log** (que el fork sí incluye) ni la **poza por
  sucursal** (que puede ampliar la visibilidad más allá del árbol).

No la contradice el código en ningún punto — sólo está incompleta respecto al
fork.

---

## 4. Sucursales (la poza compartida)

El modelo mental es el **mostrador de tienda**: cualquier empleado de la
sucursal contesta a quien llega, sin importar de quién sea el registro.

| Pieza | Dónde vive | Qué es |
|---|---|---|
| Doctype `Social Shop` | `doco_marketing/marketing/doctype/social_shop` | la sucursal |
| Campo `doco_shop` (label **Sucursal**) | `doco_marketing/custom_fields.py` | Link → Social Shop, con `search_index` |
| Vínculo usuario↔sucursal | **User Permission** (`allow="Social Shop"`) | las mismas filas que Frappe core ya aplica |
| Alta del vínculo | `doco_marketing.api.social.assign_employee(user, shop)` | y `services/social/shops.py:184` |

`doco_shop` se instala sobre: **CRM Lead**, **CRM Deal**, **CRM Call Log**,
**WhatsApp Account** y **Laboratorio**.

`_shop_names(user, doctype)` está decorado con `@request_cache`, así que la
consulta de User Permission corre una vez por request, no por fila. Si el
doctype no tiene el campo, devuelve `()` y no se añade nada a la condición.

### 4.1 Dos mecanismos, no uno — esto es lo que confunde

Es fácil leer `org_hierarchy.py` y concluir que la sucursal sólo amplía. Esa
lectura está incompleta, porque hay **dos** piezas actuando:

| Pieza | Efecto | Dónde |
|---|---|---|
| El `OR` del fork | **Amplía**: además de lo tuyo, ves todo lo de tus sucursales | `org_hierarchy.py:94-97` |
| El User Permission de Frappe core | **Restringe**: te limita a los registros de esas sucursales | núcleo de Frappe |

La restricción existe porque `assign_employee` escribe la fila de User
Permission con **`apply_to_all_doctypes=1`**
(`doco_marketing/services/social/shops.py:184-198`). Frappe core aplica esa
restricción por su cuenta, antes y aparte de la condición de este fork.

Resultado neto para un usuario **con** sucursal asignada: ve los registros de
sus sucursales **y nada de otras**, aunque el `OR` por sí solo sólo sumara. Para
un usuario **sin** sucursal asignada no hay filas de User Permission y no pasa
nada — sigue con jerarquía pura.

### 4.2 Trampa de nombres

Los doctypes de social (**Social Post**, **Social Recurring Rule**,
**Social Channel Insight**) usan un campo llamado **`shop`**, no `doco_shop`
(`doco_marketing/marketing_perms.py:151`). Si buscas `doco_shop` a lo ancho del
código vas a creer que esos doctypes no tienen dimensión de sucursal, y sí la
tienen.

---

## 5. Compuertas de gerente en reportes

La compuerta de rol para las superficies de gerencia **no está en este repo**.
Los endpoints viven en `doco_marketing` y usan
`frappe.only_for(["System Manager", "Sales Manager"])`:

| Superficie de la SPA | Endpoint | Compuerta |
|---|---|---|
| Analítica por agente (`components/doco/ReportsAgents.vue`) | `doco_marketing.api.agent_metrics.get_agent_metrics` | manager |
| Carga de trabajo (`pages/WorkloadView.vue`) | `doco_marketing.api.workload.get_workload`, `reassign_bulk` | manager |
| Backtest de score (`components/doco/ScoreBacktest.vue`) | `doco_marketing.api.score_backtest.get_backtest` | manager |
| Notas de coaching (`components/doco/inbox/CoachingPanel.vue`) | `doco_marketing.api.coaching.list_notes` / `add_note` / `delete_note` | manager |

Los cuatro usan exactamente `["System Manager", "Sales Manager"]`, verificado en
`doco_marketing/api/agent_metrics.py:24`, `workload.py:30`,
`score_backtest.py:189` y `coaching.py:25`.

> **"Gerente" significa dos cosas distintas según el módulo.** No generalices.
> `doco_marketing/api/reports.py` **no** usa `only_for`: usa `require_manager()`
> (`services/auth.py:12-16`), cuyo `_MANAGER_ROLES` **sí admite Marketing
> Manager**. Y `agent_metrics.py:5-6` comenta que excluye a Marketing Manager
> **a propósito**.
>
> O sea: un Marketing Manager puede abrir **Reportes** pero **no** la analítica
> por agente, ni workload, ni coaching, ni el backtest. Es intencional, no un
> descuido.

El patrón de UI acordado: el backend responde **403** y el componente muestra el
mismo banner "solo gerentes" que usa `pages/Reports.vue`; el panel de coaching
va más lejos y **se oculta por completo** en vez de mostrar una caja vacía, para
que el agente coacheado no sepa que existe.

### 5.1 La compuerta de revisión SÍ es una compuerta de gerente (desde 2026-08-03)

Política "ojos de gerente" (Marco, 2026-08-03): las colas de aprobación de
WhatsApp separan **ver** de **actuar**. Los cuatro roles (System Manager, Sales
Manager, Marketing Manager, Sales User) siguen viendo la cola, pero
**aprobar / rechazar / reintentar / descartar es solo de gerencia**
(`_APPROVER_ROLES` = System / Sales / Marketing Manager) — un agente normal ya
no puede soltar un envío a cliente. Detalle completo y los cuatro sitios de
guardia: `02-whatsapp-plantillas-y-envios.md` §4.4.

Del lado de este repo, `crm/api/dashboard.py` (+53 −56) añade
`get_total_repair_orders`, un mosaico del dashboard que **degrada a cero** en
vez de tirar un 500 cuando `Repair Order` no existe (tenants sin taller). El
resto del diff en ese archivo es limpieza de comentarios.

---

## 6. Roles

El fork **no crea roles nuevos**. Usa los de upstream:

- **System Manager** — sin restricción.
- **Sales Manager** — sin restricción salvo que esté en el árbol.
- **Sales User** — sólo lo suyo, lo asignado y lo de sus sucursales.

Lo único que hace el fork con roles es `add_roles()`
(`crm/api/whatsapp.py:703-716`): si `frappe_whatsapp` está instalado, otorga a
**Sales Manager** y **Sales User** permisos de write/create/delete/share sobre
`WhatsApp Message`, `WhatsApp Templates` y `WhatsApp Settings`, saltándose las
filas de `Custom DocPerm` que ya existan. No crea roles.

---

## 7. Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| Un gerente "dejó de ver" cuentas | Lo agregaron al árbol de jerarquía; ahora sólo ve su subárbol |
| Un agente ve registros que no son suyos | Está asignado a una sucursal cuya poza incluye esos registros |
| Nadie ve llamadas de nadie más | Correcto: el fork mete CRM Call Log al modelo; sólo `caller`/`receiver` y subárbol/sucursal |
| Un registro asignado no aparece | El ToDo está en estado `Cancelled` — no cuenta |
| La sucursal no filtra nada | `doco_marketing` no instalado, o el usuario no tiene User Permission con `allow="Social Shop"` |
| Cambió la sucursal de alguien y no surtió efecto en el mismo request | `_shop_names` está cacheado por request |
</content>
