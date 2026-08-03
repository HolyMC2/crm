# 08 — Notas del rediseño de la SPA

> Documento para desarrolladores. Verificado leyendo `frontend/src/router.js`,
> `main.js`, `vite.config.js`, `public/push-sw.js`, los composables
> (`push`, `outbox`, `telemetry`, `installNudge`, `navModel`, `breakpoint`,
> `swipeBack`), `utils/storageKeys.js`, `src/index.css` y
> `services/doco/*`. Estado: `261195f4`.

---

## 1. Tabla de rutas

Base del router: `createWebHistory('/crm')`.

### 1.1 Rutas del fork

| Ruta | Nombre | Página |
|---|---|---|
| `/inbox` | Inbox | `Inbox.vue` — **el aterrizaje por defecto** |
| `/leads` | Leads List | `LeadsView.vue` |
| `/deals` | Deals List | `DealsView.vue` |
| `/deal/:dealId` | Deal 360 | `Deal360.vue` |
| `/tasks` | Tasks List | `TasksView.vue` |
| `/call-logs` | Calls List | `CallsView.vue` |
| `/pipeline-analysis` | Pipeline Analysis | `PipelineAnalysis.vue` |
| `/campaigns` | Campaigns | `Campaigns.vue` |
| `/campaigns/:campaignId` | Campaign | `CampaignDetail.vue` |
| `/chatflows` | Chatflows | `Chatflows.vue` |
| `/reports` | Reports | `Reports.vue` |
| `/workload` | Workload | `WorkloadView.vue` — *"Carga de trabajo"* |
| `/score-rules` | Score Rules | `ScoreRules.vue` |
| `/webshop` | Webshop | `Webshop.vue` |
| `/whatsapp-queue` | WhatsApp Queue | `WhatsAppQueue.vue` — *"Aprobaciones WhatsApp"* |
| `/social` | Social | `SocialCalendar.vue` |
| `/social/evergreen` | Social Evergreen | `SocialEvergreen.vue` — *"Biblioteca evergreen"* |
| `/social/mentions` | Social Mentions | `SocialMentions.vue` — *"Menciones"* |

Ojo con la colisión de nombres: las rutas **plurales sin sufijo** (`/leads`,
`/deals`, `/tasks`, `/call-logs`) son las del fork; las de upstream conservan el
sufijo `/view/:viewType?` (`/leads/view/…`) y el singular con id
(`/leads/:leadId`, `/deals/:dealId`). Es decir, **conviven** las listas nuevas y
las de upstream.

`/deal/:dealId` (singular) es la página nueva **Deal 360**; `/deals/:dealId`
(plural) sigue siendo la página de deal de upstream. No es un typo.

### 1.2 El cambio de aterrizaje

```js
} else if (to.name === 'Home' && isLoggedIn) {
  // FCRM redesign: the omnichannel Inbox is the default landing (handoff §5.1).
```

La ruta `/` no declara componente; el guard `beforeEach` manda al usuario
autenticado a la bandeja. Sin sesión, redirige a
`/login?redirect-to=/crm`.

### 1.3 Selección móvil de componente — dos mecanismos distintos

`handleMobileView(name)` devuelve `Mobile<Name>` cuando `window.innerWidth < 768`
— mecanismo de upstream, conservado para Lead/Deal/Contact/Organization. Se
evalúa **una sola vez al importar la ruta** y **no** reacciona a un resize.

El shell del fork **no** usa eso: `App.vue:39-41` elige el layout con un
`computed` sobre el `isMobile` **reactivo** de `composables/breakpoint.js`
(`useWindowSize`, <640 px). Ese cambio salió del hallazgo LOW-3 de la auditoría:
usar `window.innerWidth` a secas congelaba la decisión en el arranque, así que
girar una tablet cruzando los 640 px no cambiaba de layout hasta navegar a otra
ruta.

---

## 2. Navegación

`composables/navModel.js` es la única fuente de verdad de la navegación, y
`routeGroup(path)` decide qué entrada se ilumina (una ruta enciende exactamente
un grupo).

