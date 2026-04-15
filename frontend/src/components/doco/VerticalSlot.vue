<template>
  <template v-for="s in resolvedSections" :key="s.section_key">
    <component
      :is="registry[s.vue_component]"
      v-if="registry[s.vue_component]"
      :docname="docname"
      v-bind="s.config || {}"
    />
  </template>
</template>

<script setup>
import { computed } from 'vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import DealDocumentsSection from '@/components/doco/DealDocumentsSection.vue'

const registry = { RepairOrdersSection, DealDocumentsSection }

const props = defineProps({
  slot: { type: String, required: true },
  docname: { type: String, required: true },
})

const resolvedSections = computed(() => {
  const cfg =
    (typeof window !== 'undefined' && window.frappeBoot?.doco_vertical) || null
  if (!cfg || !Array.isArray(cfg.sections)) return []
  return cfg.sections
    .filter((s) => s.enabled && s.render_in === props.slot)
    .slice()
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
})
</script>
