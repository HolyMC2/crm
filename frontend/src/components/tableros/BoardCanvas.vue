<template>
  <!-- Phone: one column in reading order. -->
  <div v-if="phone" class="flex flex-col gap-3" data-testid="board-column">
    <div
      v-for="w in ordered"
      :key="w.id"
      :style="
        phoneHeight(w) && datos[w.id]?.kind !== 'card'
          ? { height: `${phoneHeight(w)}px` }
          : undefined
      "
    >
      <TableroWidget
        :widget="w"
        :payload="datos[w.id]"
        :loading="loading && !datos[w.id]"
        :can-edit="canEdit"
        :currency="currency"
        :back="back"
        @edit="$emit('edit', w)"
        @retry="$emit('retry', w.id)"
        @filter="(patch) => $emit('filter', patch)"
      />
    </div>
  </div>

  <!-- Desk: the board's own grid, dragged and resized while arranging. -->
  <div
    v-else
    class="-mx-1.5"
    :class="
      arranging &&
      'rounded-7 bg-surface-gray-1 outline-dashed outline-1 outline-outline-gray-3'
    "
    data-testid="board-grid"
  >
    <GridLayout
      :model-value="grid"
      :cols="COLS"
      :row-height="ROW_PX"
      :disabled="!arranging"
      @update:model-value="(value) => $emit('update:grid', value)"
      @layout-updated="(layout) => $emit('layout', layout)"
    >
      <template #item="{ i }">
        <div class="h-full p-1.5" :class="arranging && 'cursor-move'">
          <TableroWidget
            v-if="byId[i]"
            :widget="byId[i]"
            :payload="datos[i]"
            :loading="loading && !datos[i]"
            :can-edit="canEdit"
            :currency="currency"
            :back="back"
            @edit="$emit('edit', byId[i])"
            @retry="$emit('retry', i)"
            @fit="(px) => $emit('fit', i, px)"
            @filter="(patch) => $emit('filter', patch)"
          />
        </div>
      </template>
    </GridLayout>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent } from 'vue'
import TableroWidget from '@/components/tableros/TableroWidget.vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { COLS, ROW_PX, phoneHeight, readingOrder } from '@/tableros/board'

// A board's widgets drawn: the 20-column grid on the desk (dragged and
// resized while `arranging`), one column in reading order on a phone. The
// Tableros page and the Resultados workspace both draw with it.
// The drag-and-resize grid is the desk's only: a phone never loads it.
const GridLayout = defineAsyncComponent(
  () => import('@/components/Dashboard/GridLayout.vue'),
)

const props = defineProps({
  widgets: { type: Array, required: true },
  /** grid-layout-plus items (board.gridOf), owned by the page. */
  grid: { type: Array, required: true },
  datos: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  arranging: { type: Boolean, default: false },
  currency: { type: String, default: '' },
  back: { type: String, default: '' },
})
defineEmits(['edit', 'retry', 'fit', 'filter', 'layout', 'update:grid'])

const byId = computed(() =>
  Object.fromEntries(props.widgets.map((w) => [w.id, w])),
)
const ordered = computed(() => readingOrder(props.widgets))
</script>