**Principal**: Dashboard · Leads · **Inbox** (badge `unread`) · **Aprobaciones**
(badge `pending`) · Deals · Campaigns · Social · Calendario · Calls · Tasks
(badge `overdue`) · Reports.

**Inferior**: Score Rules · Carga de trabajo · Webshop.

**Barra inferior móvil** (`Mobile/MobileTabBar.vue`, `aria-label="Navegación
principal"`): `Inbox` · `Leads` · `Deals` · `Tasks` · `Más`.

El riel de escritorio es `Layouts/DocoNavRail.vue`: colapsable **58 px ⇄ 210 px**,
con la preferencia persistida por navegador en `doco-nav-expanded`. Monta las
Notificaciones y el modal de Ajustes, y trae un popup de perfil
(Dashboard / Score Rules / Settings / Sign out). Los puntos de badge vienen de
`doco_marketing.api.shell.get_badge_counts`, que en escritorio **se recarga en
cada cambio de ruta sin caché** (en móvil sí usa `cache: 'shellBadgeCounts'`).

El cajón móvil es `Mobile/MobileSidebar.vue` (+308 −88 sobre upstream: relenguaje
al riel, toggle de modo oscuro, cambiador de apps, montaje de ajustes, badges, y
el **único** interruptor de push — ver §5).

> `AppSidebar.vue` de upstream sigue en el árbol **sin usarse**, a propósito,
> para mantener el fork limpio de cara al rebase. No lo borres pensando que es
> código muerto del fork.

---

## 3. PWA

Se construye con `vite-plugin-pwa` (estrategia generateSW de workbox más
`importScripts`).

| Ajuste | Valor | Por qué |
|---|---|---|
| `name` / `short_name` | `CRM` | neutral, multi-tenant |
| `scope` | `/crm` | |
| `lang` | `es` | |
| `theme_color` | `#16a34a` | **limitación**: el manifiesto es por build, así que el color del ícono no puede ser por tenant |
| `shortcuts` | Inbox, Leads | long-press del ícono |
| `workbox.importScripts` | `['push-sw.js']` | los handlers de push viven en `public/push-sw.js`, junto al `sw.js` generado, para que un import relativo resuelva en producción |
| `maximumFileSizeToCacheInBytes` | **5 MiB** | el chunk de Activities y `index.css` pasaron el default de 2 MiB de workbox, que **falla el build duro** (no es un warning). Revisar si los chunks siguen creciendo |

### 3.1 La PWA NO cachea recursos — verificado

**No prometas funcionamiento sin conexión.** El `sw.js` construido
(`crm/public/frontend/sw.js`, 929 bytes) precachea **exactamente una entrada**:

```js
e.precacheAndRoute([{url:"manifest.webmanifest", revision:"6679e394…"}],{})
```

Y en `crm/public/frontend/assets/` hay **309 archivos**. Ninguno está
precacheado.

Lo que el service worker sí hace: `importScripts("push-sw.js")`,
`skipWaiting()`, `clientsClaim()`, `cleanupOutdatedCaches()` y una
`NavigationRoute` atada a `index.html`.

O sea que la PWA de hoy es un **cascarón instalable con push**, no una caché de
recursos para trabajar sin red. Lo único que de verdad sobrevive sin conexión es
el **outbox** (§6) y la caché de la cola — y ambos viven en `localStorage`, no
en el service worker.

**Consecuencia incómoda**: el tope de precaché de 5 MiB se subió para que el
chunk de Activities y `index.css` cupieran… y hoy no se precachea ninguno de los
dos. La falla de build que motivó ese cambio era real, pero el resultado que
buscaba no se está logrando. Si alguien quiere offline de verdad, esto es lo
primero que hay que investigar (probable: los patrones de glob de workbox no
casan con `assets/` bajo `--base=/assets/crm/frontend/`).

---

## 4. La guarda de despliegue rancio

Este es el mecanismo más importante de operación del frontend.

**El problema**: la bandeja es una pestaña de vida larga que nunca navega. Un
despliegue la deja en el bundle viejo hasta un F5 manual — y el service worker
**no puede** cambiarla, porque su alcance es `/assets/crm/frontend/` y nunca
controla `/crm`.

