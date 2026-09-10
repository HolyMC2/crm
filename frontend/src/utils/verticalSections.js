const LEGACY_APPS = {
  RepairOrdersSection: ['taller'],
  DealsSearchBox: ['taller'],
  DealDocumentsSection: ['doco_marketing', 'erpnext'],
}
const WORKSPACES = { clinica: '/clinica', taller: '/taller' }

export function resolveVerticalSections(config, slot, hasApp) {
  if (!config || config.schemaVersion !== 1) return []
  const legacy = (Array.isArray(config.sections) ? config.sections : [])
    .filter((s) => s && s.enabled && s.render_in === slot &&
      LEGACY_APPS[s.vue_component]?.every(hasApp))
    .slice(0, 32)
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((s) => ({ ...s, section_key: `legacy:${s.section_key}` }))
  const providers = (Array.isArray(config.providers) ? config.providers : []).slice(0, 16)
  for (const provider of providers) {
    if (!provider || !hasApp(provider.app) || provider.schemaVersion !== 1) continue
    for (const contribution of (Array.isArray(provider.slots) ? provider.slots : []).slice(0, 4)) {
      if (contribution?.slot !== slot || contribution.component !== 'ProviderWorkspace' ||
          !WORKSPACES[provider.app] || contribution.route !== WORKSPACES[provider.app]) continue
      legacy.push({
        section_key: `${provider.id}:${contribution.id}`,
        vue_component: 'ProviderWorkspace',
        config: { provider, route: WORKSPACES[provider.app] },
      })
    }
  }
  return legacy
}
