# 04 — Telefonía: Twilio + softphone SIP

> Verificado leyendo los diffs contra el merge-base de
> `crm/integrations/twilio/api.py`, `twilio_handler.py`,
> `crm/fcrm/doctype/crm_twilio_settings/`, `crm_telephony_agent/`,
> `crm_call_log/crm_call_log.py` y `frontend/src/components/Telephony/TwilioCallUI.vue`.
> Estado: `261195f4`.

---

## 1. Qué añade el fork

Upstream soporta dos destinos de llamada por agente: **Computer** (el marcador
del navegador, vía Twilio Client) y **Phone** (reenvío a su celular). El fork
añade un tercero — **SIP Phone** — más el timbrado simultáneo, y arregla la
numeración mexicana.

| Capacidad | Upstream | Fork |
|---|---|---|
| Dispositivos por agente | Computer, Phone | + **SIP Phone** |
| Timbrado | uno a la vez | **paralelo**: SIP + navegador simultáneos |
| Números marcados | tal cual llegan | **normalizados a E.164** (reglas MX) |
| Llamadas salientes desde softphone | no | webhook `sip_voice` |
| Visibilidad de la bitácora | todos ven todo | **filtrada por jerarquía y sucursal** (ver `05-permisos-y-jerarquia.md`) |
| Actividad reciente | la llamada no movía el registro | `on_update` **sube el Lead/Deal** al tope |

---

## 2. Configuración (admin)

### 2.1 CRM Twilio Settings

Campos que añade el fork, en una sección **"SIP Phone (Beta)"** que sólo aparece
si Twilio está `enabled`:

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `enable_sip_phone` | Check | `0` | Con esto encendido, las llamadas entrantes para agentes cuyo dispositivo sea "SIP Phone" se reenvían a su softphone vía el dominio SIP de Twilio en vez del marcador del navegador. |
| `sip_domain` | Data | — | Ej. `docomexico.sip.twilio.com`. Se configura en la consola de Twilio: **Voice → SIP → Domains**. Sólo visible si `enable_sip_phone` está activo. |

### 2.2 CRM Telephony Agent (uno por usuario)

| Campo | Tipo | Notas |
|---|---|---|
| `call_receiving_device` | Select | Upstream traía `Computer` / `Phone`; el fork añade **`SIP Phone`** |
| `sip_username` | Data | Usuario en el dominio SIP de Twilio (ej. `marco`). **Sin `@` ni caracteres especiales.** Sólo visible si el dispositivo es SIP Phone |
| `sip_password` | Password | Contraseña de la credencial SIP, emparejada con `sip_username` en la **Credential List** de Twilio |

### 2.3 Checklist por modo

**(a) Marcador del navegador (Computer)** — configuración de upstream:
`call_receiving_device = Computer` y el agente con sesión activa en el CRM.

**(b) Softphone SIP**:
1. En Twilio: crear un SIP Domain y una Credential List; dar de alta la
   credencial (`sip_username` / `sip_password`).
2. En el CRM: `CRM Twilio Settings.enable_sip_phone = 1` y `sip_domain` con el
   dominio completo.
3. En el agente: `call_receiving_device = SIP Phone`, `sip_username`,
   `sip_password`.
4. En el softphone del agente: registrar contra el dominio SIP con esas
   credenciales.

**(c) Reenvío a celular (Phone)**: `call_receiving_device = Phone` y `mobile_no`
en el **User** (no en el Telephony Agent).

---

## 3. Llamada entrante: el árbol de decisión

`IncomingCall.process()` (`twilio_handler.py:186-212`):

```
1. Buscar los dueños del número Twilio marcado  → get_twilio_number_owners()
2. Elegir un "call attender"                    → get_the_call_attender()
3. ¿Nadie elegible?  →  TwiML .say("Agent is unavailable…")
4. device == "Phone"                → dial al mobile_no del User
5. device == "SIP Phone"
      Y enable_sip_phone            → SIP: sip:<sip_username>@<sip_domain>
      Y sip_domain configurado         + SI el agente tiene sesión activa,
      Y el agente tiene sip_username     TAMBIÉN el marcador del navegador
                                          → timbrado PARALELO
6. cualquier otro caso              → marcador del navegador (Twilio Client)
```

El paso 5 **cae al paso 6** si falta cualquiera de sus condiciones. Un agente
marcado como SIP Phone sin `sip_username`, o con `enable_sip_phone` apagado,
recibe la llamada en el navegador — nunca se queda sin timbrar por
configuración incompleta.

### 3.1 Elegibilidad (`get_the_call_attender`)

Un agente es candidato si:

