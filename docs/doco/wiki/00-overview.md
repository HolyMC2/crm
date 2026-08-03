# 00 — Qué es este fork

> Wiki de **realidad del fork**, no de Frappe CRM upstream. Todo lo que aparece
> aquí está verificado contra el código de la rama `doco-dev` en el estado
> `261195f4` (2026-07-27). Cuando algo no se pudo verificar leyendo código, va
> marcado **TODO-VERIFY** en lugar de adivinarse.
>
> Convención de citas: `crm/api/whatsapp.py:120` = ruta relativa a la raíz del
> repo. Rutas de otras apps llevan el nombre de la app al frente
> (`doco_marketing/api/inbox.py`).

---

## 1. Identidad del repo

| | |
|---|---|
| Repo | `git@github.com:HolyMC2/crm.git` (`origin`) |
| Upstream | `https://github.com/frappe/crm.git` (`upstream`) |
| Rama de trabajo | `doco-dev` |
| Base de fork (merge-base) | `91996b8f62241a60a83640f6bfa3bcfd393dca1d` |
| Commits propios sobre upstream | **298** (2026-03-22 → 2026-07-27) |
| Archivos tocados vs. merge-base | 213 |
| `app_name` | `crm` — sigue siendo la app de Frappe CRM; **no** se renombró |
| Versión declarada | `2.0.0-dev` (`crm/__init__.py`) |
| SPA | Vue 3 + frappe-ui, se sirve en `/crm` |

El fork **no** cambia el nombre de la app ni el doctype base. Un bench con este
fork instalado sigue viendo "Frappe CRM" en la pantalla de apps
(`crm/hooks.py:15-23`). Lo que cambia es todo lo que hay dentro.

---

## 2. La regla más importante: dónde vive cada cosa

Este fork es **la capa de presentación** de un stack de cuatro apps. La mayoría
de la lógica de negocio que el usuario percibe como "el CRM" **no está en este
repo**. La SPA llama 145 endpoints distintos de `doco_marketing` y sólo unos
pocos propios.

```
                 ┌──────────────────────────────────────────┐
   Navegador ──► │  crm/frontend  (este repo — la SPA)      │
                 └───────────────┬──────────────────────────┘
                                 │ llamadas whitelisted
   ┌──────────┬──────────────────┼───────────────┬──────────────────┐
   ▼          ▼                  ▼               ▼                  ▼
┌────────┐ ┌──────────────┐ ┌────────┐ ┌────────────────┐ ┌──────────────┐
│crm (py)│ │doco_marketing│ │ taller │ │ whatsapp_chat  │ │     doco     │
│este rep│ │  app hermana │ │hermana │ │    hermana     │ │   hermana    │
└────────┘ └──────────────┘ └────────┘ └────────────────┘ └──────────────┘
 Telefonía   Inbox, colas,   Órdenes de  Contactos WA de   Sync de cliente
 Permisos    SLA, social,    reparación, un deal (tira de  a ERPNext,
 Envío WA    campañas,       facturación pestañas)         certificado QZ
 Procedencia cadencias,      taller,
 Enrutamiento reportes,      impresión
              scoring, push
```

**Reparto real, medido** (`grep` de endpoints en `frontend/src`):

| App | Endpoints distintos llamados desde la SPA | Qué le toca |
|---|---|---|
| `doco_marketing` | **145** | Inbox omnicanal, cola de conversaciones, SLA, etiquetas, snooze, presencia, catálogo, campañas, chatflows, cadencias, social (calendario/menciones/evergreen), reportes, scoring, workload, coaching, dedupe, push, telemetría, review queue |
| `crm` (este repo) | ~35 | Telefonía Twilio/SIP, permisos y jerarquía, creación de mensajes WhatsApp, plantillas, procedencia, enrutamiento entrante, doctypes CRM Lead/Deal/Call Log |
| `taller` | 7 | Órdenes de reparación dentro del deal, ticket de impresión, config de vertical, documento de facturación |
| `doco` | 6 | Sincronía de contactos del deal a Customer de ERPNext, defaults de dirección de la compañía, certificado y firma de QZ Tray |
| `whatsapp_chat` | 1 | `get_deal_whatsapp_contacts` — la tira de pestañas por número |

**Consecuencia práctica**: si un comportamiento del inbox está mal, en el 80 %
de los casos el arreglo **no** está en este repo. Ver el mapa de endpoints por
área en cada documento de esta wiki.

---

## 3. Delta vs. upstream — de un vistazo

### 3.1 Lo que el fork añade (archivos nuevos, no pueden dar conflicto)

- **Python**: `crm/api/whatsapp_routing.py`, el patch de procedencia
  `crm/patches/v1_0/create_message_provenance_fields.py`, y tres módulos de
  prueba (`test_whatsapp_routing.py`, `test_conversation_enrich.py`, y las
  ampliaciones a `test_whatsapp.py` / `test_integrations.py`).
