<template>
  <!-- The record's «⋯» (DD5) on the richer purchase pages: opens the engine's
       tools sheet once the record bundle is in (useRecordKit). -->
  <button
    type="button"
    class="inline-flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
    aria-label="Herramientas"
    data-testid="documentos-tools-open"
    :disabled="!kit.record.value"
    @click="kit.openTools()"
  >
    <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
  </button>
</template>
<script setup>
defineProps({
  // useRecordKit(...)
  kit: { type: Object, required: true },
})
</script>
