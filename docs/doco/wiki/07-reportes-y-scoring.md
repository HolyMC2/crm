# 07 — Reportes, scoring y carga de trabajo

> Para gerentes. Verificado leyendo `frontend/src/pages/Reports.vue`,
> `ScoreRules.vue`, `WorkloadView.vue`, `PipelineAnalysis.vue`, `Webshop.vue`,
> `components/doco/ReportsAgents.vue`, `ScoreBacktest.vue`,
> `ScoreExplainPopover.vue` y sus utilidades puras. Estado: `261195f4`.
>
> Todas estas superficies son **nuevas en el fork** — upstream no tiene
> equivalente. El cálculo vive en `doco_marketing`; aquí está la presentación.

---

## 1. Reportes (`/reports`)

Encabezado **"Reportes"** con filtro de periodo. Datos de
`doco_marketing.api.reports.*`, que a su vez **reutiliza `crm.api.dashboard.*`**
en vez de duplicar el cálculo.

### 1.1 Tarjetas KPI

**"Leads captados"** · **"Deals ganados"** · **"Conversión"** ·
**"Grado promedio"**.

### 1.2 Secciones

| Sección | Endpoint | Qué muestra |
|---|---|---|
| **"Embudo de conversión"** | `reports.get_funnel_data` | etapas y caída; vacío → *"Sin datos"* |
| **"Distribución de score"** | `score_rules.get_score_distribution` | cuántos leads por grado |
| **"Atribución por campaña"** | `reports.get_campaign_attribution` | Campaña · Leads · Ganados · Conv% · Ingresos |
| **"ROI por campaña"** | `reports.get_campaign_roi` | Campaña · **Inscr.** (enrolamientos del periodo) · **Enviados** · **Fall.** (fallidos + omitidos) · **Tocados** (contactos con al menos un touchpoint) · **Gan.** (deals ganados atribuidos) · Conv. · Ingresos |
| **"Salud de envíos (7 días)"** | `reports.dispatch_health` | incluye **"Diferidos (siguen pendientes)"** y **"Principales motivos de fallo/omisión"** |
| **"Flujos de bot (chatflows)"** | `reports.get_flow_analytics` | rendimiento por flujo |
| Desglose por fuente | `reports.get_lead_source_breakdown` | de dónde vienen los leads |
| **Analítica por agente** | `agent_metrics.get_agent_metrics` | ver §2 |

Las abreviaturas de las columnas llevan `title` con la explicación completa —
"Inscr." es "Enrolamientos en el periodo", "Fall." es "Fallidos + omitidos", y
así.

---

## 2. Analítica por agente

`components/doco/ReportsAgents.vue`, montado dentro de Reportes.

Columnas: **Agente** · **Abiertos** · **Ganados** · **Valor ganado** ·
**Resp. mediana** (tiempo mediano de primera respuesta). En escritorio es tabla,
en móvil (≤640 px) son tarjetas apiladas. El ordenamiento es del lado del
cliente.

**Está limitado a gerentes**: el backend devuelve 403 y el componente pinta el
banner "solo gerentes" en vez de datos. Sin actividad en el periodo:
*"Sin actividad en el periodo"*.

> Advertencia honesta que el propio workplan impuso: los mensajes de WhatsApp no
> llevan `owner`, así que las métricas se construyen sobre la **atribución del
> deal/lead**, no sobre "quién tecleó cada mensaje". Cada número lleva su
> docstring explicando qué mide. **No inventes precisión** al leerlos.

---

## 3. Análisis de pipeline (`/pipeline-analysis`)

Embudo por etapa con caída y KPIs, con filtro de periodo. Reutiliza
`doco_marketing.api.reports.get_funnel_data` (que a su vez llama al embudo del
CRM) más `crm.api.dashboard.get_average_time_to_close_a_deal`.

Es una **vista sobre los leads**: la miga de pan arranca con "← Leads".

---

## 4. Reglas de score (`/score-rules`)

