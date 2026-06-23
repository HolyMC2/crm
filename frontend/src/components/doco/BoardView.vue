<!--
  Lightweight kanban board for the doco list pages (Leads/Deals). Columns come
  from `groups` (status list), cards from `rows` (paginated set the page already
  loaded). Column header counts use `counts` (an accurate aggregate map), so the
  header total is right even when not every card is loaded. Drag a card to another
  column to emit `change(row, newValue)`. Card body is a scoped slot.
-->
<template>
  <div class="scb flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
    <div
      v-for="g in groups"
      :key="g.value"
      class="flex w-[260px] flex-none flex-col rounded-lg bg-surface-gray-1"
      :class="dragOver === g.value ? 'ring-2 ring-outline-green-2' : ''"
      @dragover.prevent="dragOver = g.value"
      @dragleave="dragOver = null"
      @drop="onDrop(g.value)"
    >
      <div class="flex items-center justify-between px-3 py-2.5">
        <div class="flex items-center gap-2 text-[12.5px] font-semibold text-ink-gray-8">
          <span class="h-2 w-2 rounded-full" :style="`background:${g.color || 'var(--outline-gray-2)'}`" />
          {{ g.label }}
          <span
            class="rounded-full bg-surface-gray-2 px-1.5 text-[11px] font-medium text-ink-gray-6"
          >
            {{ counts[g.value]?.count ?? colRows(g.value).length }}
          </span>
        </div>
        <span
          v-if="counts[g.value]?.value"
          class="text-[11px] font-medium text-ink-gray-5"
        >
          {{ formatValue(counts[g.value].value) }}
        </span>
      </div>
      <div class="scb flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <div
          v-for="row in colRows(g.value)"
          :key="row.name"
          class="cursor-pointer rounded-md border border-outline-gray-1 bg-surface-white p-2.5 shadow-sm hover:border-outline-gray-3"
          draggable="true"
          @dragstart="dragged = row"
          @dragend="dragged = null"
          @click="emit('cardClick', row)"
        >
          <slot name="card" :row="row" />
        </div>
        <div
          v-if="!colRows(g.value).length"
          class="px-1 py-4 text-center text-[11px] text-ink-gray-3"
        >
          —
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  groupField: { type: String, default: 'status' },
  counts: { type: Object, default: () => ({}) },
  formatValue: { type: Function, default: (v) => v },
})
const emit = defineEmits(['cardClick', 'change'])

const dragged = ref(null)
const dragOver = ref(null)

function colRows(val) {
  return props.rows.filter((r) => (r[props.groupField] || '') === val)
}
function onDrop(val) {
  dragOver.value = null
  const row = dragged.value
  dragged.value = null
  if (row && (row[props.groupField] || '') !== val) emit('change', row, val)
}
</script>
