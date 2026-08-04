# 03 — Enrutamiento de mensajes y procedencia

> Verificado leyendo `crm/api/whatsapp_routing.py` completo,
> `crm/patches/v1_0/create_message_provenance_fields.py` completo y las rutas de
> sellado en `crm/api/whatsapp.py`. Estado: `261195f4`.
>
> Este documento explica **cómo un mensaje entrante encuentra su conversación**
> y **cómo se sabe quién mandó cada mensaje**. Es la parte del fork que más
> cambia respecto a upstream y la que más soporte genera cuando falla.

---

## 1. El problema que resuelve

Un hilo de WhatsApp es físicamente **por teléfono** (un hilo por número). El
inbox del fork es **por deal**: cada mensaje necesita una referencia para
aparecer en una conversación.

La resolución de upstream era: *"el deal modificado más recientemente, LIMIT 1"*
— sin filtro de abierto/cerrado y sin noción del tiempo
(`crm/api/whatsapp_routing.py:6-11`). Eso producía dos fallas reales:

1. Un cliente que escribe meses después de cerrar un trabajo **resucitaba el
   deal muerto**.
2. Cada trabajo nuevo se apilaba sobre el deal que se hubiera tocado al final —
   *acreción de deal-dios*.

El fork sustituye esa consulta por una **escalera de atribución** de tres
peldaños en un archivo nuevo (`crm/api/whatsapp_routing.py`), que por ser nuevo
nunca da conflicto en un rebase.

---

## 2. Cuándo corre el resolvedor

`crm/api/whatsapp.py:36-53` — el hook `validate` sobre WhatsApp Message:

```python
if doc.get("reference_doctype") and doc.get("reference_name"):
    return          # ya viene enhebrado: NO tocar
phone_number = doc.get("from") if doc.type == "Incoming" else doc.get("to")
```

**Regla central**: la resolución es un **respaldo para mensajes sin referencia**
(entrantes del webhook, salientes desnudos), **nunca un override**. La versión
anterior sobrescribía incondicionalmente y re-enrutaba envíos deliberadamente
enhebrados (los del compositor del inbox, los de la fila de revisión de taller)
hacia el deal que el resolvedor eligiera.

Si el resolvedor lanza una excepción se registra en el error log
(`"CRM WhatsApp: failed to resolve contact from number"`) y el mensaje queda sin
referencia — **nunca bloquea la recepción del mensaje**.

---

## 3. La escalera de atribución

`resolve_reference_for_number(number)` devuelve `(docname, doctype)` o
`(None, None)` → huérfano.

### Paso 0 — encontrar el Contacto

```
get_contact_by_phone_number(number)      # ruta de upstream
   └─ si falla → _contact_by_trailing_digits(number)   # el arreglo del fork
```

**La trampa MX**: WhatsApp manda el `from` como `521XXXXXXXXXX` mientras que
los contactos guardan `+52 XX…`. El `LIKE` por subcadena de upstream falla en
ambas direcciones, así que clientes reales con deals abiertos se resolvían como
huérfanos.

El respaldo `_contact_by_trailing_digits` (`whatsapp_routing.py:93-108`)
normaliza a los **últimos 10 dígitos** — `+52`, `52 1` y el local pelón colapsan
a la misma llave — y busca en la tabla hija `Contact Phone`, así que también
resuelven los **números secundarios** de un contacto. Menos de 10 dígitos → no
resuelve.

Si no hay Contacto en absoluto, cae al camino de upstream
`get_contact_lead_or_deal_from_number`, que cubre la ruta de CRM Lead.

### Peldaño 1 — trabajo activo

Todos los deals donde el contacto es **primario** (`CRM Contacts.is_primary =
1`), ordenados por `modified DESC`. El primero cuyo tipo de estado **no** sea
terminal gana.

```python
_TERMINAL_STATUS_TYPES = {"Won", "Lost", "Junk"}
```

