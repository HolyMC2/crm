# 06 — Social, campañas, chatflows y cadencias

> Para marketing y gerencia. Verificado leyendo `frontend/src/pages/`
> (`SocialCalendar`, `SocialEvergreen`, `SocialMentions`, `Campaigns`,
> `CampaignDetail`, `Chatflows`), `components/doco/social/*`,
> `components/doco/flows/StepCardList.vue` y las utilidades puras
> `cadenceScaffold.js` / `cadenceStatus.js`. Estado: `261195f4`.
>
> **Todo el motor vive en `doco_marketing`.** Este repo aporta las superficies.

---

## 1. Social

Cuatro páginas, con **selector de sucursal** común (*"Filtrar por sucursal"* /
*"Todas las sucursales"*).

### 1.1 Calendario (`/social`)

Barra: **"Calendario"** | **"Métricas"**, más accesos a
**"Biblioteca"** (*"Publicaciones evergreen reutilizables"*),
**"Menciones"** (*"Menciones entrantes de clientes"*),
**"Sucursales"** (*"Asignar empleados a sucursales"*) y un contador
**"Por aprobar"**.

Botones de creación:

- **"Nueva publicación"** — el compositor manual.
- **"✨ Borrador IA"** — abre el **"Compositor IA"** con: *"Tipo de
  publicación"*, *"Temporada"* (o *"Sin temporada"*), *"Brief"*, *"Imitar estilo
  de…"* (opcional), elección de **"Imagen"** (*"Fotos de productos"* /
  *"Reusar las del ejemplo"* / *"Sin imagen (la agrego después / Canva)"*), y la
  casilla *"Marcar como evergreen (rotable si rinde bien)"*.
- **"✨ IA · todas"** — genera en lote para todas las sucursales.

Ambos generadores son **sólo para gerentes**.

> **Los borradores de IA son sólo de Facebook Feed.** Tanto `compose_draft` como
> `bulk_draft` mandan `channels: ['FB Feed']` **fijo en el código**
> (`SocialCalendar.vue:436` y `:313`); `bulk_draft` además fija
> `signal: 'new_arrivals'`. No hay manera de generar un borrador de IA para
> Instagram desde estos botones — hay que crear la publicación a mano y elegir el
> canal en el compositor.

> El archivo `SocialCalendar.vue` es hoy un **shell**: tras la descomposición W6
> B0 delega la rejilla del mes a `CalendarGrid.vue`, las métricas a
> `MetricsPanel.vue` y el diálogo de creación/edición a `SocialComposer.vue`; los
> datos compartidos (recursos, navegación de mes, selector de sucursal) están en
> el composable `socialCalendar.js`. Fue una refactorización **puramente
> estructural** del monolito de 1121 líneas — el comportamiento no cambió.

El calendario tiene colores por pilar, filtros, vistas semana y lista, cintas, y
guardas de arrastre. Existe además una **guarda de bloqueo (blackout)** que
impide soltar una publicación en una fecha vetada.

> Nota de vocabulario: el estado **`Cancelado`** se quitó del filtro de estados
> del calendario (commit `261195f4`, el HEAD actual). Si lo ves en un mockup
> viejo, ya no existe ahí.

### 1.2 El compositor

`components/doco/social/SocialComposer.vue` — *"Nueva publicación"* /
*"Editar publicación"*.

| Campo / control | Notas |
|---|---|
| **"Título"** | marcado *"Interno"* — no se publica |
| **"Sucursal"** | |
| **"Canales"** | multi-selección |
| **"Texto por canal"** | caption por canal; sin canal elegido: *"Selecciona un canal arriba."* |
| pista IG | *"IG Reel: requiere video."* |
| **"Feedback para la IA"** + **"↻ Regenerar"** | reintento guiado |
| **"Programar"** | fecha/hora |
| **"CTA"** + **"Enlace CTA (wa.me / storefront)"** | *"Ninguno"* si no aplica |
| **"Primer comentario"** | el truco de poner los enlaces/hashtags en el primer comentario |
| **"Vista previa (Facebook)"** | con *"Tu página"* y *"Ver más"* |
| **"Sugerir hora"** | ver §1.4 |
| Editor de medios | `composer/MediaEditor.vue`, incluye texto alternativo |
| Panel de variantes | `composer/VariantsPanel.vue`; al aplicar una: *"Variante aplicada"* |

