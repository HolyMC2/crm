<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- phone pager: one chip per column with its count. The board below shows
         one snapped column at a time, so this is how you see which column is
         open and jump to another; it follows the board as it scrolls. -->
    <div
      v-if="isMobile && visibleColumns.length"
      ref="pagerEl"
      data-kanban-pager
      class="flex flex-none gap-1.5 overflow-x-auto px-2 pb-1 pt-2 [scrollbar-width:none]"
      role="group"
      :aria-label="__('Columns')"
    >
      <button
        v-for="(column, i) in visibleColumns"
        :key="column.column.name"
        type="button"
        :aria-current="i === activeColumn ? 'true' : undefined"
        class="flex min-h-11 min-w-11 max-w-full flex-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
        :class="
          i === activeColumn
            ? 'border-outline-gray-3 bg-surface-gray-3 text-ink-gray-9'
            : 'border-outline-gray-2 text-ink-gray-6'
        "
        @click="scrollToColumn(i)"
      >
        <IndicatorIcon :class="parseColor(column.column.color)" />
        <span class="truncate">{{ column.column.name }}</span>
        <span class="shrink-0 tabular-nums text-ink-gray-7">{{
          columnCount(column)
        }}</span>
      </button>
    </div>
    <div
      ref="boardEl"
      data-kanban-board
      class="flex h-full min-h-0 overflow-x-auto max-sm:snap-x max-sm:snap-mandatory"
    >
      <Draggable
        v-if="columns"
        :list="columns"
        item-key="column"
        :delay="isTouchScreenDevice() ? 200 : 0"
        class="flex sm:mx-2.5 mx-2 pb-3.5"
        @end="updateColumn"
      >
        <template #item="{ element: column }">
          <!-- phone: a column is most of the viewport and snaps, the next one peeks -->
          <div
            v-if="!column.column.delete"
            data-kanban-column
            class="flex flex-col gap-2.5 min-w-72 w-72 max-sm:min-w-[86vw] max-sm:w-[86vw] max-sm:snap-start hover:bg-surface-gray-2 rounded-lg p-2.5"
          >
            <div class="flex gap-2 items-center group justify-between">
              <div class="flex items-center text-base">
                <Popover>
                  <template #target="{ togglePopover }">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="hover:!bg-surface-gray-2"
                      @click="togglePopover"
                    >
                      <IndicatorIcon :class="parseColor(column.column.color)" />
                    </Button>
                  </template>
                  <template #body>
                    <div
                      class="flex flex-col gap-3 px-3 py-2.5 min-w-40 rounded-lg bg-surface-elevation-2 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none"
                    >
                      <div class="flex gap-1">
                        <Button
                          v-for="color in colors"
                          :key="color"
                          variant="ghost"
                          @click="() => (column.column.color = color)"
                        >
                          <IndicatorIcon :class="parseColor(color)" />
                        </Button>
                      </div>
                      <div class="flex flex-row-reverse">
                        <Button
                          variant="solid"
                          :label="__('Apply')"
                          @click="updateColumn"
                        />
                      </div>
                    </div>
                  </template>
                </Popover>
                <div class="text-ink-gray-9">{{ column.column.name }}</div>
                <span class="ml-1.5 text-sm tabular-nums text-ink-gray-7">{{
                  columnCount(column)
                }}</span>
              </div>
              <div class="flex">
                <Dropdown :options="actions(column)">
                  <template #default>
                    <Button
                      class="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                      icon="lucide-more-horizontal"
                      variant="ghost"
                    />
                  </template>
                </Dropdown>
                <Button
                  icon="lucide-plus"
                  variant="ghost"
                  @click="options.onNewClick(column)"
                />
              </div>
            </div>
            <div class="overflow-y-auto flex flex-col gap-2 h-full">
              <Draggable
                :list="column.data"
                group="fields"
                item-key="name"
                class="flex flex-col gap-3.5 flex-1"
                :delay="isTouchScreenDevice() ? 200 : 0"
                :data-column="column.column.name"
                @end="updateColumn"
              >
                <template #item="{ element: fields }">
                  <component
                    :is="options.getRoute ? 'router-link' : 'div'"
                    class="pt-3 px-3.5 pb-2.5 rounded-lg border bg-surface-base text-base flex flex-col text-ink-gray-9"
                    :data-name="fields.name"
                    v-bind="{
                      to: options.getRoute
                        ? options.getRoute(fields)
                        : undefined,
                      onClick: options.onClick
                        ? () => options.onClick(fields)
                        : undefined,
                    }"
                  >
                    <slot
                      name="title"
                      v-bind="{ fields, titleField, itemName: fields.name }"
                    >
                      <div class="h-5 flex items-center">
                        <div v-if="fields[titleField]">
                          {{ fields[titleField] }}
                        </div>
                        <div v-else class="text-ink-gray-4">
                          {{ __('No Title') }}
                        </div>
                      </div>
                    </slot>
                    <div class="border-b h-px my-2.5" />

                    <div class="flex flex-col gap-3.5">
                      <template v-for="value in column.fields" :key="value">
                        <slot
                          name="fields"
                          v-bind="{
                            fields,
                            fieldName: value,
                            itemName: fields.name,
                          }"
                        >
                          <div v-if="fields[value]" class="truncate">
                            {{ fields[value] }}
                          </div>
                        </slot>
                      </template>
                    </div>
                    <div class="border-b h-px mt-2.5 mb-2" />
                    <slot name="actions" v-bind="{ itemName: fields.name }">
                      <div class="flex gap-2 items-center justify-between">
                        <div></div>
                        <Button
                          icon="lucide-plus"
                          variant="ghost"
                          @click.stop.prevent
                        />
                      </div>
                    </slot>
                  </component>
                </template>
              </Draggable>
              <div
                v-if="column.column.count < column.column.all_count"
                class="flex items-center justify-center"
              >
                <Button
                  :label="__('Load More')"
                  @click="emit('loadMore', column.column.name)"
                />
              </div>
            </div>
          </div>
        </template>
      </Draggable>
      <!-- Rendered only once the columns exist: alone it would be the board's
         first snap target, and Chromium keeps a tracked snap target in view
         through later layout changes — the board opened scrolled to the end. -->
      <div v-if="columns.length" class="shrink-0 min-w-64 max-sm:snap-start">
        <Combobox
          :model-value="null"
          :options="deletedColumns"
          @update:selected-option="(e) => addColumn(e)"
        >
          <template #trigger="{ open, setOpen }">
            <Button
              class="w-full mt-2.5 mb-1 mr-5"
              :label="__('Add Column')"
              iconLeft="plus"
              @click="setOpen(!open)"
            />
          </template>
          <template #footer>
            <Button
              class="w-full"
              :label="__('Reload Columns')"
              :iconLeft="RefreshIcon"
              @click="updateColumn(null, true)"
            />
          </template>
        </Combobox>
      </div>
    </div>
  </div>