**El mecanismo**, en dos capas, revisadas cada **30 minutos** y cada vez que la
pestaña recupera el foco:

1. `navigator.serviceWorker.getRegistration('/assets/crm/frontend/')` →
   `update()`. El **alcance explícito** es obligatorio: un `getRegistration()`
   pelón resuelve `undefined` y el `update()` nunca corría (la misma trampa de
   alcance que rompió el subscribe de push).
2. Se compara `build.json` contra el `__BUILD_ID__` horneado en el bundle. Si
   difieren, hay un build más nuevo. La query anti-caché mantiene fuera a
   Cloudflare y al navegador.

`vite.config.js` genera el `BUILD_ID` (un `Date.now()` por build), lo inyecta vía
`define` y lo emite además como `build.json` con un plugin `emit-build-id`.

### 4.1 Recarga a prueba de borradores

Recargar duro a media conversación se comería lo que el operador está
escribiendo. Si al detectar un build nuevo **cualquier `<textarea>` tiene
texto**, se difiere y sale un solo aviso:

> 🔄 Nueva versión lista — se aplicará cuando termines de escribir

Se aplica en el siguiente chequeo (tick de 30 min, refoco de pestaña, o al
vaciarse el compositor tras enviar).

**Sólo `<textarea>`**, a propósito: los inputs de búsqueda y filtro guardan texto
durante días y diferirían la actualización para siempre.

### 4.2 El tag de build manual

```js
window.__CRM_BUILD__ = '2026-06-24a'
```

Efecto secundario global (sobrevive a la minificación, un comentario no).
Bumpearlo fuerza un bundle con hash nuevo cuando un hash viejo queda envenenado
en la caché de un CDN — un 404 cacheado durante una ventana de despliegue.

---

## 5. Web push

Servidor en `doco_marketing`; cliente en `composables/push.js` + `public/push-sw.js`.

Estados que expone el composable: `unsupported` (falta SW/Push/Notification),
`off` (disponible, sin suscribir), `on` (este navegador suscrito), más el caso
de permiso `denied`.

> **El interruptor de push existe SÓLO en móvil.** Vive en
> `Mobile/MobileSidebar.vue:169-191` y se oculta si el estado es `unsupported` o
> si no hay VAPID configurado. `DocoNavRail.vue` **no importa** `composables/push`
> — desde el escritorio no hay manera de suscribirse.

Flujo de suscripción:

1. `Notification.requestPermission()` — **desde el interruptor del cajón móvil**,
   nunca al cargar.
2. `doco_marketing.api.push.vapid_public_key`
3. `reg.pushManager.subscribe(...)`
4. `doco_marketing.api.push.subscribe`

Baja: `doco_marketing.api.push.unsubscribe` + `sub.unsubscribe()`.
Estado: `doco_marketing.api.push.status`.

El SW muestra la notificación con `tag` **por conversación**, para que el sistema
operativo las **apile** en vez de spamear, y `renotify: true`. Al hacer clic,
busca una ventana ya abierta en `/crm`, la enfoca y navega; si no hay ninguna,
abre una nueva. Destino por defecto: **`/crm/inbox`**.

El contrato del payload es `{ title, body, tag, url }`, definido por
`doco_marketing.services.push`.

Del lado servidor: las suscripciones se guardan en el doctype
**`Push Subscription`** de `doco_marketing` (upsert por `user` + `endpoint`), y
las llaves VAPID viven en `site_config` **por tenant**:

```bash
bench --site <site> execute doco_marketing.api.push.setup_vapid
```

> Nota: `subscribe` lanza excepción cuando el servicio de push está bloqueado —
> Brave viene así de fábrica. El composable lo maneja como estado, no como
> crash.

---

## 6. Outbox sin conexión

`composables/outbox.js`. Para zonas muertas: escribes → se encola → se manda al
reconectar.

- **Sólo respuestas de WhatsApp de texto.** Medios y plantillas necesitan subida,
  o sea conexión.
- FIFO en **`localStorage`** (sobrevive a cerrar la app), llave
  `doco-wa-outbox-v1:<usuario>`.
