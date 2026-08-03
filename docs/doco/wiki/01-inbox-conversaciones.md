# 01 — La bandeja de conversaciones

> Guía para el agente de ventas. Verificada leyendo
> `frontend/src/composables/inbox.js` (980 líneas, la máquina de estado),
> `frontend/src/pages/Inbox.vue` y `components/doco/inbox/ConversationQueue.vue`.
> Estado: `261195f4`.
>
> Las etiquetas entre comillas son **exactamente** las que salen en pantalla.

---

## 1. Qué es

La bandeja (`/inbox`) es la superficie estrella del fork: 106 de sus 298 commits
son de aquí. Sustituye la vista de deal de upstream por un espacio de trabajo de
**conversación primero**, omnicanal (WhatsApp, Messenger, comentarios de
Facebook) y con el expediente comercial del cliente a la mano.

**En escritorio** son tres paneles a la vez:

```
┌──────────────┬───────────────────────┬───────────────────┐
│ Bandeja      │  Espacio de trabajo   │  Contexto         │
│ (cola)       │  (el hilo)            │  (datos del deal) │
└──────────────┴───────────────────────┴───────────────────┘
```

**En móvil (<640 px)** es una pila estilo WhatsApp de un panel a la vez:
`lista → hilo → contexto`. Los paneles se ocultan con `v-show`, no se
desmontan, así que el scroll del hilo y lo que ibas escribiendo **sobreviven** a
entrar y salir. El botón físico de "atrás" y el gesto de deslizar desde el borde
hacen lo mismo que las flechas ← de la pantalla.

Se puede colapsar la cola en escritorio con "Ocultar bandeja" (⟨) y traerla de
vuelta con ⟩ ("Mostrar bandeja").

---

## 2. La cola

### 2.1 Encabezado

- **"Mi bandeja"** con el total de "Cosas sin atender" — un solo número que suma
  huérfanos de WhatsApp + huérfanos de Messenger + conversaciones vencidas +
  comentarios nuevos. Los cuatro cubos son disjuntos, así que la suma es real.
- 🔍 **"Buscar mensajes"** — búsqueda global sobre el texto de **todos** los
  hilos, no sólo los nombres de la cola.
- 🔔 **"Sonido de notificación"** — se activa/desactiva; avisa de entrantes.
- **"Trato"** / "New Deal" — crear un deal desde aquí.
- **"Buscar en la bandeja"** con marcador *"Buscar equipo, cliente…"* y una ✕
  ("Limpiar búsqueda"). La búsqueda va con 300 ms de retardo; la ✕ **recarga de
  inmediato**, sin esperar, para que la cola completa esté de vuelta antes de
  que regreses la vista.

### 2.2 Pestañas de canal

Estilo Meta. Los contadores son **totales reales por canal sobre todas las
conversaciones** (no sobre la página cargada) — si no, el canal inactivo siempre
marcaría 0.

| Pestaña | Cuándo aparece | Qué cuenta |
|---|---|---|
| **"Todos"** | siempre | todas |
| **WhatsApp** | siempre | conversaciones de WA |
| **Messenger** | sólo si el canal está habilitado (`Marketing Settings.enable_messenger`) | conversaciones de Messenger |
| **"Comentarios"** | siempre | comentarios nuevos en publicaciones |
| **"Vencidos"** | siempre | conversaciones que pasaron el umbral de SLA |
| 💤 **"Pospuestas"** | sólo si hay >0 | conversaciones dormidas esperando su hora |
| **"Por aprobar"** | sólo si alguna vez se redactó algo | acuses automáticos esperando visto bueno humano |

Las dos últimas se ocultan en cero a propósito: un tenant limpio no debe ver
pestañas muertas.

Dentro de **"Comentarios"** hay un sub-filtro: **"Nuevos"** / **"Respondidos"**
/ **"Todos"**, más su propia búsqueda (*"Buscar comentario o usuario…"*).

### 2.3 Secciones de la cola

