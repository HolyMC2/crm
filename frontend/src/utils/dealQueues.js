// The follow-up queues seeded as public CRM View Settings for CRM Deal
// (crm.api.deal_queues), in the order a seller works through them. Identity is
// the stable `crm_seed_key`, never the label, which managers may rename.
export const QUEUE_ORDER = [
  'todos',
  'vencidos',
  'para_hoy',
  'sin_fecha',
  'sin_seguimiento',
]

// crm.api.deal_queues stores keys namespaced as `crm.deal_queue.<key>`.
const SEED_PREFIX = 'crm.deal_queue.'

export function queueKey(seedKey) {
  const raw = String(seedKey || '')
  return raw.startsWith(SEED_PREFIX) ? raw.slice(SEED_PREFIX.length) : raw
}

export function dealQueues(views) {
  const byKey = new Map()
  for (const view of views || []) {
    if (!view || view.dt !== 'CRM Deal' || !view.public) continue
    const key = queueKey(view.crm_seed_key)
    if (!QUEUE_ORDER.includes(key) || byKey.has(key)) continue
    byKey.set(key, view)
  }
  return QUEUE_ORDER.filter((key) => byKey.has(key)).map((key) =>
    byKey.get(key),
  )
}

export function queueRoute(view) {
  return {
    name: 'Deals',
    params: { viewType: view.type || 'list' },
    query: { view: view.name },
  }
}
