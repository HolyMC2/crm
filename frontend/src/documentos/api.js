import { call } from 'frappe-ui'

const SERVICE = 'crm.api.documentos'

/** One documentos endpoint (`rows`, `counts`, `record`, `hub`, `doctypes`…); Frappe permissions only. */
export function docApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] =
      typeof value === 'object' && !Array.isArray(value)
        ? JSON.stringify(value)
        : Array.isArray(value)
          ? JSON.stringify(value)
          : value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** The worker's sentence for a failed call: the server's own message, never a traceback. */
export function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  if (!message || /Traceback|Error \d{3}|^[A-Z][a-zA-Z]+Error/.test(message))
    return 'Revisa tu conexión e inténtalo de nuevo.'
  return message
}
