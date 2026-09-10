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
import { hasApp } from '@/utils/crmCapabilities'
import { useVerticalConfig } from '@/composables/verticalConfig'
import { resolveVerticalSections } from '@/utils/verticalSections'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import DealDocumentsSection from '@/components/doco/DealDocumentsSection.vue'
import DealsSearchBox from '@/components/doco/DealsSearchBox.vue'
import ProviderWorkspace from '@/components/doco/ProviderWorkspace.vue'

defineOptions({ inheritAttrs: false })

const registry = {
  RepairOrdersSection,
  DealDocumentsSection,
  DealsSearchBox,
  ProviderWorkspace,
}

const props = defineProps({
  slot: { type: String, required: true },
  docname: { type: String, default: '' },
})

const verticalConfig = useVerticalConfig(() => props.docname)

const resolvedSections = computed(() => resolveVerticalSections(verticalConfig.value, props.slot, hasApp))
</script>
