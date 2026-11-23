<template>
  <!-- The way to fix what keeps a switch off (view.js fixLink): a /crm page
       opens in the shell, anything else as a page. Never a dead button. -->
  <RouterLink
    v-if="fix?.to"
    :to="fix.to"
    :class="LINK"
    data-app-clientes-arreglar
    >{{ fix.label }}</RouterLink
  >
  <a
    v-else-if="fix?.href"
    :href="fix.href"
    :class="LINK"
    data-app-clientes-arreglar
    >{{ fix.label }}</a
  >
</template>
<script setup>
defineProps({
  /** {label, to} or {label, href} */
  fix: { type: Object, default: null },
})
const LINK =
  'press inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8'
</script>
