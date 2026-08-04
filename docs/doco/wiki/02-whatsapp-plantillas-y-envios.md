# 02 — WhatsApp: compositor, plantillas y la compuerta de revisión

> Verificado leyendo `crm/api/whatsapp.py` completo,
> `frontend/src/components/Activities/WhatsAppBox.vue`, y el doctype
> `WhatsApp Send Review` de `doco_marketing`. Estado: `261195f4`.

---

## 1. Quién puede usar WhatsApp

`crm/api/whatsapp.py:10-33` — toda función whitelisted de este módulo pasa por
`validate_access()`:

```python
ALLOWED_WHATSAPP_ROLES = ["System Manager", "Sales Manager", "Sales User"]
```

Sin uno de esos roles: *"Only sales users can access WhatsApp features."*
Con referencia (`reference_doctype` + `reference_name`), además comprueba que el
documento exista y que el usuario tenga el permiso pedido sobre él. Es decir, el
permiso del **deal** manda sobre el acceso al hilo.

`add_roles()` (`whatsapp.py:703-716`) corre sólo si `frappe_whatsapp` está
instalado, y otorga a **Sales Manager** y **Sales User** permisos de
write/create/delete/share sobre `WhatsApp Message`, `WhatsApp Templates` y
`WhatsApp Settings`, saltándose las filas que ya existan.

---

## 2. El compositor

`frontend/src/components/Activities/WhatsAppBox.vue` (+728 −13 sobre upstream —
el archivo más reescrito del fork).

### 2.1 Modos

El mismo compositor sirve tres modos: **respuesta**, **nota privada**
(*"Private note — only your team sees it…"*) y **comentario interno**
(*"Internal comment for your team…"*). En modo comentario el envío es
`Ctrl/⌘+Enter`; en respuesta, `Enter`.

### 2.2 La barra rápida

Fila de chips sobre el compositor. **En móvil arranca colapsada** detrás de un
botón `⚡ Plantillas y respuestas ▾` para recuperar altura de pantalla; en
escritorio siempre está visible.

| Chip | Qué hace |
|---|---|
| 📦 **Catálogo** | Busca y envía artículos del catálogo. También responde al atajo `/cat` escrito en el compositor |
| ✨ **Sugerir** | Respuestas sugeridas por IA (*"Pensando…"* mientras carga). Las sugerencias se **insertan** en el compositor; el envío sigue siendo humano. Un envío verbatim se atribuye como `canned:ai` |
| 📋 **Plantilla** | Abre el selector de plantillas de WhatsApp |
| chips de respuestas rápidas | texto guardado del equipo, un toque lo mete en la caja |
| chips de plantillas frecuentes | sólo fuera del modo "sólo respuesta" |
| ✏️ | Abre el editor de respuestas rápidas |
| ✕ | Oculta la barra (móvil) |

### 2.3 Adjuntos y medios

- **Cámara directa**: `<input capture="environment">` — abre la cámara trasera
  de un toque. Pensado para la foto del equipo en el mostrador.
- **Nota de voz**: botón *"Grabar nota de voz"*, con estado *"Grabando nota de
  voz…"* y acciones *Cancelar* / *Enviar* (*"Enviando…"*). El botón **se oculta
  por completo** cuando `MediaRecorder` no puede producir un formato utilizable
  — no se muestra un botón que va a fallar.
- **Foto adjunta**: tira *"📎 Foto adjunta — se envía con tu mensaje"* con un
  botón *Quitar adjunto*. Quitarla devuelve `content_type` a `text`.

### 2.4 Respuestas rápidas (canned)

Compartidas por **todo el equipo**, no por usuario. Se guardan como **JSON en un
campo oculto `quick_replies` de FCRM Settings** (`fcrm_settings.json`, Long
Text) — de ahí que el editor diga *"Shared with your whole team"*.

| Endpoint | Regla |
|---|---|
| `crm.api.whatsapp.get_quick_replies` | lectura; JSON inválido → lista vacía, nunca error |
| `crm.api.whatsapp.save_quick_replies` | **cualquier rol de WhatsApp** puede editarlas |

Límites que impone el servidor al guardar: label recortado a **60** caracteres,
texto a **1000**, máximo **50** respuestas. Sin label, se genera uno con los
primeros 24 caracteres del texto. Entradas sin texto se descartan.

### 2.5 Plantillas frecuentes

`get_quick_templates(reference_doctype)` devuelve plantillas **APPROVED** cuyo
`for_doctype` sea el del documento o esté vacío:

- Si hay **6 o menos** (`QUICK_TEMPLATE_LIMIT`), las devuelve todas ordenadas
  alfabéticamente.