- Se vacía al arrancar el módulo, en el evento `online` de la ventana, y en
  `socket:reconnected`.
- Envíos **secuenciales**, para conservar el orden dentro de cada conversación.
- Tope de **50 elementos** en la cola.
- Máximo **5 intentos** por mensaje; al quinto **se descarta**, con un toast que
  cita los primeros 60 caracteres. No se reintenta para siempre, pero **el
  operador se entera** de que ese mensaje no salió.
- Tira visible: `Mobile/OutboxStrip.vue`, debajo de la tira de conexión.

> **Duplicado aceptado y documentado**: si un POST de vaciado tiene éxito pero se
> pierde su respuesta, se reintenta → envío duplicado ocasional. Se prefiere eso
> a un mensaje perdido.

---

## 7. Telemetría de errores del frontend

`composables/telemetry.js` → `POST /api/method/doco_marketing.api.client_error.report`.

- Escucha `window.onerror` y `unhandledrejection`.
- **Depura**: quita las query strings de las URLs, recorta el stack, y descarta
  ruido tipo `ResizeObserver` / `Script error`.
- **Muestreo**: la primera ocurrencia siempre se manda; las repeticiones dentro
  de la misma sesión de pestaña van muestreadas.
- **Nunca lanza excepción.** Una telemetría que tumba la app es telemetría
  despedida.

### 7.1 Por qué `fetch` y no `sendBeacon`

`fetch` con `keepalive` sobrevive al unload —que es todo el punto— **y además
puede llevar la cabecera CSRF**. Frappe rechaza con 400 una petición sin ella, o
sea que un beacon que "se encola bien" (devuelve `true`) **nunca llega**.
`sendBeacon` queda sólo como respaldo para WebViews antiguos sin `fetch`
(commit `6567fa3c`).

---

## 8. Privacidad del estado persistido

Regla de la casa, nacida de la clase de hallazgos M2 de la auditoría: **todo
estado de operador que se persista debe (a) llevar el usuario en la llave y (b)
barrerse al cerrar sesión.**

`utils/storageKeys.js` expone `userScopedKey(base)`, que lee la cookie `user_id`
y cae al bucket `guest` si no la puede leer. Ya lo aplican la caché de la cola
(`doco-inbox-queue-v2:<user>`, TTL 24 h), el outbox
(`doco-wa-outbox-v1:<user>`) y las vistas guardadas / layouts de columnas
(prefijos `doco_leads_` / `doco_deals_`, que `stores/session.js` purga al salir).

Las vistas guardadas importan porque sus términos de búsqueda pueden contener
identificadores de clientes.

**Úsalo para cualquier estado nuevo que persistas.**

---

## 9. Tematización

`src/index.css` (+138 líneas) define el acento por tenant:

```css
:root {
  --brand:        #16a34a;
  --brand-soft:   #e9f7ef;
  --brand-strong: #15803d;
}
```

Fuente única de verdad del verde que antes estaba escrito a mano en ~60 lugares.
En el arranque, `stores/settings.js` lo sobrescribe desde
`FCRM Settings.brand_color`, **sólo si el valor calza `^#[0-9a-fA-F]{6}$`** —
cualquier otra cosa conserva el default en vez de inyectar CSS. Recolorear un
tenant es un campo de backend, no un rebuild.

El tema se aplica en el arranque desde `App.vue:29-31`
(`setTheme(localStorage.getItem('theme') || 'light')`). Es necesario porque el
`ref` de `useTheme` nace en `'light'` y **nada más vuelve a aplicar** una
preferencia oscura guardada — sin esa línea, quien eligió modo oscuro arranca en
claro cada vez.

`:root[data-theme='light'|'dark']` fija `color-scheme`, para que los controles
nativos (checkboxes, scrollbars) sigan el tema. Aun así hay un `.cb-token`
dibujado a mano: los checkbox nativos salen blancos en oscuro incluso con
`color-scheme`.