- **Frontend**: 18 páginas nuevas (`src/pages/*View.vue`, `Inbox.vue`,
  `Deal360.vue`, `Reports.vue`, `Social*.vue`, `Campaigns.vue`, `Chatflows.vue`,
  `ScoreRules.vue`, `WorkloadView.vue`, `Webshop.vue`, …), 49 componentes bajo
  `src/components/doco/`, 14 composables, el canal Messenger
  (`Activities/MessengerArea.vue`, `MessengerBox.vue`), y 18 utilidades puras
  nuevas bajo `src/utils/`.
- **Pruebas frontend**: 32 archivos vitest en `frontend/tests/unit/` y 7 specs
  Playwright en `frontend/tests/social/` — upstream no traía ninguna.

### 3.2 Lo que el fork modifica de upstream

61 archivos preexistentes. El ledger vive en
[`../UPSTREAM_TOUCHES.md`](../UPSTREAM_TOUCHES.md) y es la lista que se revisa
en cada rebase — **no dupliques esa tabla aquí**. Los diez de mayor riesgo:

| Archivo | Δ | Por qué |
|---|---|---|
| `frontend/src/components/Activities/WhatsAppBox.vue` | +728 −13 | Compositor: notas de voz, cámara, borrador, respuestas sugeridas, chip de plantilla |
| `frontend/src/components/Activities/Activities.vue` | +628 −20 | Pestañas por canal + slots doco |
| `crm/api/whatsapp.py` | +384 −51 | Procedencia, enrutamiento, ruta de envío con revisión, medios |
| `frontend/src/components/Mobile/MobileSidebar.vue` | +308 −88 | Rediseño del cajón móvil |
| `frontend/src/components/Activities/WhatsAppArea.vue` | +269 −36 | Burbujas, procedencia, medios diferidos |
| `frontend/src/components/Modals/DealModal.vue` | +243 −12 | Campos de captura doco + validaciones |
| `frontend/src/index.css` | +138 | Variables `--brand`, utilidades de animación/press |
| `frontend/src/router.js` | +118 −24 | Rutas doco + cambio de landing |
| `frontend/src/utils/dialogs.jsx` | +106 −1 | `confirmDialog` / `inputDialog` |
| `crm/integrations/twilio/twilio_handler.py` | +103 −17 | Enrutamiento SIP / timbrado paralelo |

### 3.3 Ganchos de servidor que el fork añade

`crm/hooks.py` (+2 líneas) registra **CRM Call Log** en el modelo de permisos
por jerarquía, que upstream sólo aplica a Lead y Deal:

```python
permission_query_conditions = {
    "CRM Lead": "crm.permissions.org_hierarchy.get_lead_permission_query_conditions",
    "CRM Deal": "crm.permissions.org_hierarchy.get_deal_permission_query_conditions",
    "CRM Call Log": "crm.permissions.org_hierarchy.get_call_log_permission_query_conditions",  # fork
}
has_permission = {
    ...
    "CRM Call Log": "crm.permissions.org_hierarchy.has_call_log_permission",  # fork
}
```

`crm/patches.txt` (+2) añade `crm.patches.v1_0.create_message_provenance_fields`
al final — el patch que crea los campos de procedencia de mensajes.

`crm/fcrm/doctype/fcrm_settings/fcrm_settings.json` (+9 −1) añade un campo
oculto `quick_replies` (Long Text, JSON) donde se guardan las respuestas rápidas
compartidas del equipo, administradas desde el compositor de WhatsApp de la SPA.

`crm/api/doc.py` (+3) añade el parámetro `or_filters` a `get_data`, que las
vistas de lista del fork usan para filtros OR.

---

## 4. Historia del fork en una tabla

Recuento por área (`git log --format='%s' 91996b8f..HEAD`):

| Área | Commits | Qué se construyó |
|---|---|---|
| `inbox` | 106 (75 feat, 31 fix) | El inbox omnicanal — la superficie estrella |
| `doco` / `crm` / `fcrm` | ~50 | Rediseño de vistas, campos de captura, verticales |
| `social` | 27 | Calendario social, compositor IA, menciones, evergreen |
| `mobile` / `pwa` / `shell` | 16 | PWA, barra inferior, gestos, push, offline |
| `whatsapp` | 15 | Plantillas, notas de voz, cámara, procedencia |
| `reports` / `team` | 6 | Reportes, analítica por agente, workload, coaching |
| `telephony` / `twilio` | 2 | SIP, timbrado paralelo, arranque del Device |

Las tres olas grandes, en orden:

