<template>
  <template v-for="s in resolvedSections" :key="s.section_key">
    <component
      :is="registry[s.vue_component]"
      v-if="registry[s.vue_component]"
      :docname="docname"
      v-bind="{ ...$attrs, ...(s.config || {}) }"
    />
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { createResource } from 'frappe-ui'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import DealDocumentsSection from '@/components/doco/DealDocumentsSection.vue'
import DealsSearchBox from '@/components/doco/DealsSearchBox.vue'
import ContactOverviewTab from '@/components/doco/contact/ContactOverviewTab.vue'
import ContactDocumentsTab from '@/components/doco/contact/ContactDocumentsTab.vue'
import ContactRepairsTab from '@/components/doco/contact/ContactRepairsTab.vue'
import ContactConnectionsTab from '@/components/doco/contact/ContactConnectionsTab.vue'

defineOptions({ inheritAttrs: false })

const registry = {
  RepairOrdersSection,
  DealDocumentsSection,
  DealsSearchBox,
  ContactOverviewTab,
  ContactDocumentsTab,
  ContactRepairsTab,
  ContactConnectionsTab,
}

const props = defineProps({
  slot: { type: String, required: true },
  docname: { type: String, default: '' },
  sectionKey: { type: String, default: '' },
})

// CRM SPA has its own get_boot() that doesn't include extend_bootinfo,
// so fetch the active vertical config via API. Use doco's authoritative path
// so core tenants without taller still render neutral slots. Shared cache key
// means every VerticalSlot instance hits the same resource.
const verticalConfig = createResource({
  url: 'doco.docoutils.boot.get_active_vertical_config',
  cache: 'doco-active-vertical',
  auto: true,
})

const resolvedSections = computed(() => {
  const cfg = verticalConfig.data
  if (!cfg || !Array.isArray(cfg.sections)) return []
  return cfg.sections
    .filter(
      (s) =>
        s.enabled &&
        s.render_in === props.slot &&
        (!props.sectionKey || s.section_key === props.sectionKey),
    )
    .slice()
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
})
</script>