Un tipo de estado desconocido o ausente **falla hacia abierto** (se trata como
activo) a propósito: un estado mal configurado nunca debe dejar huérfano un
trabajo vivo.

> Nota de arquitectura: este conjunto duplica
> `doco_marketing.services.inbox.common._TERMINAL_STATUS_TYPES`. Está duplicado
> **a propósito** — `crm` no puede importar `doco_marketing`, porque marketing
> se instala en menos tenants que crm (`whatsapp_routing.py:27-30`). Si cambias
> el vocabulario de estados terminales, cámbialo en los dos lados.

### Peldaño 2 — ventana post-venta

Sin deal abierto, se recorren los deals terminales (del más reciente al más
viejo) y gana el primero que cumpla **cualquiera** de estas dos:

- **Garantía viva**: existe una Repair Order ligada al deal con
  `warranty_expires_on >= CURDATE()`. Un reclamo de garantía es el tema
  probable y alimenta el flujo existente de "Reabrir orden". Esta consulta está
  guardada con `"taller" not in frappe.get_installed_apps()` y envuelta en
  `try/except` — taller no está instalado en todos los tenants.
- **Gracia post-entrega**: el deal se tocó dentro de
  `POST_SALE_GRACE_DAYS = 14`. El caso de uso es "olvidé el cargador": alguien
  que escribe poco después de la entrega casi seguro habla del trabajo recién
  cerrado.

### Peldaño 3 — fuera de ventana

- ¿El contacto tiene un lead? → el lead. Un lead le gana a un huérfano; un deal
  muerto no.
- Si no → `(None, None)`: el mensaje queda **huérfano** y aparece en la bandeja
  **"Sin asignar"** para que un humano lo coloque.

Quedar huérfano no esconde nada: la unión de hilos a nivel contacto significa
que el mensaje sigue siendo visible en el hilo del teléfono.

### 3.1 La escalera de un vistazo

```
mensaje sin referencia
   │
   ├─ ¿ya trae reference_doctype+name? ──► SE RESPETA, fin
   │
   ├─ Contacto por teléfono  (upstream → últimos 10 dígitos)
   │     └─ sin Contacto ──► ruta upstream lead/deal
   │
   ├─ 1. deal ABIERTO más reciente                 ──► CRM Deal
   ├─ 2. deal terminal con garantía viva
   │       o tocado en los últimos 14 días         ──► CRM Deal
   ├─ 3. lead del contacto                          ──► CRM Lead
   └─    nada                                       ──► huérfano ("Sin asignar")
```

---

## 4. Realtime: por qué el payload lleva el teléfono

`crm/api/whatsapp.py:56-71`, hook `on_update`:

```python
frappe.publish_realtime("whatsapp_message", {
    "reference_doctype": ..., "reference_name": ...,
    "phone": doc.get("from") if doc.type == "Incoming" else doc.get("to"),
}, after_commit=True)
```

Dos detalles que se ven como bugs si no se conocen:

- **`after_commit=True`** — sin esto el `publish` corre antes del commit, el
  refetch del frontend lee la fila vieja y la UI se queda con datos rancios
  hasta un F5 manual.
- **El campo `phone`** — la captura de huérfanos del inbox
  (`Inbox.vue onWaMessage`) empata el hilo abierto de "Sin asignar" por dígitos
  finales. Sin teléfono en el payload, un hilo huérfano abierto nunca se
  refresca en vivo al llegar un entrante.

Además, `notify_agent` (`whatsapp.py:76-105`) notifica a **los usuarios
asignados** de la referencia — sólo para mensajes `Incoming` y sólo si el
mensaje tiene referencia. Un huérfano no notifica a nadie; se descubre en la
bandeja "Sin asignar".

---

## 5. Procedencia: quién mandó cada mensaje

El patch `crm.patches.v1_0.create_message_provenance_fields` crea **campos
personalizados sobre `WhatsApp Message`** (no toca el doctype de upstream, así
que sobrevive a un rebase). Todos son de **sólo lectura** y viven en una sección
plegable "Provenance" insertada después de `reference_name`.

