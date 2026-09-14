<template>
  <template v-for="s in resolvedSections" :key="s.section_key">
    <component
      :is="registry[s.vue_component]"
      v-if="registry[s.vue_component]"
      v-bind="{ ...$attrs, ...(s.config || {}) }"
      :docname="docname"
      :doctype="doctype"
    />
  </template>
  <p
    v-if="unavailable"
    role="status"
    class="my-4 rounded-lg border border-outline-gray-2 p-3 text-sm text-ink-gray-6"
  >
    Una conexión de este espacio necesita una revisión de configuración. Puedes
    continuar trabajando en CRM y solicitar apoyo a la administración.
  </p>
</template>

<script setup>
import { computed } from 'vue'
import { hasApp } from '@/utils/crmCapabilities'
import { useVerticalConfig } from '@/composables/verticalConfig'
import {
  resolveVerticalSections,
  verticalSlotEligible,
  verticalUnavailable,
} from '@/utils/verticalSections'
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
  doctype: { type: String, default: 'CRM Deal' },
})

const verticalConfig = useVerticalConfig(
  () => props.docname,
  () => props.doctype,
  () => verticalSlotEligible(props.slot, props.doctype, hasApp),
)

const resolvedSections = computed(() =>
  resolveVerticalSections(
    verticalConfig.value,
    props.slot,
    hasApp,
    props.doctype,
  ),
)
const unavailable = computed(() =>
  verticalUnavailable(verticalConfig.value, props.slot, props.doctype, hasApp),
)
</script>
