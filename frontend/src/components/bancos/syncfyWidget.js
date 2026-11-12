import { jobOf, syncfy } from './conectados'

// Syncfy's own window (widget v3): the bank login, the SAT's CIEC or e.firma
// and any one-time code go from this browser straight to Syncfy with a
// short-lived session token. Muelle only gets back the login's id and reads
// its state from the API (syncfy_connector.api.connect.register).
//
// The widget draws its own full-screen modal (fixed, z-index 1000, full
// screen on a phone) into the element it is given, so it mounts on a host
// at the end of <body>, above the shell, and never inside a sheet.
// Loaded on the first «Conectar»: nothing of it ships in the Bancos chunk.
const WIDGET_JS = 'https://syncfy.com/widget/v3/syncfy-authentication-widget.js'
const WIDGET_CSS =
  'https://syncfy.com/widget/v3/syncfy-authentication-widget.css'
const HOST_ID = 'syncfy-widget-host'
const NOTE_ID = 'syncfy-waiting-note'
export const WAITING_TEXT =
  'Esto puede tardar unos minutos. Deja esta ventana abierta: guardamos la conexión en cuanto la institución conteste.'

let loading = null

export function loadWidget(doc = document, win = window) {
  if (win.SyncfyWidget) return Promise.resolve(win.SyncfyWidget)
  if (loading) return loading
  // The bundle expects a Node-style `global`.
  if (typeof win.global === 'undefined') win.global = win
  if (!doc.querySelector(`link[href="${WIDGET_CSS}"]`)) {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = WIDGET_CSS
    doc.head.appendChild(link)
  }
  loading = new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = WIDGET_JS
    script.async = true
    script.onload = () =>
      win.SyncfyWidget ? resolve(win.SyncfyWidget) : reject(new Error('widget'))
    script.onerror = () => reject(new Error('widget'))
    doc.head.appendChild(script)
  }).catch((error) => {
    loading = null
    throw error
  })
  return loading
}

// Syncfy's bundle mounts a Vue app on this element and has no way to unmount
// it. Vue keeps that app's tree on the element, so mounting again on the same
// element, even emptied, patched the old detached tree: the second window in
// one visit threw on `nextSibling` and never showed until a reload. Every
// window gets a new element.
// Syncfy's «Estableciendo conexión» can run for minutes with no sign of
// progress. This note sits above its modal (z-index 1000) and the shell's
// floating buttons, taking no clicks, from the moment the login is sent until
// the institution answers, asks for a code (410) or the window closes. Inline
// styles: nothing of it ships in the CSS.
function waitingNote(doc) {
  doc.getElementById(NOTE_ID)?.remove()
  const note = doc.createElement('div')
  note.id = NOTE_ID
  note.setAttribute('role', 'status')
  note.setAttribute('aria-live', 'polite')
  note.textContent = WAITING_TEXT
  note.hidden = true
  Object.assign(note.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    zIndex: '2000000000',
    width: 'max-content',
    maxWidth: 'min(28rem, calc(100% - 32px))',
    padding: '12px 16px',
    borderRadius: '12px',
    background: 'rgba(23, 23, 23, 0.92)',
    color: '#fff',
    fontSize: '14px',
    lineHeight: '1.4',
    textAlign: 'center',
    pointerEvents: 'none',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
  })
  doc.body.appendChild(note)
  return note
}

function hostElement(doc) {
  doc.getElementById(HOST_ID)?.remove()
  const host = doc.createElement('div')
  host.id = HOST_ID
  doc.body.appendChild(host)
  return host
}

/**
 * Open Syncfy for one company.
 * A document from the SAT (opinión de cumplimiento, constancia) keeps no
 * login: Syncfy reports only its job, and this resolves `{documents: true}`
 * once the connector is following it.
 *  - `credential`: re-sync that login now (it asks for the one-time code, or
 *    lets the person fix what the bank refused);
 *  - `update`: change the user or password of that login;
 *  - neither: connect a new one, filtered to `types` (Syncfy organization types).
 * Resolves `{connection, error}` once Syncfy reports the login (the connection
 * is registered by then), or `null` when the person closes the window first.
 */
export async function openSyncfy(
  { company, credential, update, types = [], context = null },
  { doc = document, win = window } = {},
) {
  const ctx = context || (await syncfy.context(company))
  const session = await syncfy.widgetSession(company)
  const SyncfyWidget = await loadWidget(doc, win)
  const host = hostElement(doc)
  const note = waitingNote(doc)
  const entrypoint = {}
  if (ctx?.country) entrypoint.country = ctx.country
  if (credential) entrypoint.credential = credential
  if (update) entrypoint.updateCredential = update
  const navigation = {
    displayStatusInToast: false,
    displayLongDescription: true,
  }
  if (types.length) navigation.displaySiteOrganizationTypes = types
  const widget = new SyncfyWidget({
    token: session.token,
    element: `#${HOST_ID}`,
    config: { locale: ctx?.locale || 'es', entrypoint, navigation },
    refreshTokenFunction: () =>
      syncfy.widgetSession(company).then((s) => ({ token: s.token })),
  })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (value, failed = false) => {
      if (settled) return
      settled = true
      try {
        widget.close()
      } catch {
        // already closed by the person
      }
      host.remove()
      note.remove()
      if (failed) reject(value)
      else resolve(value)
    }
    // A login Syncfy reported is registered even if the person closes the
    // window while that call is still on its way.
    let registering = null
    const register = (reported, error) => {
      if (settled || registering || !reported?.id_credential) return
      registering = syncfy
        .register(company, reported.id_credential, jobOf(reported))
        .then((connection) =>
          finish({ connection, error: error?.message || '' }),
        )
        .catch((failure) => finish(failure, true))
    }
    const followDocument = (reported) => {
      const job = jobOf(reported)
      if (settled || registering || reported?.id_credential || !job) return
      registering = syncfy
        .documentJob(company, job)
        .then(() => finish({ documents: true }))
        .catch((failure) => finish(failure, true))
    }
    widget.on('success', (reported) => {
      register(reported)
      followDocument(reported)
    })
    widget.on('error', (reported, error) => register(reported, error))
    widget.on('401', async () => {
      const next = await syncfy.widgetSession(company)
      widget.setToken(next.token)
    })
    widget.on('closed', () => {
      if (!registering) finish(null)
    })
    widget.on('submitted', () => (note.hidden = false))
    widget.on('status', (status) => {
      const code = Number(status?.code)
      if (code === 410 || code >= 200) note.hidden = true
    })
    widget.on('success', () => (note.hidden = true))
    widget.on('error', () => (note.hidden = true))
    widget.open()
  })
}