| Campo | Tipo | Opciones / ejemplo | Para qué |
|---|---|---|---|
| `doco_provenance_section` | Section Break | — | contenedor plegable |
| `doco_sent_by_type` | Select | `Human` / `Automation` / `Bot` (default `Human`) | la pregunta principal; es filtro estándar |
| `doco_actor_user` | Link → User | — | quién lo tecleó o lo disparó |
| `doco_automation_source` | Data | `taller.tracker_notify:Recibido` | qué regla lo produjo |
| `doco_bot` | Data | — | reservado para el motor de chatflow |
| `doco_bot_step` | Data | — | reservado; paso dentro del flujo |

`doco_bot` es **Data y no Link** a propósito: existe antes de que exista
cualquier doctype Chatflow/Agent Bot, para que el motor de fase 2 entre sin
cambio de esquema.

### 5.1 Dónde se sella

| Punto de envío | Sellado |
|---|---|
| `create_whatsapp_message` (`whatsapp.py:292-298`) | `Human` + `doco_actor_user=frappe.session.user`; si el texto vino de una respuesta rápida, además `doco_automation_source = f"canned:{canned}"`. El frontend manda `canned="ai"` cuando se envía verbatim una respuesta sugerida por IA (`WhatsAppBox.vue:703`) |
| `send_whatsapp_template` (`whatsapp.py:320-321`) | `Human` + `doco_actor_user=frappe.session.user` |

**Sólo dos sitios en todo el stack sellan `Automation`:**

| Sitio | Cuándo | Formato de `doco_automation_source` |
|---|---|---|
| `doco_marketing/.../whatsapp_send_review.py:99-120` (rama `auto=1` en `:100-102`) | **sólo** si la fila tiene `auto=1` | el `source` de la fila; si viene vacío, `f"WhatsApp Send Review:{template}"` |
| `taller/taller/services/tracker_notify/__init__.py:306-309` | envío directo, sin encolar | `f"taller.tracker_notify:{status}"` — p. ej. `taller.tracker_notify:Recibido` |

Las filas con `auto=0` —o sea, **todo lo que un humano aprobó**— se sellan como
`Human` con `doco_actor_user = sent_by`. Eso es lo correcto: quien aprobó es el
responsable del mensaje. **Desde 2026-08-03** esas mismas filas además sellan
`doco_automation_source` con el `source` de la fila cuando existe, y un source
`chatflow:<flow>:<step>` rellena también `doco_bot` / `doco_bot_step` (que
llevaban sin escribirse desde la compuerta H1). Inbox Auto Reply hace lo
equivalente en sus dos ramas de envío. El chip sigue leyendo
`doco_sent_by_type`, así que la UI no cambia.

Los `source` que llegan al primer sitio los ponen los productores:
`chatflow:{flow}:{step_label}`, `review_ask`, `abandoned_checkout`,
`abandoned_cart`, `restock_notify`, `reactivation:{segment}`.

### 5.2 Dos cosas que NO son "Automation" aunque lo parezcan

- **Los chatflows**: `services/chatflow.py` no sella procedencia — sus
  `:520-521` (`_human_attended`) y `:543-551` (`_recently_triggered`) son
  **lecturas** (filtros para `frappe.db.exists`), no escrituras. Quien sella es
  la cola al enviar: la fila escenificada lleva `source =
  chatflow:<flow>:<step>` y `whatsapp_send_review._send` lo convierte en
  `doco_automation_source` + `doco_bot`/`doco_bot_step` (desde 2026-08-03).
  Además, un Chatflow sólo encola con `auto=1` si
  tiene `auto_send=1` (`:135`).
- **Messenger**: `services/dispatch/messenger.py:227-228` sella `Human` sobre
  Messenger Message.
