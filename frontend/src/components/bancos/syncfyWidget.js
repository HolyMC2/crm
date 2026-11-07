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

function hostElement(doc) {
  let host = doc.getElementById(HOST_ID)
  if (!host) {
    host = doc.createElement('div')
    host.id = HOST_ID
    doc.body.appendChild(host)
  }
  host.replaceChildren()
  return host
}

/**
 * Open Syncfy for one company.
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
      host.replaceChildren()
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
    widget.on('success', (reported) => register(reported))
    widget.on('error', (reported, error) => register(reported, error))
    widget.on('401', async () => {
      const next = await syncfy.widgetSession(company)
      widget.setToken(next.token)
    })
    widget.on('closed', () => {
      if (!registering) finish(null)
    })
    widget.open()
  })
}
