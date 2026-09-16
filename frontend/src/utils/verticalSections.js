const LEGACY_APPS = {
  RepairOrdersSection: ['taller'],
  DealsSearchBox: ['taller'],
  DealDocumentsSection: ['doco_marketing', 'erpnext'],
}
const WORKSPACES = { clinica: '/clinica', taller: '/taller' }

export function resolveVerticalSections(
  config,
  slot,
  hasApp,
  doctype = 'CRM Deal',
) {
  if (!config || config.schemaVersion !== 1) return []
  const legacy = (Array.isArray(config.sections) ? config.sections : [])
    .filter(
      (s) =>
        doctype === 'CRM Deal' &&
        s &&
        s.enabled &&
        s.render_in === slot &&
        LEGACY_APPS[s.vue_component]?.every(hasApp),
    )
    .slice(0, 32)
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((s) => ({ ...s, section_key: `legacy:${s.section_key}` }))
  const providers = (
    Array.isArray(config.providers) ? config.providers : []
  ).slice(0, 16)
  for (const provider of providers) {
    if (!provider || !hasApp(provider.app) || provider.schemaVersion !== 1)
      continue
    if (doctype !== 'CRM Deal' && provider.app !== 'clinica') continue
    for (const contribution of (Array.isArray(provider.slots)
      ? provider.slots
      : []
    ).slice(0, 4)) {
      if (
        contribution?.slot !== slot ||
        contribution.component !== 'ProviderWorkspace' ||
        !WORKSPACES[provider.app] ||
        contribution.route !== WORKSPACES[provider.app]
      )
        continue
      legacy.push({
        section_key: `${provider.id}:${contribution.id}`,
        vue_component: 'ProviderWorkspace',
        config: { provider, route: WORKSPACES[provider.app] },
      })
    }
  }
  return legacy
}

export function verticalSlotEligible(slot, doctype, hasApp) {
  if (!hasApp('doco')) return false
  if (slot === 'deals_list_header')
    return doctype === 'CRM Deal' && hasApp('taller')
  if (
    slot !== 'data_tab' ||
    !['CRM Lead', 'CRM Deal', 'Contact'].includes(doctype)
  )
    return false
  return (
    hasApp('clinica') ||
    (doctype === 'CRM Deal' &&
      (hasApp('taller') || (hasApp('doco_marketing') && hasApp('erpnext'))))
  )
}

export function verticalUnavailable(config, slot, doctype, hasApp) {
  if (
    config?.schemaVersion !== 1 ||
    !verticalSlotEligible(slot, doctype, hasApp)
  )
    return false
  const reasons = new Set([
    'provider_unavailable',
    'duplicate_provider',
    'invalid_registration',
    'invalid_descriptor',
  ])
  return (Array.isArray(config.unavailable) ? config.unavailable : []).some(
    (entry) =>
      reasons.has(entry?.reason) &&
      (entry.id === 'registry' ||
        (entry.id === 'clinica:clinic' &&
          hasApp('clinica') &&
          slot === 'data_tab') ||
        (doctype === 'CRM Deal' &&
          ['layout', 'taller:repair'].includes(entry.id) &&
          hasApp('taller'))),
  )
}
