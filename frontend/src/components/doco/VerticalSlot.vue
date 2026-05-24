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

defineOptions({ inheritAttrs: false })

const registry = {
  RepairOrdersSection,
  DealDocumentsSection,
  DealsSearchBox,
}

const props = defineProps({
  slot: { type: String, required: true },
  docname: { type: String, default: '' },
})

// CRM SPA has its own get_boot() that doesn't include extend_bootinfo,
// so fetch the active vertical config via API. Calls taller directly
// (B-007) — the prior `doco.docoutils.boot.get_active_vertical_config`
// path was a re-export shim that broke when doco was uninstalled while
// taller was. Shared cache key so all VerticalSlot instances across
// the app hit the same resource.
const verticalConfig = createResource({
  url: 'taller.api.vertical.get_active_vertical_config',
  cache: 'doco-active-vertical',
  auto: true,
})

const resolvedSections = computed(() => {
  const cfg = verticalConfig.data
  if (!cfg || !Array.isArray(cfg.sections)) return []
  return cfg.sections
    .filter((s) => s.enabled && s.render_in === props.slot)
    .slice()
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
})
</script>