| Sección | Qué contiene |
|---|---|
| **"Conversaciones"** | deals y leads con hilo |
| **"Sin asignar"** | entrantes de números sin Contacto/Lead/Deal — los huérfanos |
| **"Archivados"** | huérfanos que cerraste sin abrir registro; se carga bajo demanda |
| **"Comentarios"** | comentarios agrupados **por publicación** (se agrupa en el servidor, escala a cientos) |

### 2.4 Los chips de una fila

| Chip | Significado |
|---|---|
| **"Mensajes sin abrir"** | hay entrantes sin leer |
| ámbar **"Responder"** | la conversación espera respuesta tuya |
| **"Marcar como respondido"** | cierra el chip ámbar **sin** responder. Un entrante posterior lo vuelve a levantar; el servidor también lo cierra solo cuando el deal llega a un estado terminal |
| **"Respondido"** | ya se contestó |
| 💤 **"Pospuesta — reaparece sola"** | está dormida; vuelve sola a su hora |
| 🔴 **"SLA vencido"** | pasó el umbral de respuesta |
| 💰 **"Saldo pendiente en facturas del trato"** | tiene dinero por cobrar |
| **"Lead"** | la fila es un CRM Lead, no un Deal — leads y deals comparten la cola |

Estados vacíos y de error: *"Sin conversaciones"*, *"No se pudo cargar la
bandeja."* + **"Reintentar"**, *"Cargando…"*, *"Nada archivado"*.

### 2.5 Cargar más, y por qué a veces la lista "salta"

La cola se pagina de a **50** y crece con scroll infinito ("Cargando más…").
Dos comportamientos deliberados:

- Al **cambiar filtro o búsqueda**, la lista se **reemplaza** con la primera
  página fresca. Truncar el scroll profundo es lo correcto: cambiaste de
  contexto a propósito.
- Al llegar un **mensaje nuevo** (realtime), la primera página fresca sube al
  tope y **las filas que ya tenías cargadas se conservan debajo**. Un entrante no
  debe tirarte la cola en la que llevabas rato bajando.

Las ráfagas de mensajes (envío + acuse, varios webhooks) se colapsan en **una
sola** recarga, con retardo.

### 2.6 Caché de arranque en frío

La cola pinta **al instante** desde la última lista conocida y la versión fresca
entra cuando llega — pensado para móvil y conexiones lentas. Las filas viejas
son deals reales: abrir una carga su hilo en vivo.

Endurecimiento importante para soporte:

- La llave del caché está **namespaceada por usuario** (cookie `user_id`), para
  que un segundo operador en el mismo navegador nunca pinte los clientes del
  primero.
- Las entradas **caducan a las 24 h**.
- **Cerrar sesión purga** todas las llaves `doco-inbox-queue-*`.
- Se persiste **sólo la primera página, sólo si no hay filtro de canal ni
  búsqueda activa**.
- De esa página se guardan **únicamente las primeras 30 filas**, y el
  `last_message` de cada una se **recorta a 60 caracteres** — o sea que el caché
  guarda lo mínimo para pintar, no la conversación.
- La llave vieja `doco-inbox-queue-v1` se borra al arrancar.

### 2.6.1 La pestaña "Vencidos" no usa la cola

Vale la pena saberlo porque se comporta distinto: **"Vencidos"** no pinta
`queueRows` en absoluto. Cambia a la lista de `get_overdue_conversations`,
**ordenada por el servidor** de más a menos tiempo esperando, y **no pagina** —
la paginación sólo aplica a *Todos*, *WhatsApp* y *Messenger*.

Igual, **"Por aprobar"** reemplaza la lista entera por el panel de revisión de
acuses.

### 2.7 Recuperación tras un hueco de realtime

Si el socket se reconecta, o vuelves a la pestaña tras un rato oculta, los
eventos emitidos mientras tanto se perdieron para siempre. El "catch-up" refresca
**todas** las superficies de la bandeja y el hilo abierto. Es el F5 que antes
hacías a mano.

### 2.8 Dónde te deja al volver