- **`repair_updates.py`** siempre encola con `auto=0`, así que **nunca** produce
  un `Automation` — sus mensajes acaban sellados como el humano que los aprobó.

Si auditas "qué mandó la máquina", filtrar por `doco_sent_by_type="Automation"`
te devuelve sólo lo que se disparó sin humano. Desde 2026-08-03 la consulta
correcta para "origen máquina, apruebe quien apruebe" es
`COALESCE(doco_automation_source,'') <> ''`. La historia también cuenta: el
backfill del 2026-08-04 (`doco_marketing/patches/v0_4/backfill_automation_provenance`)
recuperó el campo para todo envío histórico con fila `Enviado` en la cola
(224 mensajes en prod vía el link `wa_message` + su `source`; los acuses de
Inbox Auto Reply viejos no son recuperables — sin link al mensaje).

### 5.3 El backfill es honesto, no exacto

El patch rellena filas viejas con:

```sql
UPDATE `tabWhatsApp Message`
   SET doco_sent_by_type = 'Human', doco_actor_user = owner
 WHERE doco_sent_by_type IS NULL OR doco_sent_by_type = ''
```

No se puede recuperar el disparador real de envíos automáticos antiguos, así
que **todo lo histórico queda atribuido a su creador como Human**. Es el piso
honesto, no la verdad. Sólo las filas creadas después del patch traen
procedencia real. Si haces auditoría sobre `doco_sent_by_type`, filtra por
fecha.

### 5.4 Cómo se leen los campos

`_wa_message_fields()` (`whatsapp.py:653-664`) añade
`doco_sent_by_type`, `doco_actor_user`, `doco_automation_source` y `doco_bot` a
la selección **sólo si la columna existe**. Nota que **`doco_bot_step` no se
selecciona**: existe en el esquema pero la UI nunca lo lee.

```python
if frappe.db.has_column("WhatsApp Message", "doco_sent_by_type"):
```

O sea: en un bench donde el patch todavía no corrió, la UI degrada en vez de
tronar. Si la procedencia no aparece en el inbox, lo primero que hay que
comprobar es que el patch haya corrido (`bench --site <site> migrate`).

---

## 6. Duplicados

La detección de duplicados **no vive en este repo**: es
`doco_marketing.api.dedupe.find_duplicates` / `merge_duplicate`, consumida por
`frontend/src/components/doco/inbox/DuplicateBanner.vue`.

Lo que sí vive aquí es la **normalización de teléfono compartida**:
`frontend/src/utils/phoneNormalize.js` es el espejo cliente de la lógica del
backend — la misma convención de últimos 10 dígitos que usa
`_contact_by_trailing_digits`. Si cambias una, cambia la otra; el contrato está
documentado en ambos archivos.

Ver `01-inbox-conversaciones.md` para el flujo de usuario de "posible duplicado
→ Fusionar".

---

## 7. Diagnóstico rápido

| Síntoma | Causa probable | Dónde mirar |
|---|---|---|
| Mensaje de un cliente conocido cae en "Sin asignar" | El contacto no resolvió por teléfono, o su deal es terminal y está fuera de la ventana de 14 días sin garantía viva | `_contact_by_trailing_digits`; el `status` del deal y su `type` |
| Un deal cerrado hace meses "revive" | Estado con `type` vacío o desconocido → el peldaño 1 falla hacia abierto | La tabla `CRM Deal Status` |
| Un envío enhebrado a propósito acaba en otro deal | Regresión del override: el `validate` debe retornar temprano si ya hay referencia | `whatsapp.py:41-42` |
| El hilo huérfano abierto no se refresca solo | Falta `phone` en el payload de realtime | `whatsapp.py:68` |
| No se ve la procedencia en el inbox | El patch de campos no ha corrido | `bench --site <site> migrate`; `frappe.db.has_column` |
| La garantía no cuenta para el peldaño 2 | `taller` no instalado en ese tenant (guarda deliberada) | `frappe.get_installed_apps()` |
</content>
