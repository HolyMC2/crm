import { computed } from 'vue'
import { createResource } from 'frappe-ui'

export function useContact360Tabs() {
  const verticalConfig = createResource({
    url: 'doco.docoutils.boot.get_active_vertical_config',
    cache: 'doco-active-vertical',
    auto: true,
  })
  const contactTabs = computed(() =>
    (verticalConfig.data?.sections || [])
      .filter(
        (section) => section.enabled && section.render_in === 'contact_tab',
      )
      .slice()
      .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
      .map((section) => ({
        name: section.section_key,
        label: section.config?.label || section.section_key,
        sectionKey: section.section_key,
      })),
  )
  return { contactTabs, verticalConfig }
}