Acciones según estado: **"Guardar borrador"** · **"Programar"** ·
**"Publicar ahora"** · **"Aprobar"** · **"Rechazar"** ·
**"Cancelar publicación"**.

Estados visibles: **"Borrador"**, **"Programado"**, *"Programado en Meta"*
(*"el enlace aparece al publicarse"*), **"Publicado"**, **"Falló"**.

Endpoints: `doco_marketing.api.social.save_post`, `get_post`, `approve`,
`reject`, `cancel`, `reschedule`, `compose_draft`, `bulk_draft`, `regenerate`,
`get_compose_options`, `get_channels`, `get_seasons`, más
`services.social.ai_draft.generate_variants` / `pick_variant` y
`services.social.publish.publish_now`.

### 1.3 Métricas y mejores horarios

La vista **"Métricas"** (`MetricsPanel.vue`) usa
`doco_marketing.api.social.get_dashboard` y `get_leaderboard`.

> *Corregido 2026-08-03*: el leaderboard **"Por sucursal"** ya sigue el selector
> de sucursal — `get_leaderboard` acepta `shop` (mismo contrato que
> `get_dashboard`, validado con `_assert_shop_access`) y la tabla se recarga al
> cambiar de sucursal.

El mapa de calor **"Mejores horarios"** (`SocialHeatmap.vue`) viene de
`doco_marketing.api.social_planner.get_heatmap`.

### 1.4 Sugerir hora

`composer/SuggestTimeButton.vue` + `composables/useSuggestTime.js` →
`doco_marketing.api.social_planner.suggest_time`. Propone el horario con mejor
rendimiento histórico para ese canal y sucursal.

### 1.5 Biblioteca evergreen (`/social/evergreen`)

**"Biblioteca evergreen"** — vista de gerente sobre el pool de rotación: qué
publicaciones ya publicadas están marcadas como evergreen, cuántas veces se han
reciclado y cuándo vuelven a ser elegibles.

Por fila: tipo (o *"Sin tipo"*), **"Último"** reciclado, y estado
**"Disponible"** / *"En pausa hasta"* / *"Disponible el"*.

Acciones:

- **"♻ Reciclar ahora"** — *"Crear un borrador reciclado ahora"*, por **la misma
  ruta del cron**, no un atajo aparte.
- **"Quitar de la biblioteca"** — *"Sacar de la rotación evergreen"*.

Vacío: *"Aún no hay publicaciones evergreen"* con un enlace **"Ir al
calendario"**.

Endpoints: `doco_marketing.api.social_evergreen.get_evergreen_pool`,
`recycle_now`, `set_evergreen`.

> El backend impone **todos** los permisos; la UI sólo los espeja.

### 1.6 Menciones (`/social/mentions`)

**"Menciones"** — bandeja de triage sobre el doctype `Social Mention`:
comentarios, descripciones e historias que nos @mencionaron en Instagram, más
publicaciones etiquetadas de Facebook.

Tipos que se distinguen: **Comentario** · **Descripción** · **Historia** ·
**Facebook** · **Reseña**.

Flujo por mención:

1. **Vista previa** del contexto — *"Vista previa de la publicación"* o
   *"Vista previa de la historia"*, más **"Ver en la red →"**.
2. **"💡 Sugerir respuesta"** — borrador de IA o plantilla.
3. Editar en *"Escribe una respuesta pública…"*.
4. **"Responder"** → *"Publicar la respuesta como comentario público"*, con
   confirmación **"Publicar respuesta"**.