</template>
<script setup>
import RefreshIcon from '@/components/Icons/RefreshIcon.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import { isTouchScreenDevice, colors, parseColor } from '@/utils'
import { isMobile } from '@/composables/breakpoint'
import Draggable from 'vuedraggable'
import { Combobox, Dropdown, Popover } from 'frappe-ui'
import { useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

defineProps({
  options: {
    type: Object,
    default: () => ({
      getRoute: null,
      onClick: null,
      onNewClick: null,
    }),
  },
})

const emit = defineEmits(['update', 'loadMore'])

const kanban = defineModel({ type: Object })

const titleField = computed(() => {
  return kanban.value?.data?.title_field
})

const columns = computed(() => {
  if (!kanban.value?.data?.data || kanban.value.data.view_type != 'kanban')
    return []
  let _columns = kanban.value.data.data

  let has_color = _columns.some((column) => column.column?.color)
  if (!has_color) {
    _columns.forEach((column, i) => {
      column.column['color'] = colors[i % colors.length]
    })
  }
  return _columns
})

const deletedColumns = computed(() => {
  const _columns = kanban.value?.data?.kanban_columns || []
  return _columns
    ?.filter((col) => col['delete'])
    .map((col) => {
      return { label: col.name, value: col.name }
    })
})

const visibleColumns = computed(() =>
  columns.value.filter((col) => !col.column.delete),
)

// all_count is the server total for the column; count/page_length only say
// how much of it is loaded so far.
function columnCount(column) {
  return column.column.all_count ?? column.data?.length ?? 0
}

// ---- phone pager: which column is snapped into view, and jumping to one ----
const boardEl = ref(null)
const pagerEl = ref(null)
const activeColumnName = ref(null)
const activeColumn = computed(() =>
  visibleColumns.value.findIndex(
    (col) => col.column.name === activeColumnName.value,
  ),
)

function columnEls() {
  return boardEl.value
    ? Array.from(boardEl.value.querySelectorAll('[data-kanban-column]'))
    : []
}

// A column's offset inside the board's scroll content, independent of any
// positioned ancestor (offsetLeft would measure against the wrong parent).
function columnOffset(el) {
  const board = boardEl.value
  return (
    el.getBoundingClientRect().left -
    board.getBoundingClientRect().left +
    board.scrollLeft
  )
}

function syncActiveColumn() {
  const board = boardEl.value
  if (!board) return
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  columnEls().forEach((el, i) => {
    const distance = Math.abs(columnOffset(el) - board.scrollLeft)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  })
  activeColumnName.value = visibleColumns.value[best]?.column.name ?? null
}

function scrollToColumn(i, behavior = 'smooth') {
  const el = columnEls()[i]
  if (!boardEl.value || !el) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    behavior = 'instant'
  boardEl.value.scrollTo({ left: columnOffset(el), behavior })
  activeColumnName.value = visibleColumns.value[i]?.column.name ?? null
}

function revealActiveChip() {
  const pager = pagerEl.value
  const chip = pager?.querySelectorAll('button')[activeColumn.value]
  if (!chip) return
  const bounds = pager.getBoundingClientRect()
  const target = chip.getBoundingClientRect()
  const delta =
    target.left < bounds.left
      ? target.left - bounds.left
      : Math.max(0, target.right - bounds.right)
  // Scroll this row only: scrollIntoView can also move the page vertically.
  if (delta)
    pager.scrollTo({ left: pager.scrollLeft + delta, behavior: 'instant' })
}

watch(
  () => visibleColumns.value.map((col) => col.column.name),
  (names, previousNames = []) => {
    if (
      names.length === previousNames.length &&
      names.every((name, i) => name === previousNames[i])
    ) {
      revealActiveChip()
      return
    }
    let index = names.indexOf(activeColumnName.value)
    if (index === -1) {
      // Keep the same position when its column was deleted, or the new last
      // column when that position no longer exists.
      index = Math.min(
        Math.max(previousNames.indexOf(activeColumnName.value), 0),
        names.length - 1,
      )
    }
    activeColumnName.value = names[index] ?? null
    if (isMobile.value) scrollToColumn(index, 'instant')
    revealActiveChip()
  },
  { immediate: true, flush: 'post' },
)
watch([activeColumn, pagerEl], revealActiveChip, { flush: 'post' })

useEventListener(boardEl, 'scroll', syncActiveColumn, { passive: true })
useEventListener('resize', revealActiveChip)

function actions(column) {
  return [
    {
      group: __('Options'),
      hideLabel: true,
      items: [
        {
          label: __('Delete'),
          icon: 'trash-2',
          onClick: () => {
            column.column['delete'] = true
            updateColumn()
          },
        },
      ],
    },
  ]
}

function addColumn(e) {
  let column = columns.value.find((col) => col.column.name == e.value)
  column.column['delete'] = false
  columns.value.splice(columns.value.indexOf(column), 1)
  columns.value.push(column)
  updateColumn()
}

function updateColumn(d, fetchNewColumns = false) {
  let toColumn = d?.to?.dataset.column
  let fromColumn = d?.from?.dataset.column
  let itemName = d?.item?.dataset.name

  let _columns = []
  columns.value.forEach((col) => {
    col.column['order'] = col.data.map((d) => d.name)
    if (col.column.page_length) {
      delete col.column.page_length
    }
    _columns.push(col.column)
  })

  let data = { kanban_columns: _columns, fetchNewColumns }

  if (toColumn != fromColumn) {
    data = { item: itemName, to: toColumn, kanban_columns: _columns }
  }

  emit('update', data)
}
</script>