Abrir un Contacto o un Deal 360 es una navegación real y desmonta la bandeja. El
estado (conversación abierta, panel móvil, pestaña) se guarda en
`sessionStorage` bajo `doco_inbox_state` y se rehidrata al volver — incluso tras
una recarga completa. **Aterrizas en la misma conversación, no en una bandeja
vacía.**

---

## 3. Los tres espacios de trabajo

El panel central cambia según lo que abras:

| Espacio | Cuándo | Qué ofrece |
|---|---|---|
| **DealWorkspace** | conversación normal (Deal o Lead) | el hilo, el compositor, pestañas Conversación / Actividad / Reparación |
| **UnassignedWorkspace** | huérfano de "Sin asignar" o "Archivados" | el hilo sin registro, y las acciones para colocarlo |
| **CommentWorkspace** | grupo de comentarios de una publicación | la publicación + todos sus comentarios, estilo Facebook |

### 3.0 La cabecera de la conversación

`DealHeader.vue` es la barra que corona el hilo. Lleva más de lo que parece:

| Control | Qué muestra / hace |
|---|---|
| Chip de ventana WA | **`WA 5h`** = quedan 5 horas de la ventana de 24 h; **`WA cerrada`** = fuera de ventana, **sólo se puede mandar plantilla** |
| **"1ª respuesta SLA"** | tiempo hasta la primera respuesta. **Sólo en Deals** — los Leads no tienen este reloj |
| Chip de **Responsable** | quién es el dueño |
| **"⏱ Próxima acción"** | barra de la siguiente tarea, con *Marcar hecho* y *Reprogramar* |
| Menú de **snooze** | *1 hora* · *3 horas* · *Mañana 9:00* · *Lunes 9:00* · *Elegir fecha…* |
| Diálogo de **Etiquetas** | incluye un bloque de **"Sugerencias"** |
| Chip de **grado/score** | abre el popover "por qué" (§6.1) |
| **CadencePicker** | estado o alta de cadencia (ver `06-…` §3.3) |

El chip **`WA cerrada`** es el que más preguntas genera: no es un error, es la
regla de Meta. Fuera de la ventana de 24 h sólo salen plantillas aprobadas.

**Qué pasa al posponer**: el snooze se manda como **epoch absoluto** (no como
texto de fecha, para que no haya deriva de zona horaria), escribe un comentario
en la línea de tiempo —*"💤 Pospuesto hasta X por &lt;usuario&gt;"*— y al
despertar manda una campanita de Notification Log **más push web, sólo al
dueño**. Las conversaciones pospuestas **también salen de "Vencidos"** mientras
duermen, que es justo el punto.

### 3.1 Huérfanos: cómo se colocan

Un huérfano es un entrante de un número sin Contacto/Lead/Deal (ver
`03-enrutamiento-y-procedencia.md` para cómo se llega ahí). Opciones:

- **Sugerencias de enlace**: coincidencias automáticas de Contacto/Lead/Deal por
  nombre y número, como chips de un toque. **Nunca se enlaza solo.**
- **Convertir** a Lead, Deal o Customer — el backend re-apunta sus mensajes. Un
  Deal o Lead entra a la cola normal y se abre; un Customer se archiva bajo su
  Contacto y sale de la cola.
- **Enlazar a existente**: re-apunta el huérfano a un Lead/Deal ya creado **y
  amarra su identidad durable** (PSID o teléfono) para que los siguientes
  entrantes se enlacen solos.
- **Archivar**: sale de "Sin asignar" pero el hilo sigue accesible y
  **contestable** en "Archivados". Un entrante nuevo lo **resucita solo** — no
  hace falta desarchivar. El encabezado cambia a "Desarchivar".

En Messenger se puede **responder a un huérfano sin asignarlo**: el destinatario
es el PSID, no hace falta registro. La fila queda sin referencia y se re-apunta
después, si conviertes o enlazas.

### 3.2 Comentarios de la página