5. O **"Descartar"** (*"Descartar esta mención"*), reversible con
   **"Reactivar"**.

Marcada como **"Respondida"** al terminar. Vacío: *"Sin menciones por aquí"*.

**Las reseñas tienen su propia tarjeta**: muestra las estrellas y ofrece
**"Crear testimonio"** de un clic, que deja *"Testimonio en borrador — ver
calendario →"*.

Endpoints: `doco_marketing.services.social.mentions.list_mentions`,
`draft_reply`, `send_reply`, `set_status`, `get_media_preview`,
`create_testimonial`.

> **Nada se publica solo.** El borrador de IA es exactamente eso: un borrador que
> un humano edita y suelta (MA-1).

### 1.7 Comentarios con conciencia de canal

Los comentarios entrantes se agrupan por publicación y distinguen grupos de
Instagram del espacio de trabajo general (commit `37954872`). La bandeja de
comentarios se documenta en `01-inbox-conversaciones.md` §3.2, porque vive en la
bandeja, no en Social.

---

## 2. Campañas (`/campaigns`)

Superficie de automatización de marketing, **sin equivalente en upstream**.
Datos: `doco_marketing.api.campaigns.list_campaigns`.

La página tiene un **conmutador «Campañas | Cadencias»**; el título refleja el
modo activo.

### 2.1 Detalle y editor (`/campaigns/:id`)

Configurable por completo desde la SPA: ajustes (tipo, disparador, audiencia),
constructor de pasos, enrolar, activar y pausar. Guarda con
`doco_marketing.api.campaigns.save_campaign`; el estado se cambia con
`set_status`; la audiencia con `enroll_audience`; los inscritos se ven con
`get_enrollments`.

### 2.2 El editor de pasos

`components/doco/flows/StepCardList.vue` — compartido entre campañas, cadencias
y chatflows.