1. **Marzo–junio 2026** — verticales: Repair Order dentro del deal, pipeline,
   captura de cliente, telefonía SIP.
2. **Julio 2026 (P0/P1)** — el inbox: cola de conversaciones, SLA, workspaces,
   catálogo, sales docs, bitácora; luego la ola móvil/PWA (barra inferior,
   gestos, caché de cola, push, outbox offline).
3. **Julio 2026 (P2, semana del 26)** — profundidad: búsqueda global, resumen y
   chips de intención con IA, cadencias 1:1, dedupe + fusión, notas de coaching,
   telemetría, backtest de scoring, workload, pase de accesibilidad; y en
   paralelo la suite social W6.

---

## 5. Mapa de esta wiki

| Doc | Cubre | Público |
|---|---|---|
| `00-overview.md` | este documento | todos |
| `01-inbox-conversaciones.md` | El inbox omnicanal: cola, workspaces, hilo, panel de contexto | agentes de venta |
| `02-whatsapp-plantillas-y-envios.md` | Canal WhatsApp, plantillas WABA, la compuerta de revisión | agentes + admin |
| `03-enrutamiento-y-procedencia.md` | Cómo un mensaje entrante encuentra su deal; campos de procedencia; duplicados | admin |
| `04-telefonia.md` | Twilio + SIP: configuración, enrutamiento de llamadas, bitácora | admin |
| `05-permisos-y-jerarquia.md` | Roles, jerarquía de ventas, alcance por sucursal, compuertas de gerente | admin |
| `06-social-campanas-y-cadencias.md` | Calendario social, campañas, chatflows, cadencias 1:1 | marketing |
| `07-reportes-y-scoring.md` | Reportes, analítica por agente, reglas de score y backtest, workload | gerentes |
| `08-frontend-rediseno.md` | Rutas, shell, móvil, PWA, tematización — notas de la SPA | devs |
| `09-ops-y-despliegue.md` | Build, pruebas, despliegue del bundle, trampas conocidas | ops |

Documentos hermanos que **no** son wiki y siguen vigentes:

- [`../FCRM_EXCELLENCE_SPEC.md`](../FCRM_EXCELLENCE_SPEC.md) — el plan
  (P0/P1/P2). Es *intención*, no estado. Léelo para saber a dónde va, no para
  saber qué existe.
- [`../P2_WORKPLAN.md`](../P2_WORKPLAN.md) — definiciones vinculantes de las 19
  slices de P2, incluidas las reglas para agentes en paralelo.
- [`../UPSTREAM_TOUCHES.md`](../UPSTREAM_TOUCHES.md) — el ledger de rebase.
- [`../../user-hierarchy.md`](../../user-hierarchy.md) — guía de usuario de la
  jerarquía de ventas (ver `05-permisos-y-jerarquia.md` para su estado).

---

## 6. Reglas que este fork se impone a sí mismo

Verificadas en el código y en las reglas de `P2_WORKPLAN.md`; se documentan aquí
porque explican decisiones que de otro modo parecen arbitrarias.

1. **Ningún envío automático.** Todo mensaje generado por automatización o IA
   pasa por una fila de revisión humana (`WhatsApp Send Review`, estado
   Pendiente, `auto=0`). Es un no-goal explícito del spec y se respeta en cada
   servicio que encola mensajes. Ver `02-whatsapp-plantillas-y-envios.md`.
2. **Los endpoints whitelisted verifican permisos.** `doc.check_permission(...)`
   — `has_permission(throw=)` ya no existe en frappe16 — más listas blancas de
   doctype. Nada de `frappe.db.get_value` desnudo sobre nombres provistos por el
   cliente (lección de la auditoría IDOR).
3. **Texto del cliente siempre interpolado, nunca `v-html`.**
4. **Sólo tokens de frappe-ui** (`ink-*` / `surface-*` / `outline-*`), porque
   cada color debe funcionar en modo oscuro.
5. **es-MX vía `__()`.** Las cadenas de UI se traducen; el catálogo es
   `crm/locale/es.po` (+80 líneas en el fork).
6. **Móvil primero**: ≤640 px no debe hacer scroll lateral.
7. **Las pruebas son parte de la definición de terminado** — lógica pura nueva
   lleva vitest.

---

## 7. Estado y huecos conocidos

- **`docs/doco/` sólo contenía specs y planes de trabajo** antes de esta wiki.
  No existía documentación de producto ni de operación.
- El ledger `UPSTREAM_TOUCHES.md` estaba desfasado un día respecto a HEAD; se
  actualizó junto con esta wiki (ver su encabezado "Last regenerated").
- Áreas donde la SPA llama endpoints que viven en `doco_marketing`: la wiki los
  nombra pero **no** documenta su implementación interna. Esa app necesita su
  propia wiki.
</content>
