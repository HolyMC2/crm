import { call } from 'frappe-ui'

const SERVICE = 'crm.api.impresion'

/** One impresión endpoint (`vista_previa`, `formatos`, `formato`, `probar`…); Frappe permissions only. */
export function impresionApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    params[key] = value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** A refused owner screen (not System Manager): the server's 403. */
export function isDenied(error) {
  return error?.status === 403 || error?.exc_type === 'PermissionError'
}