- Si hay más, las ordena por **uso real** (conteo de `WhatsApp Message` con
  `use_template = 1` agrupado por plantilla) y devuelve las 6 más usadas.

> Nota de implementación: ese conteo va en SQL crudo a propósito. Frappe moderno
> rechaza `"count(name) as uses"` pasado como *string* de campo a `get_all`
> (guarda contra funciones SQL en strings), y eso rompía la carga del CRM en
> cuanto había más plantillas aprobadas que el límite.

### 2.6 Reacciones

`react_on_whatsapp_message(emoji, reply_to_name)` crea un `WhatsApp Message` con
`content_type = "reaction"` apuntando al `message_id` original. El enriquecedor
las **pliega dentro de su mensaje objetivo** y las quita de la lista devuelta,
así que no aparecen como burbujas sueltas.

---

## 3. Plantillas: el paso de revisión

Este es el diferenciador real frente a un simple "mandar plantilla".

### 3.1 Vista previa resuelta

`get_template_preview(reference_doctype, reference_name, template)` devuelve el
cuerpo de la plantilla, el header y el footer, **más cada marcador `{{n}}` con
el campo del documento al que mapea y el valor actual de ese campo**.

Espeja exactamente lo que hace `frappe_whatsapp`: resuelve desde `field_names`
(nombres de campo del documento, CSV) cuando está definido, y si no cae a los
`sample_values` literales. Así, el valor por defecto que ve el agente es
idéntico al que se transmitiría sin tocar nada.

### 3.2 El agente puede sobrescribir

`send_whatsapp_template(..., body_param=...)` acepta el diccionario de valores
revisados. `frappe_whatsapp.send_template()` consume `body_param` **verbatim**
(sus valores en orden `{{1}}, {{2}}…`) en vez de volver a resolver los campos.

**Lo que el agente revisó es exactamente lo que Meta recibe** — y sigue siendo
un envío de plantilla conforme.