- `device == "Phone"` **y** tiene `mobile_no`, **o**
- `device == "Computer"` **y** tiene sesión activa, **o**
- `device == "SIP Phone"` **y** tiene `sip_username` (el fork añadió esta rama).

### 3.2 Timbrado paralelo

`generate_twilio_parallel_response(targets, caller_id, ring_tone)` timbra
varios destinos a la vez; **el primero que conteste gana** y los demás cuelgan.
Cada destino es una tupla `(kind, value)`:

| kind | value |
|---|---|
| `sip` | URI SIP, ej. `sip:marco@docomexico.sip.twilio.com` |
| `client` | identidad de Twilio Client |
| `number` | número PSTN en E.164 |

Todos los destinos comparten el mismo callback de estado
(`initiated ringing answered completed`, POST) y la grabación se controla con
`settings.record_calls`.

### 3.3 Consulta de agentes vía SQL directo

`get_twilio_number_owners()` cambió de `frappe.get_all` a `frappe.db.sql`
**a propósito** (`twilio_handler.py:224-246`): el webhook de voz de Twilio corre
en **contexto Guest**, y el sistema de permisos de Frappe filtra las lecturas de
`CRM Telephony Agent` y `User` en ese contexto. El SQL directo garantiza que la
lógica de enrutamiento vea a **todos** los agentes asignados al número.

No lo "arregles" volviéndolo a `get_all`: reintroduce el bug de llamadas que no
timbran.

---

## 4. Llamada saliente

### 4.1 Desde el navegador

La SPA pide un token con
`crm.integrations.twilio.api.generate_access_token` y el SDK de Twilio Voice
arma el Device. El webhook `voice` recibe el `To`, lo normaliza y devuelve el
TwiML de marcado.

### 4.2 Desde el softphone SIP — `sip_voice` (nuevo)

Webhook nuevo, `@frappe.whitelist(allow_guest=True)`:

1. Twilio manda `From = sip:<username>@<sip-domain>`.
2. Se extrae el username y se busca el `twilio_number` del agente
   (`CRM Telephony Agent.sip_username`), que se usa como **caller ID**.
3. Si `enable_sip_phone` está apagado → responde TwiML **`<Reject/>`**.
4. Normaliza el `To` y devuelve el TwiML de marcado a PSTN.
5. Crea el CRM Call Log.

Nota: los webhooks de SIP Domain **no llevan `ApplicationSid`**, así que la
validación es sólo por `AccountSid`.

> **Asimetría entre entrada y salida.** El webhook de salida `sip_voice`
> comprueba **sólo `enable_sip_phone`**, no `sip_domain` (`api.py:96`). La rama
> de **entrada** sí exige los dos. O sea que un tenant con `enable_sip_phone=1`
> pero `sip_domain` vacío **puede marcar hacia afuera desde el softphone** y sin
> embargo **no recibe** llamadas por SIP. Es un estado de configuración a medias
> que se ve como "el teléfono marca pero no timbra".

---

## 5. Normalización E.164 — `_normalize_e164`

Es el arreglo que hace que la marcación mexicana funcione. Reglas, en orden:

| Entrada | Salida | Regla |
|---|---|---|
| `sip:5512345678@host` | `+525512345678` | quita el esquema (`sip:`, `sips:`, `tel:`) y todo desde `@` |
| `5512345678` (10 dígitos) | `+525512345678` | antepone el código de país (default `52`) |
| `+5215512345678` (13 dígitos, empieza `521`) | `+525512345678` | tira el "1" de operador del formato MX viejo |
| `15551234567` (11 dígitos, empieza `1`) | `+15551234567` | US/CA: sólo antepone `+` |
| `+525512345678` | igual | ya está en E.164, pasa derecho |

Se conservan sólo dígitos y el `+` inicial. Tres bordes exactos:

- La regla del `521` exige **exactamente 13 dígitos**. Un `521…` de 12 dígitos
  **no** se reescribe.
- La regla de 10 dígitos es un `elif`, o sea que **las dos reglas son mutuamente
  excluyentes**.
- Una entrada vacía o falsy **se devuelve tal cual, sin `+`**; cualquier otro
  camino siempre antepone `+`.

> Nota histórica: una versión previa de esta página advertía que el recorte del
> URI SIP dependía de que el host no tuviera dígitos. El código actual quita el
> esquema y **todo desde `@`** antes de extraer dígitos, así que un host con
> números o un `:puerto` explícito ya no contaminan el número marcado.

---

## 6. Dirección y atribución de la llamada

`TwilioCallDetails.get_direction()` ahora trata como **Outgoing** tanto
`client:…` como `sip:…` — sin eso, toda llamada originada en un softphone se
registraba como entrante.