Para cada comentario: **responder en público**, **responder por privado** (crea
un hilo de Messenger que luego aparece en la bandeja), **convertir a Lead**, u
**ocultar**. Tras un privado hay un salto directo al hilo de Messenger que se
acaba de crear.

---

## 4. Dentro del hilo

| Función | Qué hace |
|---|---|
| **Búsqueda en el hilo** | busca dentro de la conversación abierta. **Ojo con el alcance — ver §4.4** |
| 🧠 **Resumen** | resumen de IA del hilo; se recalcula cuando cambia el número de mensajes (caché de 6 h por conteo). Etiqueta de frescura: *"hace un momento"* (<45 s), *"hace N min"* (<60 min), *"hace N h"* (<24 h), *"hace N d"* |
| ✨ **Sugerir** | respuestas sugeridas; se **insertan** en el compositor, nunca se envían solas |
| **Chips de intención** | detectan qué quiere el cliente y abren la superficie que toca. **Ningún chip envía nada** — ver §4.3 |
| **Tira de presencia** | "quién está viendo / escribiendo" esta conversación, en vivo |
| **Banner de duplicado** | ⚠ posible duplicado, con "Ver" y —para gerentes— «Fusionar…» |
| **Notas de coaching** | anotaciones privadas del gerente. Un agente **no ve el panel en absoluto** |
| **Bitácora** | ver §6 |
| 📦 **Catálogo** | busca artículos en existencia y los manda como mensajes de medios; también con `/cat` |
| **Etiquetas** | filtro y gestión de etiquetas de conversación |

### 4.1 Presencia (evitar la doble respuesta)

Mapa efímero por conversación. Mientras tienes un hilo abierto **y la pestaña
visible**, se manda un latido de "viendo" cada 20 s; escribir manda un ping de
"escribiendo", limitado por el compositor. Los estados caducan solos en el
cliente: **"viendo" a los 25 s**, **"escribiendo" a los 6 s** — para que un
compañero que cerró la laptop no se quede pegado en la tira.

### 4.2 El traspaso de borrador

Funciones como el catálogo editable o "cobrar en el chat" **no envían**: dejan un
borrador (texto y, si aplica, un adjunto pendiente) que el compositor recoge y
limpia. **El operador siempre edita y manda a mano.**

### 4.3 Chips de intención

El backend (`doco_marketing.api.intent.detect_intent`) clasifica lo que el
cliente pide y devuelve `{intent, confidence, label}`. La SPA muestra **un solo
chip, o ninguno**:

| Intención | Chip | Qué abre |
|---|---|---|
| `pago` | 💳 **Cobrar** | el flujo de cobro |
| `factura` | 🧾 **Facturar** | el flujo de facturación |
| `cotizar_reparacion` | 🔧 **Cotizar reparación** | el taller |
| `precio` | 🏷 **Ver catálogo** | el selector de catálogo |

- **Umbral de confianza: 0.60.** Por debajo no se dibuja nada — no vale la pena
  molestar al operador con una corazonada débil.
- La comprobación **falla cerrada**: `NaN`, texto o `null` en la confianza →
  ningún chip.
- `otro` y cualquier intención desconocida no mapean a nada.
- Si el modelo devuelve su propia etiqueta corta en es-MX, esa gana sobre la
  etiqueta fija de la tabla.
- Los chips **abren superficies o prellenan el compositor**. El envío sigue
  siendo humano.

Qué hace cada uno al tocarlo (`DealWorkspace.vue:140-164`): **Cobrar** revela y
hace parpadear la sección 💰 Documentos —**no cobra nada**—; **Facturar**
prellena el compositor con el texto fijo que pide los datos fiscales; **Cotizar
reparación** cambia a la pestaña Reparación, y **sólo si el tenant tiene
taller**; **Ver catálogo** abre el selector de catálogo.

Se muestra **como máximo un chip**, sólo en la pestaña Conversación, y nada si
la IA está apagada.

### 4.4 La búsqueda en el hilo sólo ve lo cargado

`ThreadSearch` busca **únicamente sobre los mensajes ya cargados en la página**,
no sobre el historial completo de la conversación. Mínimo 2 caracteres,
insensible a acentos, y da la vuelta al llegar al final.