Otras utilidades del fork: `.sheet-in` (entrada de hoja inferior, 0.22 s),
`.page-in` (entrada de página, 0.18 s — aplicada por `MobileLayout` sobre un
envoltorio con llave de ruta, porque las páginas son fragmentos multi-raíz y
`<transition>` no puede animarlas), más `-webkit-tap-highlight-color:
transparent`, `overscroll-behavior-y: none` y `touch-action: manipulation` en
elementos tocables.

---

## 10. Comportamiento móvil

| Pieza | Archivo | Notas |
|---|---|---|
| Punto de quiebre | `composables/breakpoint.js` | `isMobile` |
| Pila de paneles | `composables/backNav.js` | cada entrada al detalle es una entrada del historial; atrás la saca |
| Swipe desde el borde | `composables/swipeBack.js` | mismo `history.back()` que las flechas ← |
| Barra inferior | `Mobile/MobileTabBar.vue` | 5 destinos |
| Cajón | `Mobile/MobileSidebar.vue` | reskin, tema, apps, ajustes |
| Tiras de estado | `Layouts/MobileLayout.vue` | tira ámbar *"Sin conexión — mostrando lo último guardado"* (`v-if="!online"`), encima de la del outbox; install nudge; **y el par `min-w-0` / `overflow-x-hidden` (`:9` y `:57`) que corta el scroll lateral — NO se puede perder** (arreglo del desbordamiento de 382 px a 360, 07-25) |
| Sonido | `composables/notificationSound.js` | ping de entrante, con supresión del propio envío |

### 10.1 Aviso de instalación

`composables/installNudge.js` — Chrome/Android sólo dispara
`beforeinstallprompt` si la PWA es instalable. El aviso aparece a partir de
**3 visitas en días distintos** (`doco-install-visits`, `doco-install-last-visit`)
y se calla para siempre al descartarlo (`doco-install-dismissed`).

---

## 11. Impresión con QZ Tray

Poco común en un CRM, así que conviene decirlo claro: **está vivo, no dormido**.
`main.js` llama `registerPrintListener(socket)` en el arranque.

- `services/doco/printListener.ts` se suscribe al evento realtime
  **`doco:print_job`** y despacha a **QZ Tray** (`browser_qz`) o a un iframe
  oculto (`browser_normal`), con `fallback_backend` opcional; **acusa de vuelta**
  al servidor para que las filas `Doco Print Job` salgan del estado `dispatched`.
- `services/doco/qzTray.ts` — conexión con QZ, impresora preferida, firma vía
  `doco.docoutils.printing.qz.sign_message` / `get_certificate`.
- `services/doco/silentPrint.ts` — la ruta del iframe.

Es la razón de que `qz-tray` esté en las dependencias de `package.json`.

---

## 12. Rendimiento

- **Prefetch en reposo** (`utils/prefetch.js`, montado desde `App.vue`):
  `requestIdleCallback` → import dinámico de los chunks calientes tras pintar el
  aterrizaje. También pacea parte de la ráfaga de arranque en frío.
- **Actualizaciones optimistas**: cambio de etapa y tarea completada se aplican
  localmente y se reconcilian; con error, toast y reversión.
- **Caché de cola en frío**: ver `01-inbox-conversaciones.md` §2.6.
- **Cursor keyset** para "cargar más" en la cola.
- **Medios diferidos** en el hilo (`loading="lazy"`).

---

## 13. Convenciones que hay que respetar

Del `P2_WORKPLAN.md`, y visibles en todo el código nuevo:

1. Vue 3 `<script setup>`.
2. **Sólo tokens de frappe-ui** (`ink-*`, `surface-*`, `outline-*`) — todo color
   debe ser seguro en modo oscuro.
3. Cadenas es-MX vía `__()`.
4. **Móvil primero**: ≤640 px no debe hacer scroll lateral; razonar a 360 px.
5. `.press` en los chips tocables.
6. **Sin dependencias nuevas.**
7. Texto del cliente **interpolado**, nunca `v-html`.
8. Lógica pura extraída a `src/utils/` **con su vitest**.
9. Toda acción de swipe necesita **equivalente de botón**.
10. Los diálogos y hojas llevan `role="dialog"` + `aria-modal`, mueven el foco
    dentro y lo restauran al cerrar, y cierran con Escape.
</content>