Para las salientes desde SIP, el "caller" se resuelve al usuario del CRM
buscando `CRM Telephony Agent.sip_username` → `user`. Para las de navegador se
mantiene la ruta de upstream (`client:` → `emailid_from_identity`).

---

## 7. Bitácora de llamadas (CRM Call Log)

### 7.1 El registro sube al tope

`CRMCallLog.on_update` → `_touch_linked_records()`: por cada Lead/Deal ligado
(vía `reference_doctype`/`reference_docname` **o** vía la tabla `links`), hace
`frappe.db.set_value(dt, name, "modified", now, update_modified=False)`.

Efecto para el usuario: **una llamada nueva mueve el registro al tope** de los
ordenamientos por "última actualización". El `update_modified=False` evita que
la escritura se cuente a sí misma como una modificación adicional.

Sólo toca `CRM Lead` y `CRM Deal`; ignora silenciosamente destinos que ya no
existen.

### 7.2 Permisos

Con el fork, la bitácora está sujeta al mismo modelo que leads y deals, con dos
campos de propietario: **`caller`** y **`receiver`**. Ves una llamada si la
hiciste, si la recibiste, si la hizo alguien de tu subárbol, o si pertenece a
una de tus sucursales (`doco_shop`). Detalle completo en
`05-permisos-y-jerarquia.md`.

---

## 8. La UI de llamada en el navegador

Dos arreglos en `TwilioCallUI.vue` que se ven como comportamientos raros si no
se conocen:

### 8.1 "Click anywhere to enable call audio…"

La política de autoplay del navegador bloquea el AudioContext que usa el SDK de
Twilio Voice a menos que el `Device` se construya **después de un gesto del
usuario**. `initDeviceAfterGesture(token)`:

- Si `navigator.userActivation.hasBeenActive` ya es verdadero, arma el Device de
  inmediato.