**La interfaz no dice esto en ninguna parte.** Es la causa más probable de un
reporte tipo "busqué y no aparece, pero yo sé que ese mensaje existe": hay que
bajar en el hilo para cargar más y volver a buscar. Para buscar de verdad sobre
todo, se usa la 🔍 **búsqueda global** del encabezado de la cola, que sí va al
servidor.

---

## 5. Cambiar el estado del trato

Desde la cabecera de la conversación.

- **Cambio optimista**: la UI se mueve de inmediato y se reconcilia con la
  respuesta; si falla, avisa y revierte.

### 5.1 Los estados que avisan al cliente

`utils/statusGuard.js` intercepta **todas** las rutas de cambio de estado
(DealHeader y DealContextPanel). Para los estados **`Completado`** y
**`Entregado`** abre un diálogo de confirmación con **dos caminos**:

| Botón | Qué hace |
|---|---|
| **"Cambiar y avisar al cliente"** | cambio normal; las automatizaciones de campaña corren |
| **"Cambiar SIN avisar"** | el servidor **suprime los envíos automáticos** para ese guardado |

Existe por **tres incidentes reales** de WABA equivocados. El caso típico: un
pedido viejo que se cierra tarde y le dispara al cliente un WhatsApp confuso
meses después. Si estás cerrando historia vieja, usa siempre "SIN avisar".

### 5.2 Los estados perdidos exigen motivo

Los estados de tipo **Perdido** (Deal: *Cancelado*, *Abandonado*; Lead: *Junk*,
*Unqualified*) **no se pueden guardar sin motivo** — la validación los rechaza en
ambos doctypes. Por eso el inbox abre el diálogo **"Motivo de cancelación"**
primero y escribe estado + motivo + notas juntos.

El **Lost Reason es obligatorio**, y las **Lost Notes también** cuando el motivo
es *"Other"*. Sin este paso, el cambio se quedaba en silencio sin aplicarse.

---

## 6. El panel de contexto

Es el expediente comercial del cliente al lado del hilo. Secciones (varias
dependen de banderas por tenant):

| Sección | Bandera | Contenido |
|---|---|---|
| Tarjeta de contacto editable | — | datos del cliente; el resolvedor dice en qué documento y campo vive cada valor, y la edición va por `frappe.client.set_value` con permisos |
| Contactos del trato | — | la tira de contactos/números |
| 💰 **Documentos** | `enable_sales_docs` | cotizaciones, documentos de venta, chip de saldo |
| Editor de cotización | — | edición en línea de la cotización |
| **Reparaciones** | `has_taller` | órdenes de reparación del trato (vertical taller) |
| Banner de duplicado | — | ver §4 |
| Notas de coaching | rol | sólo gerentes |
| **Bitácora** | — | libro mayor **cruzando canales**: WhatsApp + Messenger + comentarios en una sola línea de tiempo |
| Historial de consentimiento | rol | limitado a gerentes en el servidor; con 403 la sección **se auto-oculta** |

Las banderas se leen una vez por sesión con
`doco_marketing.api.inbox.get_inbox_features` y arrancan en **falso** hasta que
cargan — así la bandeja nunca pide campos o endpoints de taller en un tenant que
no lo tiene (p. ej. mumu).

Además, el panel abre con **"Macros rápidas"**: *Listo para entregar* ·
*Marcar completado* · *Recordatorio de pago*. Y la sección 💰 Documentos trae el
rollup **Facturado / Pagado / Saldo**, las listas de Cotizaciones, Órdenes de
venta, Facturas y Pagos, un visor de impresión en-app aislado, y el botón de
**💳 MercadoPago**, que genera el enlace y lo deja **como borrador en el
compositor** — no lo manda.

La tarjeta de contacto editable incluye **RFC, razón social y cumpleaños**, que
se escriben sobre el **Customer ligado**, no sobre el deal. También hay
**"Otros contactos"** y **"Todos los campos"**.

