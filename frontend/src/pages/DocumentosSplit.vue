<template>
  <!-- A Documentos list and its record (Shell SPEC §6 DD4). ≥1024: master-
       detail, the list on the left keeps its filters, rows and scroll while
       the record on the right changes (j/k/Enter, e, Esc); with none open the
       right pane sums up the list (ListSummary). Below: one page
       at a time, the record's back returns to the list as it was. -->
  <div
    v-if="wide"
    class="flex h-full min-w-0 flex-1 overflow-hidden"
    data-testid="documentos-split"
  >
    <div
      class="documentos-master flex flex-none flex-col overflow-hidden border-r border-outline-gray-1"
    >
      <DocumentosList pane @summary="summary = $event" />
    </div>
    <div class="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
      <DocumentoRecord v-if="name" :key="recordKey" pane />
      <ListSummary v-else-if="summary" :summary="summary" />
    </div>
  </div>
  <DocumentoRecord v-else-if="name" :key="recordKey" />
  <DocumentosList v-else />
</template>
<script setup>
import { computed, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import ListSummary from '@/components/documentos/ListSummary.vue'
import { isWide } from '@/composables/breakpoint'
import DocumentoRecord from './DocumentoRecord.vue'
import DocumentosList from './DocumentosList.vue'

const route = useRoute()
const wide = isWide
const name = computed(() => String(route.params.name || ''))
const recordKey = computed(() => route.path)
const summary = shallowRef(null)
</script>
<style scoped>
/* scoped, not Tailwind arbitrary values: keeps the global sheet in budget */
.documentos-master {
  width: 24rem;
}
@media (min-width: 1280px) {
  .documentos-master {
    width: 28rem;
  }
}
</style>
