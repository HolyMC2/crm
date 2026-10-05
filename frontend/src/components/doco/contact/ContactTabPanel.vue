<template>
  <component
    :is="registry[component]"
    v-if="registry[component]"
    :key="`${docname}:${selectedCustomer || ''}:${component}`"
    :docname="docname"
    :selected-customer="selectedCustomer"
  />
  <p v-else role="status" class="p-4">
    Esta sección no está disponible. Pide al encargado que revise su
    configuración.
  </p>
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
const registry = {
  ContactOverviewTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactOverviewTab.vue'),
  ),
  ContactDocumentsTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactDocumentsTab.vue'),
  ),
  ContactRepairsTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactRepairsTab.vue'),
  ),
  ContactConnectionsTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactConnectionsTab.vue'),
  ),
  ContactStorefrontTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactStorefrontTab.vue'),
  ),
  ContactSaldoTab: defineAsyncComponent(
    () => import('@/components/doco/contact/ContactSaldoTab.vue'),
  ),
}
defineProps({
  component: { type: String, required: true },
  docname: { type: String, required: true },
  selectedCustomer: { type: String, default: '' },
})
</script>
