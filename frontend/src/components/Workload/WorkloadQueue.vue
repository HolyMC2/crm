<template>
  <div>
    <div v-if="error" role="alert" class="wl-notice">
      <p>{{ error }}</p>
      <button type="button" class="wl-btn mt-2" @click="$emit('retry')">
        {{ __('Reintentar') }}
      </button>
    </div>

    <div
      v-else-if="loading"
      class="space-y-2"
      aria-hidden="true"
      data-testid="queue-skeleton"
    >
      <div
        v-for="n in 5"
        :key="n"
        class="h-11 animate-pulse rounded-md bg-surface-gray-2"
      />
    </div>

    <p
      v-else-if="!items.length"
      class="rounded-lg border border-dashed border-outline-gray-2 p-4 text-sm text-ink-gray-6"
    >
      {{ emptyText }}
    </p>

    <div
      v-else
      class="overflow-hidden rounded-lg border border-outline-gray-2"
      @keydown="onKeydown"
    >
      <div
        class="hidden gap-3 border-b border-outline-gray-2 bg-surface-gray-1 px-3 py-2 text-xs font-medium text-ink-gray-6 md:grid"
        :class="gridClass"
      >
        <span v-if="!selectable" aria-hidden="true" />
        <button
          v-else
          type="button"
          role="checkbox"
          class="flex size-5 items-center justify-center rounded border border-outline-gray-3 text-ink-gray-7"
          :aria-checked="allState"
          :aria-label="__('Seleccionar todos los de esta página')"
          :disabled="busy"
          @click="$emit('toggle-all', allState !== 'true')"
        >
          <span v-if="allState === 'true'" aria-hidden="true">✓</span>
          <span v-else-if="allState === 'mixed'" aria-hidden="true">–</span>
        </button>
        <span>{{ __('Registro') }}</span>
        <span>{{ __('Tipo') }}</span>
        <span>{{ __('Relacionado') }}</span>
        <span class="text-right">{{ __('Vence') }}</span>
        <span class="text-right">{{ __('Sin cambios') }}</span>
        <span>{{ __('Estado') }}</span>
        <span>{{ __('Responsable') }}</span>
      </div>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in rows"
          :key="row.key"
          class="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2 md:items-center"
          :class="[gridClass, row.selected ? 'bg-surface-gray-2' : '']"
        >
          <span v-if="!selectable" aria-hidden="true" />
          <input
            v-else
            class="mt-1 size-5 md:mt-0"
            type="checkbox"
            data-row-check
            :aria-label="__('Seleccionar') + ' ' + row.title"
            :checked="row.selected"
            :disabled="busy"
            @change="$emit('toggle', row.source)"
          />
          <div class="min-w-0">
            <a
              :href="row.href"
              data-row-link
              class="block truncate text-sm font-medium text-ink-gray-9 hover:underline"
              @click="$emit('open-record', $event)"
              >{{ row.title }}</a
            >
            <p class="truncate text-xs text-ink-gray-5">
              <span>{{ row.id }}</span>
              <span class="md:hidden">
                · {{ row.type }} · {{ row.status }} · {{ row.owner }}</span
              >
            </p>
          </div>
          <div class="text-right md:hidden">
            <p v-if="row.due" class="text-xs tabular-nums" :class="row.dueTone">
              {{ row.due }}
            </p>
            <p
              v-if="row.age != null"
              class="text-xs tabular-nums text-ink-gray-5"
            >
              {{ row.ageText }}
            </p>
          </div>
          <span class="hidden truncate text-sm text-ink-gray-7 md:block">{{
            row.type
          }}</span>
          <span class="hidden truncate text-sm text-ink-gray-7 md:block">
            <a
              v-if="row.parentHref"
              :href="row.parentHref"
              class="hover:underline"
              @click="$emit('open-record', $event)"
              >{{ row.related }}</a
            >
            <template v-else>{{ row.related || '—' }}</template>
          </span>
          <span
            class="hidden text-right text-sm tabular-nums md:block"
            :class="row.dueTone"
            >{{ row.due || '—' }}</span
          >
          <span
            class="hidden text-right text-sm tabular-nums text-ink-gray-6 md:block"
            >{{ row.age == null ? '—' : row.ageText }}</span
          >
          <span class="hidden truncate text-sm text-ink-gray-7 md:block">{{
            row.status
          }}</span>
          <span class="hidden truncate text-sm text-ink-gray-7 md:block">{{
            row.owner
          }}</span>
        </li>
      </ul>
      <p
        v-if="selectable"
        class="hidden border-t border-outline-gray-1 px-3 py-1.5 text-xs text-ink-gray-5 md:block"
      >
        {{
          __(
            '↑ ↓ para moverte · Espacio o X para seleccionar · Enter para abrir',
          )
        }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  ageDays,
  dueState,
  formatSiteDate,
  workItemHref,
  workItemKey,
} from '@/utils/workloadFormat'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedKeys: { type: Array, default: () => [] },
  asOf: { type: String, default: '' },
  dateFormat: { type: String, default: '' },
  ownerName: { type: Function, default: (user) => user },
  pipelineName: { type: Function, default: (name) => name },
  emptyText: { type: String, default: '' },
  error: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  // Off for people who cannot reassign: rows open, nothing is selected.
  selectable: { type: Boolean, default: true },
})
defineEmits(['toggle', 'toggle-all', 'open-record', 'retry'])