**"Reglas de Score"** — ABM de `Lead Scoring Rule` más vista previa en vivo y
distribución. Datos de `doco_marketing.api.score_rules.*` y un
`createListResource('Lead Scoring Rule')`.

### 4.1 Cómo se ve una regla

Formulario de alta: **"Nombre"** · **"Campo (p.ej. source)"** · **"Valor"** ·
**"Pts"** → **"Crear"**. Lista con borrado confirmado
(*"¿Eliminar esta regla?"*). Sin reglas: *"Sin reglas"*.

### 4.2 Vista previa

**"Vista previa"** recalcula sobre una muestra **sin persistir nada**
(`score_rules.preview_scores`) — permite ver el efecto de un cambio antes de
comprometerlo.

### 4.3 Distribución

**"Distribución"** muestra cuántos leads caen en cada grado con las reglas
actuales.

---

## 5. Backtest de score

`components/doco/ScoreBacktest.vue`, montado bajo la distribución en Reglas de
Score. La pregunta que responde: **¿los leads mejor calificados de verdad
cierran más?**

- **Titular de lift**: *"Los leads A cierran **N×** más que los D"*. Si no hay
  suficientes cierres: *"Aún no hay suficientes cierres para comparar A vs D."*
- **"Cierre por grado"** — ganados/leads por grado A-D.
- **"Score prom. ganados"** vs **perdidos**.
- **"Por mes"** — cohortes mensuales por fecha de creación del lead. Vacío:
  *"Sin leads en el periodo"*.
- Selector de meses (3/6/12).

Sin permiso: *"El backtest de score requiere permiso de gerente."*

### 5.1 Limitación que hay que conocer

El backtest usa el **`lead_score` almacenado actualmente**, no el que el lead
tenía cuando se creó — el log de score no guarda una foto por lead en el tiempo.
La respuesta del backend lo declara con `score_basis: "current"`. Léelo como
tendencia, no como prueba causal.

Igualmente, la definición de "convertido" (bandera `converted` del lead **o**
un CRM Deal ligado en estado tipo Won) fue una elección deliberada, documentada
en el endpoint.

---

## 6. Score explicable

`components/doco/ScoreExplainPopover.vue` — el popover **"por qué B·62"** que
sale desde el chip de grado en la cabecera de la conversación y desde la celda de
score en la lista de leads.

Muestra el puntaje y grado actuales más las contribuciones por regla (etiqueta,
puntos, número de veces que pegó, último impacto), ordenadas por valor absoluto
de puntos, tope 15 filas. Para un Deal, resuelve primero su lead ligado.

Endpoint: `doco_marketing.api.score_explain.get_score_breakdown`.

Existe por una razón concreta: **los agentes no confían en un número que no
pueden leer.**

---

## 7. Carga de trabajo (`/workload`)

Superficie de gerente. Responde: ¿quién está ahogado y quién puede tomar más?

- Tarjetas/filas por agente con **barra de carga contra su cap** de
  auto-asignación, badge **"sobre cap"** y **"Conversaciones con SLA vencido"**.
- Encabezados: **"Agentes"** · **"Sin asignar"** · **"Sobre cap"** ·
  **"Actualizar"**.
- Tabla en escritorio: **Agente** · **Abiertas** · **Deals** · **Leads** ·
  **SLA**.
- Tocar un agente lista sus conversaciones; se seleccionan
  (**"Seleccionar todo"** / **"Quitar selección"**, con contador
  "N seleccionadas") y se reasignan con **"Reasignar a…"**.
- Estados: *"Cargando…"*, *"Nadie en la rotación"*, *"Sin conversaciones"*,
  *"No se pudo reasignar"*.

Endpoints: `doco_marketing.api.workload.get_workload` y `reassign_bulk`, ambos
limitados a **System Manager / Sales Manager**. Un no-gerente recibe
`PermissionError` y ve el banner ámbar "solo gerentes".

