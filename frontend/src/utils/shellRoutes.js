// Shared shell navigation: native sources stay explicit and URLs stay local.
export const sourceSlugs = Object.freeze({
  Contact: 'contact',
  Customer: 'customer',
  Supplier: 'supplier',
  'CRM Organization': 'organization',
  Lead: 'lead',
  'CRM Lead': 'crm-lead',
  Address: 'address',
})
export function sourceRoute(doctype, name, query = {}) {
  const source = sourceSlugs[doctype]
  if (!source || !name) return { name: 'Contactos', query }
  return { name: 'Contacto', params: { source, name }, query }
}
export function sourceHref(doctype, name) {
  const source = sourceSlugs[doctype]
  return source && name
    ? `/crm/contactos/${source}/${encodeURIComponent(name)}`
    : '/crm/contactos'
}
export function safeIntendedRoute(value) {
  if (typeof value !== 'string' || /[\\\r\n]/.test(value))
    return '/crm/contactos'
  try {
    const url = new URL(value, 'https://muelle.invalid')
    if (
      url.origin !== 'https://muelle.invalid' ||
      !/^\/crm(?:\/|$)/.test(url.pathname)
    )
      return '/crm/contactos'
    return url.pathname + url.search + url.hash
  } catch {
    return '/crm/contactos'
  }
}
export function legacyIdentityRoute(to, source) {
  const name = to.params.contactId || to.params.organizationId
  const query = { ...to.query }
  // Unknown legacy view/filter state stays visible until the worker reviews it.
  if (
    query.view ||
    query.filters ||
    (to.params.viewType && to.params.viewType !== 'list')
  ) {
    query.legacy_view = query.view || to.params.viewType || 'filters'
    query.legacy_source = source
  }
  if (source === 'organization') query.segment = 'companies'
  if (name)
    return { name: 'Contacto', params: { source, name }, query, hash: to.hash }
  return { name: 'Contactos', query, hash: to.hash }
}
