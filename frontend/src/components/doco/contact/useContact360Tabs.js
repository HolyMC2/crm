import { computed, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { addonAvailable } from '@/utils/crmCapabilities'
import { purgeContact360Cache } from '@/utils/contactos'

// Retire payloads an older build persisted in IndexedDB (once per page load).
let legacyPurge = null

// Source of truth is doco_marketing, not the Doco Vertical registry: a tenant
// with no vertical set (both retail tenants) must still get the neutral tabs,
// and the repairs tab is dropped server-side when taller is absent.
export function useContact360Tabs(options = {}) {
  legacyPurge ||= purgeContact360Cache()
  const enabled = computed(() =>
    options.available !== undefined
      ? Boolean(options.available.value ?? options.available)
      : Array.isArray(window.installed_apps)
        ? window.installed_apps.includes('doco_marketing')
        : addonAvailable.value,
  )
  const sections = createResource({
    url: 'doco_marketing.api.contact360.get_contact360_sections',
    params: options.contact ? { contact: options.contact } : {},
    auto: false,
  })
  watch(
    enabled,
    (available) => {
      if (available) sections.fetch()
    },
    { immediate: true },
  )
  const contactTabs = computed(() =>
    (enabled.value ? sections.data?.sections || [] : []).map((section) => ({
      name: section.section_key,
      label: section.label || section.section_key,
      sectionKey: section.section_key,
      component: section.vue_component,
    })),
  )
  return { contactTabs, sections }
}