Validación del servidor: si `body_param` viene como string se parsea JSON
(*"Invalid template parameters."* si falla); debe ser un mapeo (*"Template
parameters must be a mapping."*); y cada valor se normaliza a string, con
`None` → `""`.

### 3.3 Mapeo de variables → campos

`get_template_field_options(reference_doctype)` alimenta el selector de mapeo:

- Campos escalares **curados** del doctype de referencia.
- **Un nivel** de traversal por Link: un Deal puede mapear `{{1}}` al nombre de
  su contacto (`contacto.first_name`), etiquetado `Contacto → Nombre`.
- Cualquier token ya guardado que las heurísticas no hayan ofrecido aparece bajo
  el grupo *"En uso"* — **pero sólo si pasa la lista blanca**.

`set_template_field_map(template, field_names)` persiste el mapeo por defecto.
Dos detalles importantes:

- Está limitado a **System Manager / Sales Manager**: *"Solo un gestor puede
  guardar el mapeo predeterminado."*
- Usa `frappe.db.set_value`, **no** `doc.save()`, deliberadamente: guardar el
  doctype dispararía el `on_update` de `frappe_whatsapp` y con él una **edición
  de la plantilla en Meta**. Un cambio de mapeo es metadato local, no un
  reenvío del cuerpo a aprobación.

### 3.4 La lista blanca de tokens (seguridad)

`_token_allowed()` existe para que `resolve_field_value` **no se convierta en un
lector arbitrario de columnas**. El ejemplo del propio código:
`deal_owner.api_key`.

Reglas exactas:

| Forma del token | Se permite si… |
|---|---|
| `campo` | es un campo del doctype de referencia, de tipo mapeable y no oculto |
| `link.subcampo` | `link` es un Link con `options` a un doctype existente, y `subcampo` es no oculto, de tipo `Data`/`Phone`/`Read Only`/`Select`, **y** su nombre contiene `name`, `mobile`, `phone` o `email` |

Nada de dos niveles de punto. Nada de campos que no encajen en ese perfil. El
selector nunca debe ensanchar esta función.

---

## 4. La compuerta de revisión (MA-1)

**Ningún envío automático sale sin que un humano lo apruebe.** Es un no-goal
explícito del spec y la regla que gobierna todos los flujos de automatización.

### 4.1 Dónde vive

El doctype es **`WhatsApp Send Review`**, en `doco_marketing`, no en este repo:

| Campo | Tipo | Valores / notas |
|---|---|---|
| `status` | Select | **`Pendiente`** (default) / `Enviado` / `Cancelado` / `Fallido` |
| `auto` | Check | default `0`. Las automatizaciones **siempre** encolan con `auto=0` |
| `to` | Data | destinatario |
| `template` | Link → WhatsApp Templates | plantilla a enviar |
| `body_param` | Small Text | valores de las variables |
| `preview` | Text | lo que el revisor lee |
| `reference_doctype` / `reference_name` | Link / Dynamic Link | a qué conversación pertenece |
| `source` | Data | qué lo generó, ej. `repair_status:<RO>:<estado>` |
| `sent_at` / `sent_by` | Datetime / Link User | quién lo soltó y cuándo |
| `attempts` | Int | reintentos |
| `wa_message` | Link → WhatsApp Message | el mensaje resultante |
| `error` | Small Text | motivo del fallo |

El campo `source` es la llave de **deduplicación**: un servicio que reevalúa la
misma condición no debe encolar dos filas para el mismo hecho.

### 4.2 Qué se encola

Todo lo que no sea un humano tecleando: actualizaciones de estado de reparación
del taller, acuses automáticos, ofertas de factura al ganar un deal, pasos de
cadencia, nudges de carrito abandonado. Cada uno escribe una fila `Pendiente`
con `auto=0` y una migaja (Comment) en el deal.

### 4.3 Las superficies de revisión en la SPA

| Componente | Papel |
|---|---|
| `pages/WhatsAppQueue.vue` | la cola completa de pendientes |
| `components/doco/WhatsAppReviewCard.vue` | la tarjeta de una fila: previsualizar, aprobar, descartar |
| `components/doco/ConversationReviewStrip.vue` | tira dentro de la conversación cuando hay algo pendiente para ese hilo |
| `components/doco/inbox/AutoAckReview.vue`, `ConversationAutoAckStrip.vue` | acuses automáticos, revisados aparte |
| `components/Activities/WhatsappTemplateReview.vue` | el paso de revisión de variables **antes** de un envío manual de plantilla |

Endpoints (todos en `doco_marketing`):
`api.review_queue.get_queue`, `counts`, `get_row_template_vars`, `approve`,
`reject`, `retry`; y para los acuses `api.auto_reply.list_pending`,
`pending_count`, `pending_for_ref`, `approve`, `discard`.

### 4.4 Quién puede aprobar

**Política "ojos de gerente" (Marco, 2026-08-03).** Desde esa fecha los roles
están partidos en dos conjuntos, en las dos colas:

- **VER la cola** — `_QUEUE_ROLES` / `_ROLES`:
  **System Manager · Sales Manager · Marketing Manager · Sales User**
- **ACTUAR** (aprobar / rechazar / reintentar / descartar) — `_APPROVER_ROLES`:
  **System Manager · Sales Manager · Marketing Manager**

Es decir, **un agente de ventas normal ya NO puede aprobar** un envío encolado:
ve la cola (lectura) pero las acciones cliente-visibles son de gerencia. Sin
rol de vista: *"No autorizado para la cola de WhatsApp."*; con vista pero sin
rol de aprobador: *"Solo un gestor puede aprobar/actuar sobre la cola."*

El par VER/ACTUAR se repite en los cuatro sitios de guardia — la invariante
**M16** sigue viva, ahora con dos listas por sitio: `whatsapp_send_review.py`
(`send_now`, `retry`, `cancel_send`), `api/review_queue.py` (`approve`,
`reject`, `retry` vía `_approver_guard`), `api/auto_reply.py`
(`approve`, `discard`) e `inbox_auto_reply.py` (`approve`, `discard`,
`retry`). Si tocas una lista, tócalas todas.

Los DocPerms acompañan la política: gerentes con read/write/create en ambos
doctypes; **Sales User queda en solo-lectura** (read/print/report). La
discrepancia histórica (Sales Manager / Marketing Manager pasaban `only_for`
pero el JSON no les daba permisos de documento) quedó corregida el mismo día.
En la SPA los botones de acción se ocultan para no-gerentes
(`WhatsAppReviewCard.vue`, `AutoAckReview.vue`, `ConversationAutoAckStrip.vue`)
— el servidor sigue siendo la autoridad.

---

## 5. Cómo se lee un hilo

`get_whatsapp_messages(reference_doctype, reference_name)`:

1. Si `twilio_integration` está instalado → devuelve `[]` (la app de Twilio de
   upstream es incompatible; el CRM trae su propia integración).
2. Si no existe el doctype `WhatsApp Message` → `[]`.
3. **Si la referencia es un CRM Deal y el deal viene de un lead**, incluye
   también los mensajes que quedaron colgados del **CRM Lead** — con su propia
   verificación de permisos. Así la conversación no se parte en dos al
   convertir.
4. Enriquecimiento común (`enrich_whatsapp_messages`).

### 5.1 El enriquecedor

Compartido entre el hilo por referencia y el hilo huérfano de `doco_marketing`
(`get_unassigned_thread`), para que ambos rendericen igual:

- **Resuelve cuerpos de plantilla.** Sin esto, una fila de tipo Template tiene
  `message = None` y se dibuja como una burbuja vacía.
- **Pliega las reacciones** dentro de su mensaje objetivo.
- **Enhebra las respuestas.**
- **Sella `from_name`**: para un Deal, el contacto primario (o `lead_name`);
  para un Lead, nombre + apellido; para un huérfano sin documento de
  referencia, **el número del remitente**.

### 5.2 Defensa contra parámetros corruptos

```python
try:
    parameters = json.loads(template_message["template_parameters"])
    template.template = parse_template_parameters(template.template, parameters)
except (ValueError, TypeError):
    pass
```

Una fila con parámetros corruptos **no debe tirar el hilo entero** — y menos
cuando la vista del deal y la de huérfanos comparten el enriquecedor. Al fallar,
se salta la sustitución y se muestra el cuerpo crudo de la plantilla.

### 5.3 Campos que se leen

`_wa_message_fields()` arma la lista y añade condicionalmente, **sólo si la
columna existe**:

- los cuatro de procedencia (`doco_sent_by_type`, `doco_actor_user`,
  `doco_automation_source`, `doco_bot`) — ver `03-enrutamiento-y-procedencia.md`;
- `failure_reason`, campo del fork con la explicación asíncrona de fallo que
  manda Meta en el `errors[]` del webhook (ej. *"131047 · Re-engagement
  message"*).

Las guardas `has_column` existen para sobrevivir a la ventana entre desplegar
código y correr `migrate`.

---

## 6. El canal Messenger

El fork añade un **segundo canal** con la misma forma:
`Activities/MessengerArea.vue` y `MessengerBox.vue`. Ambos son archivos nuevos.

- Se leen con `doco_marketing.api.inbox.get_communications(channel='messenger')`
  y se responde con `doco_marketing.api.inbox.send_message(channel='messenger')`.
- La ventana de 24 h de Meta se maneja del lado del backend: dentro de la
  ventana es una RESPONSE gratuita, fuera se usa la etiqueta `HUMAN_AGENT`.
- La burbuja muestra un chip de **atribución** cuando el mensaje trae referral:
  *"📣 vino de: &lt;anuncio o enlace&gt;"* — qué anuncio, m.me link o CTWA generó
  la conversación.
- Las reacciones del cliente se pintan como emoji pegado a la burbuja.
- El compositor comparte UI con el de WhatsApp (emoji, adjuntos, respuestas
  rápidas con `channel="Messenger"`, botón de catálogo 📦), con el encabezado
  *"Responder · Messenger"* en el azul de Messenger.

---

## 7. Configuración que un admin necesita tocar

| Dónde | Qué |
|---|---|
| App `frappe_whatsapp` | La conexión con Meta: WhatsApp Settings, cuentas, tokens, webhook. **No** es este repo |
| `WhatsApp Templates` | Plantillas aprobadas por Meta; `for_doctype`, `field_names` (mapeo por defecto), `status = APPROVED` |
| `FCRM Settings.quick_replies` | JSON de respuestas rápidas. Campo oculto — se administra desde el compositor, no desde Desk |
| Roles | Sales Manager / Sales User necesitan uno de los roles de `ALLOWED_WHATSAPP_ROLES`; `add_roles()` les da permiso sobre los doctypes de WhatsApp |
| `doco_marketing` | Toda la configuración de la cola de revisión, acuses automáticos y automatizaciones |

---

## 8. Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| *"Only sales users can access WhatsApp features."* | El usuario no tiene ninguno de los tres roles permitidos |
| Burbuja de plantilla vacía | El enriquecedor no corrió, o la plantilla ya no existe en `WhatsApp Templates` |
| El hilo entero truena al abrir un deal | Antes lo causaban parámetros corruptos; hoy está atrapado — si vuelve, revisar `enrich_whatsapp_messages` |
| Faltan los chips de plantillas frecuentes | No hay plantillas `APPROVED` con `for_doctype` compatible |
| Guardar el mapeo dice "Solo un gestor…" | Requiere System Manager o Sales Manager |
| Cambiar el mapeo reenvió la plantilla a Meta | Regresión: debe usarse `db.set_value`, no `doc.save()` |
| El botón de nota de voz no aparece | `MediaRecorder` no soporta un formato utilizable en ese navegador — comportamiento intencional |
| Un mensaje falló y no se sabe por qué | Ver `failure_reason` (código de Meta); requiere que la columna exista |
| Se perdió la conversación al convertir un lead a deal | El fallback lead→deal de `get_whatsapp_messages` sólo aplica si el deal conserva el campo `lead` |
</content>
