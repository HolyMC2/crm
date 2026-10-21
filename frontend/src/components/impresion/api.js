import { call } from 'frappe-ui'
import { shallowRef } from 'vue'

const SERVICE = 'crm.api.impresion'

/**
 * The owner's format list as it last loaded (null before the first load). The list and a
 * format are one tap apart: the list paints from here at once, and a format's header
 * names itself before its code arrives.
 */
export const lastGroups = shallowRef(null)

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