const gridClass =
  'md:grid-cols-[1.25rem_minmax(0,2.2fr)_5rem_minmax(0,1.2fr)_7.5rem_5.5rem_minmax(0,1fr)_minmax(0,1fr)]'

const TYPES = {
  'CRM Lead': () => __('Lead'),
  'CRM Deal': () => __('Deal'),
  'CRM Task': () => __('Tarea'),
}

const rows = computed(() => {
  const chosen = new Set(props.selectedKeys)
  return props.items.map((row) => {
    const due = row.due_date
      ? formatSiteDate(String(row.due_date), props.dateFormat)
      : ''
    const state = dueState(String(row.due_date || ''), props.asOf)
    const age = ageDays(String(row.modified || ''), props.asOf)
    const isTask = row.doctype === 'CRM Task'
    const parent =
      isTask && row.reference_docname
        ? {
            doctype: row.reference_doctype,
            name: row.reference_docname,
          }
        : null
    return {
      source: row,
      key: workItemKey(row),
      selected: chosen.has(workItemKey(row)),
      href: workItemHref(row),
      title: row.label || row.name,
      id: row.name,
      type: (TYPES[row.doctype] || (() => row.doctype))(),
      related: parent
        ? `${(TYPES[parent.doctype] || (() => ''))()} ${parent.name}`.trim()
        : row.pipeline
          ? props.pipelineName(row.pipeline)
          : row.sales_company || '',
      parentHref:
        parent && ['CRM Lead', 'CRM Deal'].includes(parent.doctype)
          ? workItemHref(parent)
          : '',
      status: row.status ? __(row.status) : '—',
      owner: row.owner ? props.ownerName(row.owner) : __('Sin asignar'),
      due,
      dueTone:
        state === 'overdue'
          ? 'text-ink-red-6'
          : state === 'today'
            ? 'text-ink-amber-7'
            : 'text-ink-gray-6',
      age,
      ageText: age == null ? '' : __('{0} d', [age]),
    }
  })
})

const allState = computed(() => {
  const selected = rows.value.filter((row) => row.selected).length
  if (!selected) return 'false'
  return selected === rows.value.length ? 'true' : 'mixed'
})

// Arrow keys / j k move between row checkboxes; X toggles; Enter opens.
function onKeydown(event) {
  const checks = [...event.currentTarget.querySelectorAll('[data-row-check]')]
  const index = checks.indexOf(document.activeElement)
  if (index < 0) return
  const key = event.key
  if (key === 'ArrowDown' || key === 'j' || key === 'ArrowUp' || key === 'k') {
    event.preventDefault()
    const step = key === 'ArrowDown' || key === 'j' ? 1 : -1
    checks[Math.min(checks.length - 1, Math.max(0, index + step))]?.focus()
  } else if (key === 'x' || key === 'X') {
    event.preventDefault()
    checks[index].click()
  } else if (key === 'Enter') {
    event.preventDefault()
    checks[index].closest('li')?.querySelector('[data-row-link]')?.click()
  }
}
</script>

<style scoped>
.wl-btn {
  @apply min-h-9 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50;
}
.wl-notice {
  @apply rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-3 text-sm text-ink-amber-8;
}
</style>
