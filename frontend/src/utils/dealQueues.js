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

export function dealQueues(views) {
  const byKey = new Map()
  for (const view of views || []) {
    if (!view || view.dt !== 'CRM Deal' || !view.public) continue
    const key = view.crm_seed_key
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
