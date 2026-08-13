import { computed } from 'vue'
import { createResource } from 'frappe-ui'

// Source of truth is doco_marketing, not the Doco Vertical registry: a tenant
// with no vertical set (both retail tenants) must still get the neutral tabs,
// and the repairs tab is dropped server-side when taller is absent.
export function useContact360Tabs() {
  const sections = createResource({
    url: 'doco_marketing.api.contact360.get_contact360_sections',
    cache: 'doco-contact360-sections',
    auto: true,
  })
  const contactTabs = computed(() =>
    (sections.data?.sections || []).map((section) => ({
      name: section.section_key,
      label: section.label || section.section_key,
      sectionKey: section.section_key,
      component: section.vue_component,
    })),
  )
  return { contactTabs, sections }
}
