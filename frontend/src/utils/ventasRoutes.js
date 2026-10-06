// Ventas keeps one list family and one deal record. Legacy CRM routes stay as
// the native fallback on sites without doco_marketing (crmCapabilities gate);
// with the addon present they redirect here, preserving query intent.
import { safeReturnPath } from '@/utils/ventasDocs'
import { queueReturnLabel, safeQueueReturn } from '@/utils/salesQueueContext'

export const DEAL_TABS = Object.freeze([
  'overview',
  'conversation',
  'activity',
  'items',
  'repair',
])

// Legacy Deal page tabs (hash) → Deal 360 sections.
const HASH_TABS = {
  activity: 'activity',
  emails: 'activity',
  comments: 'activity',
  calls: 'activity',
  tasks: 'activity',
  notes: 'activity',
  attachments: 'activity',
  whatsapp: 'conversation',
  orders: 'items',
  offers: 'items',
  documents: 'items',
  quotations: 'items',
  repair: 'repair',
  repairs: 'repair',
}

export function dealTabFromHash(hash) {
  const key = String(hash || '')
    .replace(/^#/, '')
    .toLowerCase()
  return HASH_TABS[key] || null
}

export function dealTab(value) {
  return DEAL_TABS.includes(value) ? value : null
}

const LAYOUTS = { kanban: 'board', list: 'list', group_by: 'list' }
const LEGACY_LISTS = {
  Deals: 'Deals List',
  Leads: 'Leads List',
  'Call Logs': 'Calls List',
}

/**
 * The classic (upstream) lists stay reachable until the redesigned lists have
 * every field filter, group-by and saved view: «Vista clásica» (?classic=1),
 * a saved-view link (?view=) and any navigation inside a classic list render
 * it instead of silently dropping that intent.
 */
function wantsClassicList(to, from) {
  const query = to.query || {}
  return Boolean(query.classic || query.view) || from?.name === to.name
}

/**
 * Where a legacy Ventas route goes, or null to let it render. `available` is
 * whether doco_marketing is installed (crmCapabilities.hasApp); without it the
 * legacy pages ARE the product, so nothing redirects.
 */
export function legacyVentasRoute(to, available, from = null) {
  if (!available || !to) return null
  const query = { ...(to.query || {}) }
  if (to.name === 'Deal' && to.params?.dealId) {
    const tab = dealTab(query.tab) || dealTabFromHash(to.hash)
    if (tab) query.tab = tab
    return { name: 'Deal 360', params: { dealId: to.params.dealId }, query }
  }
  const list = LEGACY_LISTS[to.name]
  if (!list || wantsClassicList(to, from)) return null
  const layout = LAYOUTS[to.params?.viewType]
  if (to.name !== 'Call Logs' && layout && layout !== 'list')
    query.layout = layout
  return { name: list, query }
}

/** The old /deal/:id path (Inbox era) → the one deal record, intent intact. */
export function legacyDealRedirect(to) {
  return {
    name: 'Deal 360',
    params: to.params,
    query: to.query,
    hash: to.hash,
  }
}

/**
 * The deal record's back link. A shell caller's return_to (/crm/…) wins; then
 * the CRM queue/report/form-submission returnTo every legacy caller sends.
 */
export function dealReturnLink(query = {}) {
  const shell = safeReturnPath(String(query.return_to || ''))
  if (shell)
    return {
      to: shell.replace(/^\/crm/, '') || '/',
      label: __('Return to {0}', [
        String(query.return_label || '').slice(0, 40) || __('previous page'),
      ]),
    }
  const queue = safeQueueReturn(query.returnTo)
  if (queue) return { to: queue, label: queueReturnLabel(queue) }
  return { to: { name: 'Deals List' }, label: __('Back to deals') }
}
