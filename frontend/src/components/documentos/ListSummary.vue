<template>
  <!-- The split's right pane before a record is open: what the list on the
       left holds, by status and by what it is made of (its facets), and the
       way into its first document. A status tile or a facet value narrows the
       list; «Abrir el primero» opens the top row. -->
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
    <!-- Each facet's most frequent values, the count beside each and its share
         of the largest as a bar behind the word. A value narrows the list; the
         picked one, pressed again, lets go. -->
    <div
      v-if="summary.facets?.length"
      class="grid gap-6 sm:grid-cols-2"
      data-testid="documentos-facets"
    >
      <section
        v-for="facet in summary.facets"
        :key="facet.fieldname"
        :aria-label="facet.label"
        :data-facet="facet.fieldname"
      >
        <h3 class="pb-1 text-sm font-medium text-ink-gray-6">
          {{ facet.label }}
        </h3>
        <button
          v-for="v in facet.values"
          :key="v.value"
          type="button"
          class="press flex min-h-11 w-full items-center gap-3 rounded-md text-left hover:bg-surface-gray-1"
          :aria-pressed="String(v.value === facet.selected)"
          :data-facet-value="v.value"
          @click="
            summary.setFilter?.(
              facet.fieldname,
              v.value === facet.selected ? '' : v.value,
            )
          "
        >
          <span class="relative min-w-0 flex-1 py-1">
            <span
              class="absolute inset-y-0 left-0 rounded"
              :class="
                v.value === facet.selected
                  ? 'bg-[var(--muelle-accent-soft)]'
                  : 'bg-surface-gray-2'
              "
              :style="{ width: `${Math.max(2, Math.round(v.share * 100))}%` }"
              aria-hidden="true"
            />
            <span
              class="relative block truncate px-2 text-base"
              :class="
                v.value === facet.selected
                  ? 'font-semibold text-ink-gray-9'
                  : 'text-ink-gray-8'
              "
              >{{ v.label }}</span
            >
          </span>
          <span class="num flex-none pr-2 text-base text-ink-gray-7">{{
            v.count
          }}</span>
        </button>
        <p v-if="facet.more" class="px-2 pt-1 text-xs text-ink-gray-5">
          Los más frecuentes. Busca para encontrar otro.
        </p>
      </section>
    </div>
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
  // facets, setFilter, shown, more, total, first, firstTitle, loading }
  summary: { type: Object, required: true },
})

const shownLine = computed(() => {
  const { shown = 0, more, total, loading } = props.summary
  if (loading && !shown) return 'Cargando…'
  if (!shown) return 'Sin documentos en esta vista'
  // The server's count when it has arrived; until then what is loaded.
  const exact = total != null && Number.isFinite(Number(total))
  const n = exact
    ? Number(total).toLocaleString('es-MX')
    : more
      ? `Más de ${shown}`
      : String(shown)
  const one = exact ? Number(total) === 1 : shown === 1 && !more
  return `${n} ${one ? 'documento' : 'documentos'} en esta vista`
})
</script>
