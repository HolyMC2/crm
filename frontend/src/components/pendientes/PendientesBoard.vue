<template>
  <!-- Tablero (desktop): the rows of the current list in columns by state.
       A card moves by dragging it to another column, or by its ⋯ «Move to…»
       menu (keyboard and touch). Cards open the pendiente's own page. -->
  <div
    class="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-6 sm:px-6"
    data-pendientes-board
  >
    <section
      v-for="column in columns"
      :key="column.state"
      :aria-labelledby="`board-${column.state}`"
      class="flex min-h-0 w-72 flex-none flex-col rounded-xl bg-surface-gray-1 xl:w-0 xl:min-w-56 xl:flex-1"
      :class="over === column.state ? 'ring-2 ring-outline-gray-4' : ''"
      :data-board-column="column.state"
      @dragover.prevent="over = column.state"
      @dragleave="leave($event, column.state)"
      @drop.prevent="drop(column.state)"
    >
      <h2
        :id="`board-${column.state}`"
        class="flex items-center gap-2 px-3 pb-1 pt-3 text-sm font-semibold text-ink-gray-8"
      >
        {{ column.label }}
        <span
          class="rounded-full bg-surface-gray-3 px-2 text-xs font-medium tabular-nums text-ink-gray-7"
          >{{ column.rows.length }}</span
        >
      </h2>
      <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        <li
          v-for="row in column.rows"
          :key="row.doctype + row.name"
          :draggable="movable(row) ? 'true' : 'false'"
          class="rounded-lg border border-outline-gray-1 bg-surface-base p-3 shadow-sm"
          :class="[
            busy.has(row.doctype + row.name) ? 'opacity-60' : '',
            movable(row) ? 'cursor-grab active:cursor-grabbing' : '',
          ]"
          :data-board-card="row.doctype + row.name"
          @dragstart="start($event, row)"
          @dragend="dragging = null"
        >
          <div class="flex items-start gap-1">
            <RouterLink
              :to="pendienteRoute(row, query)"
              class="min-w-0 flex-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            >
              <p
                class="line-clamp-3 text-sm text-ink-gray-9"
                :class="row.status === 'Closed' ? 'text-ink-gray-5' : ''"
              >
                {{ row.description }}
              </p>
              <p
                class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-gray-6"
              >
                <span :class="dueClass(row)">{{ dueText(row, today) }}</span>
                <span
                  v-if="row.reference_label || row.reference_name"
                  class="truncate"
                  >{{ row.reference_label || row.reference_name }}</span
                >
                <span
                  v-if="row.priority === 'High'"
                  class="rounded bg-surface-amber-1 px-1.5 font-medium text-ink-amber-9"
                  >{{ priorityLabel(row.priority) }}</span
                >
              </p>
              <p
                v-if="showAssignee && assigneeOf(row)"
                class="mt-1 truncate text-xs text-ink-gray-6"
              >
                {{ __('Assigned to {0}', [assigneeOf(row)]) }}
              </p>
            </RouterLink>
            <Dropdown v-if="movable(row)" :options="moveOptions(row)">
              <Button
                variant="ghost"
                icon="more-horizontal"
                class="-mr-1 -mt-1 min-h-7 min-w-7"
                :aria-label="__('Move {0} to…', [row.description])"
              />
            </Dropdown>
          </div>
        </li>
        <li
          v-if="!column.rows.length"
          class="px-2 py-6 text-center text-sm text-ink-gray-5"
        >
          {{ __('Nothing here') }}
        </li>
      </ul>
    </section>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, Dropdown } from 'frappe-ui'
import { personName } from '@/utils/display'
import {
  BOARD_COLUMNS,
  boardColumn,
  dueText,
  pendienteRoute,
  priorityLabel,
  stateLabel,
} from '@/composables/usePendientes'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  today: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
  showAssignee: { type: Boolean, default: false },
  /** «Asignadas por mí»: who asked may move the work too (the server decides). */
  movableAll: { type: Boolean, default: false },
  busy: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['move'])
const over = ref(''),
  dragging = ref(null)

const columns = computed(() =>
  BOARD_COLUMNS.map((state) => ({
    state,
    label: stateLabel(state),
    rows: props.rows.filter((row) => boardColumn(row) === state),
  })),
)
function movable(row) {
  return Boolean((row.mine || props.movableAll) && !row.cancelled)
}
function assigneeOf(row) {
  return row.mine ? '' : row.assigned_to_name || personName(row.assigned_to)
}
function dueClass(row) {
  if (row.status === 'Closed') return ''
  return row.group === 'overdue'
    ? 'font-medium text-ink-red-7'
    : row.group === 'today'
      ? 'font-medium text-ink-amber-9'
      : ''
}
function moveOptions(row) {
  const here = boardColumn(row)
  return BOARD_COLUMNS.filter((state) => state !== here).map((state) => ({
    label: __('Move to {0}', [stateLabel(state)]),
    onClick: () => emit('move', row, state),
  }))
}
function start(event, row) {
  if (!movable(row)) return event.preventDefault()
  dragging.value = row
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', row.doctype + row.name)
}
function leave(event, state) {
  // Leaving for a child card is not leaving the column.
  if (event.currentTarget.contains(event.relatedTarget)) return
  if (over.value === state) over.value = ''
}
function drop(state) {
  over.value = ''
  const row = dragging.value
  dragging.value = null
  if (row && boardColumn(row) !== state) emit('move', row, state)
}
</script>