### 6.1 Score

La cabecera muestra el grado y el puntaje del lead, y el panel de contexto una
tarjeta con dona y la lectura del grado: **A = Top tier**, **B = Bueno**,
**C = Medio**, **D = Bajo**, más un **"% prob. conversión"**.

El popover **"por qué"** desglosa qué reglas sumaron o restaron, ordenadas por
peso. Detalle en `07-reportes-y-scoring.md`.

---

## 7. Después de una llamada

Cuando termina una llamada, un evento de socket abre la **hoja post-llamada**:
chips de resultado, una nota y un interruptor de "crear tarea". Ver
`04-telefonia.md`.

---

## 8. Qué vive dónde

Prácticamente **todo el backend de la bandeja está en `doco_marketing`**, no en
este repo. La SPA es la capa de presentación.

| Necesidad | Endpoint |
|---|---|
| Cola | `doco_marketing.api.inbox.get_conversation_queue` |
| Hilo | `…inbox.get_communications` |
| Enviar | `…inbox.send_message` |
| Huérfanos | `…inbox.get_unassigned_conversations`, `get_unassigned_thread`, `assign_unassigned`, `archive_orphan`, `unarchive_orphan`, `send_unassigned_messenger`, `suggest_link_targets`, `search_link_targets` |
| Contadores | `…inbox.get_channel_counts`, `get_overdue_conversations`, `get_snoozed_count` |
| Estado / lectura | `…inbox.set_status`, `mark_read`, `clear_responder` |
| Snooze | `…inbox.snooze_conversation`, `unsnooze_conversation` |
| Etiquetas | `…inbox.get_conversation_tags`, `tag_conversation`, `untag_conversation` |
| Presencia | `…inbox.presence` |
| Banderas | `…inbox.get_inbox_features` |
| Tarjeta / bitácora | `…inbox.get_contact_card`, `get_contact_ledger`, `get_contact_refs`, `get_contact_thread` |
| SLA | `…inbox.get_sla_status` |
| Catálogo | `…catalog.search`, `send_items`, `send_to_comment`, `suggest` |
| Sugerencias IA | `…inbox.suggest_replies` |
| Resumen | `…summary.thread_summary` |
| Intención | `…intent.detect_intent` |
| Duplicados | `…dedupe.find_duplicates`, `merge_duplicate` |
| Coaching | `…coaching.list_notes`, `add_note`, `delete_note` |
| Acuses | `…auto_reply.list_pending`, `pending_count`, `pending_for_ref`, `approve`, `discard` |
| Comentarios | `…comments.get_comment_post_groups`, `get_post_comments`, `reply_public`, `reply_private`, `create_lead`, `hide_comment`, `dm_target` |
| Búsqueda global | `…search.search_messages` |
| Consentimiento | `…consent.get_consent_history` |
| Cobro | `…inbox.create_payment_link` |

Del lado de este repo sólo está la lectura del hilo de WhatsApp
(`crm.api.whatsapp.get_whatsapp_messages`) y las rutas de envío/plantilla — ver
`02-whatsapp-plantillas-y-envios.md`.

---

## 9. Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| La bandeja pinta clientes de otro operador | No debería: la caché va por usuario. Si pasa, la cookie `user_id` no estaba disponible al escribir la caché |
| La cola se queda vieja | Se perdió el socket. Cambiar de pestaña y volver dispara el catch-up |
| No aparece la pestaña Messenger | `Marketing Settings.enable_messenger` apagado |
| No aparecen "Pospuestas" o "Por aprobar" | Están en cero — se ocultan a propósito |
| No hay sección de Reparaciones | El tenant no tiene `taller` (bandera `has_taller`) |
| Cambiar a "Cancelado" no hace nada | Falta el motivo — debe salir el prompt de captura |
| El panel de coaching no existe | Correcto para un no-gerente: se oculta entero |
| Un envío automático llegó y nadie lo aprobó | Revisar la cola "Por aprobar"; nada debería salir sin aprobación |
</content>
