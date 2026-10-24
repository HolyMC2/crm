// One Actividad for every record (Shell SPEC §6 DD7, E3): crm.api.documentos.timeline,
// shared per record version so a page never asks twice (SPEC §6.4 A2: after the
// record's first paint).
import { call } from 'frappe-ui'

const cache = new Map()

export function loadTimeline(doctype, name, modified) {
  const key = `${doctype}:${name}:${modified}`
  if (!cache.has(key)) {
    if (cache.size > 20) cache.clear()
    const pending = call('crm.api.documentos.timeline', {
      doctype,
      name,
    }).catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, pending)
  }
  return cache.get(key)
}
