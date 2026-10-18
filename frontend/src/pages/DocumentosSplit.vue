<template>
  <!-- A Documentos list and its record (Shell SPEC §6 DD4). ≥1024: master-
       detail, the list on the left keeps its filters, rows and scroll while
       the record on the right changes (j/k/Enter, e, Esc). Below: one page
       at a time, the record's back returns to the list as it was. -->
  <div
    v-if="wide"
    class="flex h-full min-w-0 flex-1 overflow-hidden"
    data-testid="documentos-split"
  >
    <div
      class="flex w-[24rem] flex-none flex-col overflow-hidden border-r border-outline-gray-1 xl:w-[28rem]"
    >
      <DocumentosList pane />
    </div>
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <DocumentoRecord v-if="name" :key="recordKey" pane />
      <EmptyState
        v-else
        state="empty"
        title="Elige un documento"
        message="Ábrelo de la lista: con j y k te mueves, con Enter lo abres."
      />
    </div>
  </div>
  <DocumentoRecord v-else-if="name" :key="recordKey" />
  <DocumentosList v-else />
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EmptyState } from '@/components/ui'
import { isWide } from '@/composables/breakpoint'
import DocumentoRecord from './DocumentoRecord.vue'
import DocumentosList from './DocumentosList.vue'

const route = useRoute()
const wide = isWide
const name = computed(() => String(route.params.name || ''))
const recordKey = computed(() => route.path)
</script>