La reasignación cambia el campo de propietario, intercambia la asignación ToDo
(quita la vieja, agrega la nueva, ambas en modo best-effort), deja una migaja
tipo *"↔ Reasignado a X por Y"* y publica un evento realtime por registro.

Los números salen **del mismo servicio de asignación** que usa la
auto-asignación (`_open_load`, `_pool`, estados terminales) — no de una consulta
paralela.

---

## 8. Webshop (`/webshop`) — mayormente andamio

KPIs sobre el puente de tienda en línea (`storefront_bridge`): deals etiquetados
con `source_campaign = 'SO:<nombre>'`.

**Lee esta sección antes de enseñarle la página a un cliente.** De los datos que
muestra, sólo dos son reales:

| Dato | Estado |
|---|---|
| `orders_linked` | **real** |
| `revenue_via_crm` | **real** |
| `cart_abandoned` | **hard-coded a `None`** |
| `attribution_model` | **hard-coded a `'last-touch'`** |
| `get_webhook_logs` | devuelve `[]` fijo — la bitácora de webhooks **no existe** |
| `sync_now` | **no-op**; regresa una cadena de nota, no sincroniza nada |

La ruta está viva y la página pinta, pero por debajo es un andamio. Es la única
superficie del rediseño en ese estado.

---

## 9. Dashboard

`crm/api/dashboard.py` es de upstream; el fork le añade
`get_total_repair_orders`, un mosaico que **degrada a cero** cuando el doctype
`Repair Order` no existe, en vez de tumbar el dashboard entero con un 500 en un
tenant sin taller.

Desde 2026-08-03 los mosaicos **respetan la jerarquía de ventas**: los charts
construyen query-builder crudo (que se salta `permission_query_conditions`), así
que un Sales Manager dentro del árbol veía números org-wide junto a listas
acotadas a su subárbol. `_scoped_users()` resuelve `user explícito > subárbol
del gerente > sin filtro` y los 19 charts con filtro de propietario lo aplican
en ambos periodos (actual y anterior). `get_total_repair_orders` queda sin
acotar a propósito: Repair Order no tiene dimensión de propietario CRM —
decisión de producto pendiente.

---

## 10. Vistas de lista rediseñadas

Las listas nuevas (`/leads`, `/deals`, `/tasks`, `/call-logs`) conviven con las
de upstream (`/leads/view/…`). Componentes compartidos:

| Componente | Papel |
|---|---|
| `doco/BoardView.vue` | vista kanban |
| `doco/FunnelView.vue` | vista de embudo |
| `doco/ColumnPicker.vue` | elección y orden de columnas |
| `doco/leads/FilterPopover.vue` | filtros |
| `doco/DealsSearchBox.vue` | búsqueda de deals, incluida la búsqueda por reparación (`taller.api.vertical.search_deal_ids_by_repair`) |

El backend que las alimenta es `crm.api.doc.get_data`, al que el fork añadió el
parámetro **`or_filters`** para poder expresar filtros OR.

Las vistas guardadas y los layouts de columnas se persisten con llave por
usuario (prefijos `doco_leads_` / `doco_deals_`) y se barren al cerrar sesión —
ver `08-frontend-rediseno.md` §8.

---

## 11. Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| Banner "solo gerentes" | Correcto: el endpoint requiere System Manager o Sales Manager |
| El panel de backtest no aparece | Mismo motivo, o no hay cohortes con cierres |
| "Grado promedio" no cuadra con lo esperado | El backtest usa el score **actual**, no el histórico (`score_basis: "current"`) |
| El mosaico de reparaciones marca 0 | El tenant no tiene el doctype `Repair Order` — degradación deliberada |
| Las métricas por agente parecen bajas | Se calculan sobre deals/leads atribuidos, no sobre mensajes tecleados |
| Reasignar no mueve la asignación | El intercambio de ToDo es best-effort; el campo de propietario sí cambia. Revisar el ToDo |
</content>
