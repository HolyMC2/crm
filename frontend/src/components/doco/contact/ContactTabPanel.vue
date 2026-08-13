<template>
  <component
    :is="registry[component]"
    v-if="registry[component]"
    :docname="docname"
  />
</template>

<script setup>
import ContactOverviewTab from '@/components/doco/contact/ContactOverviewTab.vue'
import ContactDocumentsTab from '@/components/doco/contact/ContactDocumentsTab.vue'
import ContactRepairsTab from '@/components/doco/contact/ContactRepairsTab.vue'
import ContactConnectionsTab from '@/components/doco/contact/ContactConnectionsTab.vue'

// Deliberately NOT VerticalSlot: the contact tabs are server-owned by
// doco_marketing (see useContact360Tabs), not by the Doco Vertical registry —
// the retail tenants have no vertical configured, and a vertical-driven list
// renders nothing there.
const registry = {
  ContactOverviewTab,
  ContactDocumentsTab,
  ContactRepairsTab,
  ContactConnectionsTab,
}

defineProps({
  component: { type: String, required: true },
  docname: { type: String, required: true },
})
</script>
