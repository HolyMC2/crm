<template>
  <!-- The split's right pane before a record is open: what the list on the
       left holds, by status, and the way into its first document. A status
       tile narrows the list; «Abrir el primero» opens the top row. -->
  <div
    class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10"
    data-testid="documentos-summary"
  >
    <div class="flex items-center gap-3">
      <span
        class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
        aria-hidden="true"
      >
        <span :class="[summary.icon || 'lucide-file-text', 'size-6']" />
      </span>
      <div class="min-w-0">
        <h2
          class="title-face truncate text-2xl font-semibold leading-tight text-ink-gray-9"
        >
          {{ summary.title }}
        </h2>
        <p class="text-base text-ink-gray-6">{{ shownLine }}</p>
      </div>
    </div>
    <KpiGrid v-if="summary.chips?.length" role="group" aria-label="Por estado">
      <KpiTile
        v-for="chip in summary.chips"
        :key="chip.value || 'todos'"
        :label="chip.label"
        :value="chip.count ?? '…'"
        :pressed="chip.value === summary.chip"
        :data-summary-chip="chip.value || 'todos'"
        @click="summary.setChip?.(chip.value)"
      />
    </KpiGrid>
    <div v-if="summary.first" class="flex flex-wrap items-center gap-3">
      <RouterLink
        :to="summary.first"
        :class="BTN.filled"
        data-testid="documentos-summary-first"
      >
        <span class="lucide-arrow-right size-5" aria-hidden="true" />
        Abrir el primero
      </RouterLink>
      <span class="text-sm text-ink-gray-6"
        >{{ summary.firstTitle }}. Con j y k te mueves, con Enter lo
        abres.</span
      >
    </div>
    <p v-else-if="!summary.loading" class="text-base text-ink-gray-7">
      No hay documentos con estos filtros. Cambia el estado o quita los filtros.
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { KpiGrid, KpiTile } from '@/components/ui'
import { BTN } from '@/documentos/tools'

const props = defineProps({
  // DocumentosList's `summary` event: { title, icon, chips, chip, setChip,
  // shown, more, first, firstTitle, loading }
  summary: { type: Object, required: true },
})

const shownLine = computed(() => {
  const { shown = 0, more, loading } = props.summary
  if (loading && !shown) return 'Cargando…'
  if (!shown) return 'Sin documentos en esta vista'
  const n = more ? `Más de ${shown}` : String(shown)
  return `${n} ${shown === 1 && !more ? 'documento' : 'documentos'} en esta vista`
})
</script>
