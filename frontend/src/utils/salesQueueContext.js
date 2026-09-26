// Only CRM working-list destinations may be carried across record transitions.
export function safeQueueReturn(value) {
  return typeof value === 'string' &&
    value.length <= 2048 &&
    /^\/(?:leads|deals|tasks)(?:\/view(?:\/(?:list|kanban))?)?\/?(?:[?#]|$)/.test(
      value,
    ) &&
    !/[\\\r\n]/.test(value)
    ? value
    : ''
}
export function conversionQueueReturn(route) {
  const carried = safeQueueReturn(route?.query?.returnTo)
  if (carried) return carried
  const direct = safeQueueReturn(route?.fullPath)
  if (direct) return direct
  const query = new URLSearchParams()
  if (typeof route?.query?.view === 'string')
    query.set('view', route.query.view)
  const type = ['list', 'kanban'].includes(route?.query?.viewType)
    ? route.query.viewType
    : ''
  return `/leads/view/${type}${query.size ? '?' + query : ''}`
}