Encabezado **"Secuencia"**, tarjetas **"Paso"** reordenables (*"Arrastrar para
reordenar"*), vacío *"Sin pasos. Agrega un paso para empezar."*

| Tipo de paso | Configuración |
|---|---|
| **"Enviar WhatsApp"** | **"Plantilla"** o *"(texto libre / ninguna)"* |
| **"Enviar Email"** | **"Plantilla"** o *"(ninguna)"* |
| **"Esperar"** | número + **"horas"** |
| **"Bifurcación"** | *"Si abrió el anterior"* / *"Si dio clic anterior"* |
| **"Fin"** | — |

Extras por paso: **"Mensaje"**, **"etiqueta"**, **"Escalar a humano"**,
**"Eliminar"**.

---

## 3. Cadencias 1:1

Una cadencia **es una campaña** con la bandera `is_cadence = 1`. Camina por el
**mismo motor** que cualquier campaña (`services/campaign_engine._advance`).
Construir una segunda ruta de envío era rechazo automático por diseño.

### 3.1 El caso de uso

*"No contestó"* → secuencia de tres toques a **día 1, 3 y 7**, que **se detiene
sola en cuanto el cliente responde**.

### 3.2 Cómo se arma el andamio

`utils/cadenceScaffold.js`:

```js
export const CADENCE_TOUCH_WAITS_HOURS = [24, 48, 96]
```

El motor espera `wait_hours` **desde que corre el paso de espera**, y entonces
dispara el siguiente paso (un envío). O sea que pares consecutivos
`(wait, send_whatsapp)` con brechas **entre pasos** de 24 / 48 / 96 h caen a
**24 / 72 / 168 h acumuladas** desde el enrolamiento — día 1, 3 y 7.

Las plantillas se dejan **en blanco** a propósito: el operador llena cada hueco
antes de activar. Un borrador tolera plantillas vacías; la guarda de plantilla
faltante sólo muerde **al activar**
(`crm_campaign._validate_send_content`).

### 3.3 Enrolar desde la conversación

`components/doco/inbox/CadencePicker.vue` en la cabecera del deal. Muestra el
estado actual o el selector de cadencias.

`utils/cadenceStatus.js` produce las etiquetas:

- **`paso 2/3`** — "toques" son los pasos de envío, así que el paso posicional
  del motor se traduce a algo humano. Se **acota**: una secuencia terminada lee
  *"paso N/N"*, nunca *"N+1/N"*.
- **`próx. …`** — etiqueta relativa del siguiente toque. Si ya venció o está por
  vencer, dice **"en breve"** (el despacho corre cada 5 minutos), **nunca una
  duración negativa**. Sin agenda (pausada o terminada) no dice nada.

Resultado típico en el chip: *"Seguimiento activo: X · paso 2/3 · próx. mañana"*.

Endpoints: `doco_marketing.api.cadence.list_cadences`, `enrollment_status`,
`enroll`, `stop`.

### 3.4 Autoría de cadencias

Antes sólo se podían crear desde Desk. Hoy: modo **«Cadencias»** en la página de
Campañas, botón **«+ Cadencia»** que crea un borrador con `is_cadence=1` y el
andamio día 1/3/7 precargado. En el detalle aparece la insignia
**«Cadencia 1:1»** y se ocultan los controles de audiencia y disparador de
enrolamiento — una cadencia se enrola desde la cabecera del deal, punto.

> **Aviso sobre `is_cadence`**: hay dos guardas y **no son iguales**. El cliente
> bloquea el cambio en cuanto `enrolled_count > 0` (cualquier enrolamiento). El
> servidor lo bloquea sólo si existe un enrolamiento **Activo**
> (`doco_marketing/api/campaigns.py:76-81`). O sea que una campaña con
> enrolamientos únicamente terminados **sí** se puede voltear por API aunque la
> UI no lo permita.
>
> Los comentarios de `CampaignDetail.vue:34,168` y `cadenceScaffold.js:41-44`
> dicen que el servidor no guarda nada. **Están rancios**: la guarda existe desde
> que se escribieron. Confía en el código, no en esos comentarios.

---

## 4. Chatflows (`/chatflows`)

Editor visual de pasos para flujos de bot. Primera superficie SPA del doctype
`Chatflow` — antes sólo existía en Desk.

Izquierda: lista de flujos. Derecha: banderas + el mismo `StepCardList`
(`kind="chatflow"`).

Endpoints: `doco_marketing.api.chatflow.flows_overview`, `get_flow`, `save_flow`,
`set_enabled`, `cancel_runs`. **Limitado a gerentes del lado del servidor**
(System Manager / Sales Manager).

---

## 4b. Reparaciones dentro del trato (vertical taller)

`components/doco/RepairOrdersSection.vue` vive en el panel de contexto de la
conversación, detrás de la bandera `has_taller`.

Endpoints de `taller`:

| Endpoint | Uso |
|---|---|
| `repair.repair_orders.get_deal_repair_orders` | lectura. De-duplica filas hijas y hace `check_permission("read")` por orden — **omite** las que no puedes ver en vez de lanzar error (aislamiento de laboratorio). El historial se corta a 5 entradas del lado servidor. `phone_pin` / `phone_pattern` sólo viajan para roles de gerencia |
| `repair.repair_orders.create_and_link_repair_order` | alta desde el modal de deal. Exige permiso de **escritura** sobre el deal; `falla_reportada` es obligatorio en ambos lados |
| `repair.repair_orders.get_repair_ticket_print_url` | devuelve `{doctype,name,format,letterhead}`; el cliente abre `/printview?…&trigger_print=1&simplified=1` en un popup de 400×600 |
| `api.billing.create_billing_doc` | el desplegable **"Crear borrador"**, con exactamente cuatro opciones: 🧾 Sales Invoice · 💳 POS Invoice · 💵 Cotización · 📦 Sales Order. **Idempotente**: si ya hay un borrador en docstatus 0 lo devuelve con `created:false` |
| `file_storage.get_signed_url` | sólo para los originales de fotos en S3; las miniaturas son locales |

El nombre de la orden enlaza a `/taller/orders/{name}` — la SPA de taller, no
Desk.

### 4b.1 "Revisar y enviar al cliente"

`RepairSendModal.vue`. El flujo, y por qué a veces cambia solo:

1. Elegir canal: **💬 WhatsApp** siempre; **✉ Email** sólo si el deal tiene
   correo.
2. El modal lee el **último mensaje entrante de WhatsApp** para calcular la
   ventana de 24 h.
3. Seleccionar fotos y entradas del historial, editar la nota, revisar la línea
   final.
4. **Ventana abierta** → `doco_marketing.api.inbox.send_bundle`: correo con
   adjuntos, o la nota por WA más un mensaje de medios por cada foto.
5. **Ventana cerrada** (`waBlocked`) → bloque ámbar
   *"⚠ Ventana de 24h de WhatsApp cerrada…"*. El **único** camino es una
   plantilla aprobada con encabezado de imagen
   (`doco_marketing.api.inbox.get_image_templates` →
   `inbox.send_message` con `template` y `attach`). El botón cambia a
   **"Enviar plantilla"** y exige plantilla **más al menos una foto**.

Las URLs de las fotos se resuelven a absolutas/firmadas antes de mandarlas,
porque **es Meta quien las descarga**.

> Detalle de arquitectura que sorprende: **el envío no es de `taller`**. Taller
> sólo aporta los datos de la orden y las URLs firmadas; la ruta de envío es
> `doco_marketing`, como todo lo demás.

---

## 5. La regla que gobierna todo esto

Ninguna de estas superficies envía al cliente por su cuenta. Los pasos de envío
de campañas y cadencias, las actualizaciones de estado de reparación, los acuses
automáticos y las ofertas al ganar un deal **encolan una fila
`WhatsApp Send Review` en estado `Pendiente` con `auto=0`** y esperan a un
humano. Detalle en `02-whatsapp-plantillas-y-envios.md` §4.

Las únicas excepciones son las acciones que un operador dispara explícitamente:
"Publicar ahora" en Social, "Responder" en Menciones, y el envío desde el
compositor.

---

## 6. Qué NO está aquí

Para no documentar funciones muertas:

- **`components/doco/ComingSoon.vue`** era el marcador de rutas del rediseño
  pendientes de construir ("Coming in Phase N", leyendo `title`/`phase` del meta
  de la ruta). Hoy **ningún archivo lo importa**: todas las rutas del rediseño
  tienen su página real. El componente quedó huérfano y es candidato a borrarse.
- **DMs de Instagram** como canal de conversación: el spec los tiene como P2
  pendiente (`FCRM_EXCELLENCE_SPEC.md` §2.8). Las **menciones** de IG sí
  funcionan; los **DMs** no son un canal de la bandeja.
- **Transcripción de llamadas**: `doco_marketing.api.calls.enqueue_transcription`
  está cableado desde el cajón de detalle de llamada, pero el spec la lista como
  diferida. **TODO-VERIFY**: si el backend la implementa de punta a punta o sólo
  encola.
- **Borrar vistas guardadas no existe**: `deleteView()` está definida en
  `LeadsView.vue:455` y `DealsView.vue:428` pero **nunca se llama**. Se pueden
  crear y aplicar vistas, no borrarlas.
- **`Cancelado` es inalcanzable en el calendario social**: `get_calendar` lo
  excluye del lado servidor y `STATUSES` lo omite, aunque el estilo de chip y el
  tachado siguen en el código.
- **`/webshop` es en su mayoría andamio** — ver `07-reportes-y-scoring.md` §8.
</content>