- Si no, muestra *"Click anywhere to enable call audio…"* (es-MX: *"Haz clic en
  cualquier parte para habilitar el audio…"*) y espera el primer
  `pointerdown` / `keydown`.

Ese mensaje **no es un error**. Es el estado normal al cargar la app sin haber
tocado nada todavía.

### 8.2 Nunca armar el Device sin token

Un tenant o usuario a medio configurar recibe una respuesta exitosa **sin token
usable**. Construir `new Device(undefined)` lanza `InvalidArgumentError`
**dentro de un listener de captura a nivel documento** — es decir, en el
siguiente clic del operador en cualquier parte, matando lo que ese clic estaba
haciendo. Eso blanqueó una navegación en prod el 2026-07-27.

La guarda (commit `283a428d`) falla abierto: si el token no es una cadena no
vacía, escribe *"Twilio sin token para este usuario — llamadas desactivadas"* y
no arma nada. Además `safeInitializeDevice` envuelve la construcción en
`try/catch` para que ningún fallo del Device escape del listener.

**Sin telefonía, pero sin app rota.**

---

## 9. Superficies de llamada en la SPA

| Superficie | Archivo | Notas |
|---|---|---|
| Marcador flotante | `components/Telephony/TwilioCallUI.vue`, `CallUI.vue` | `CallUI` enruta por medio (`twilio` / `exotel`) |
| Vista de llamadas | `pages/CallsView.vue` | página nueva del fork |
| Cajón de detalle | `components/doco/calls/CallDetailDrawer.vue` | consume `doco_marketing.api.calls.get_call_detail`; `enqueue_transcription` para transcripción. Desde 2026-08-03 el audio usa `recording_url_path` (proxy autenticado — la URL cruda de Twilio no reproduce en el navegador) y las notas van por `save_call_note`, que crea/actualiza la `FCRM Note` ligada (`note` es Link, texto libre directo tronaba la validación) |
| Modal de detalle (Desk-like) | `components/Modals/CallLogDetailModal.vue` | parche de upstream: `<audio v-if="field.value">` para que un `recording_url_path` vacío no dispare el warning "Cannot play media… text/html" |
| Hoja post-llamada | `components/doco/inbox/PostCallSheet.vue` + `utils/postcallOutcome.js` | ver §9.1 |

La transcripción de llamadas y el detalle enriquecido viven en
`doco_marketing`, no aquí.

### 9.1 La hoja post-llamada

La abre el evento realtime **`doco_marketing:call_ended`**, publicado por
`doco_marketing/services/postcall.py::on_call_log`, registrado como hook
**`after_insert`** sobre CRM Call Log (`doco_marketing/hooks.py:45-52`). Es un
evento **dirigido al agente** (`user=<agente>`, `after_commit=True`), nunca una
difusión. El agente es el `receiver` en entrantes y el `caller` en salientes.

Sólo se publica si `telephony_medium == "Manual"` **o** el estado está en
`{Completed, No Answer, Busy, Failed, Canceled}`.

**Se suscribe únicamente `pages/Inbox.vue:227`** — la hoja existe sólo en la ruta
de la bandeja. Fuera del inbox, una llamada que termina no abre nada.

> **Caveat**: al ser `after_insert` y no `on_update`, un registro de Twilio que
> se inserta como "Ringing" y **luego** muta a "Completed" no vuelve a disparar
> el evento. **TODO-VERIFY** en prod: si en la práctica los logs entran ya en
> estado final, no hay problema; si entran en "Ringing", la hoja nunca aparece
> para esas llamadas.

Resultados que ofrece (`utils/postcallOutcome.js`, en paridad con
`api/postcall.py::_OUTCOMES`):

| Valor | Etiqueta |
|---|---|
| `contesto` | ✅ Contestó |
| `no_contesto` | 📵 No contestó |
| `buzon` | 📼 Buzón |
| `venta` | 💰 Venta |
| `otro` | • Otro |

Además acepta una nota y ofrece crear una tarea para **mañana a las 9:00**. Esa
hora se calcula **en el dispositivo, en la zona horaria del operador**, y se
manda como **epoch absoluto** — el backend lo convierte a la zona del sitio, sin
deriva entre la zona del dispositivo y la del sitio. Es el mismo patrón que usa
el snooze de la cabecera del deal.

**Dónde acaba el resultado — importante**: `log_outcome` **no escribe el
resultado en ningún campo del CRM Call Log**. Inserta un **Comment**
(`comment_type` "Info") sobre el Lead/Deal ligado, con contenido `📞 <etiqueta>`
más la nota escapada. Best-effort: se omite si la llamada no tiene referencia a
Lead/Deal o si el usuario no tiene permiso de lectura sobre ella.

Si además se pidió tarea, inserta una **CRM Task** ("Seguimiento de llamada —
&lt;etiqueta&gt;", estado Todo, prioridad Medium, asignada al usuario de la
sesión, vencimiento desde el epoch del cliente, **rechaza un vencimiento en el
pasado**) y la enlaza de vuelta al call log.

La compuerta de permiso es `check_permission("write")` sobre la llamada, y la
nota se guarda con `escape_html`.

> Consecuencia para reportes: **no existe hoy una columna consultable de
> "resultado de llamada"**. Si alguien quiere "cuántas llamadas acabaron en
> venta", eso hay que sacarlo de los Comments, no del doctype de llamadas.

---

## 10. Webhooks a configurar en Twilio

| Para | Método (ruta punteada) |
|---|---|
| Voz saliente desde el navegador | `crm.integrations.twilio.api.voice` |
| Voz saliente desde el softphone SIP | `crm.integrations.twilio.api.sip_voice` |
| Llamada entrante | `crm.integrations.twilio.api.twilio_incoming_call_handler` |
| Estado de llamada / grabación | callbacks que el propio TwiML declara (`get_update_call_status_callback_url`, `get_recording_status_callback_url`) |

Todos son `allow_guest=True` y validan la firma de Twilio.

**TODO-VERIFY**: la URL pública exacta que hay que pegar en la consola de Twilio
depende del sitio (`/api/method/<ruta punteada>`); no se verificó contra una
configuración viva de Twilio en esta revisión.

---

## 11. Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| "Click anywhere to enable call audio…" no se quita | No ha habido gesto; es esperado. Un clic lo resuelve |
| "Twilio sin token para este usuario — llamadas desactivadas" | El agente no tiene CRM Telephony Agent configurado, o el tenant no tiene Twilio completo |
| El softphone no timbra | `enable_sip_phone` apagado, `sip_domain` vacío, o el agente sin `sip_username` — cae al navegador |
| Llamadas del softphone salen rechazadas | `enable_sip_phone = 0` → el webhook `sip_voice` responde `<Reject/>` |
| Se marca a un número equivocado desde SIP | Revisar el `To` crudo en el webhook — `_normalize_e164` ya recorta esquema y `@host:puerto`, así que el problema suele venir de origen |
| Llamadas de softphone quedan como "Incoming" | Regresión en `get_direction()`: debe aceptar el prefijo `sip:` |
| Nadie timbra aunque hay agentes | Revisar que la consulta de agentes siga siendo SQL directo (contexto Guest) |
| Un deal no sube al tope tras una llamada | El Call Log no tiene referencia ni link a ese Lead/Deal |
</content>
