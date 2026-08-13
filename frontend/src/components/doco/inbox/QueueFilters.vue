<!--
  Inbox filter panel (Marco 2026-08-13, reworked same day).

  v1 dumped every status as a checkbox — 22 rows of wall on doco, and the thing
  an operator actually wants ("todo menos Completados y Cancelados") took 20 taps
  and broke the day someone adds a status. So the panel now leads with DECISIONS
  and keeps the raw statuses as a drill-down:

    · Quick filters — Abiertos / Cerrados resolve server-side from the status
      TYPE (Won/Lost/Junk = cerrado), so they stay correct as statuses change.
      En reparación / Listos p' entregar are the same idea over repair states.
    · Period — Hoy / 7 / 30 días set the date range in one tap; the exact
      from/to inputs stay for the rare precise question.
    · Estados específicos — collapsed by default, grouped Abiertos / Ganados /
      Perdidos so a hand-pick is a short list, not a scroll.

  Picking an explicit status clears the coarse state and vice versa (composables/
  inbox.setQueueFilters): both answer the same question, and showing "Abiertos"
  while the list obeys a hand-picked status is a lie.
-->
<template>
  <div class="relative">
    <div class="flex items-center gap-1.5">
      <button
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        :class="
          queueFilterCount
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
        "
        :aria-expanded="open"
        :title="__('Filtrar por estado, reparación o fecha')"
        @click="open = !open"
      >
        <LucideSlidersHorizontal class="h-3 w-3" />
        {{ __('Filtros') }}
        <span v-if="queueFilterCount" class="text-[10px] opacity-80">{{ queueFilterCount }}</span>
      </button>
      <button
        v-if="queueFilterCount"
        class="text-[10.5px] text-ink-gray-5 underline hover:text-ink-gray-8"
        @click="clearQueueFilters"
      >
        {{ __('Limpiar') }}
      </button>
    </div>

    <!-- active filters, so a narrowed queue can never look like an empty inbox -->
    <div v-if="chips.length" class="mt-1.5 flex flex-wrap gap-1">
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1 rounded-full bg-surface-gray-2 px-2 py-[3px] text-[10px] font-medium text-ink-gray-7"
      >
        {{ c.label }}
        <button class="text-[11px] leading-none" :aria-label="__('Quitar filtro') + ' ' + c.label" @click="c.remove()">×</button>
      </span>
    </div>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute left-0 z-[100] mt-1.5 w-[268px] overflow-hidden rounded-[10px] border border-outline-gray-2 bg-surface-base"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.14)"
      >
        <div class="scb max-h-[64vh] overflow-y-auto">
          <!-- ── quick filters: the questions people actually ask ───────── -->
          <div class="border-b border-outline-gray-1 px-3 py-2">
            <div class="pb-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-ink-gray-4">
              {{ __('Rápidos') }}
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="q in quickFilters"
                :key="q.id"
                class="rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold"
                :class="q.active ? 'bg-surface-green-2 text-ink-green-8' : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
                :aria-pressed="q.active"
                :title="q.hint"
                @click="q.apply()"
              >
                {{ q.label }}
              </button>
            </div>
          </div>

          <!-- ── period ─────────────────────────────────────────────────── -->
          <div class="border-b border-outline-gray-1 px-3 py-2">
            <div class="pb-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-ink-gray-4">
              {{ __('Última actividad') }}
            </div>
            <div class="mb-1.5 flex flex-wrap gap-1.5">
              <button
                v-for="p in periods"
                :key="p.days"
                class="rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold"
                :class="activePeriod === p.days ? 'bg-surface-green-2 text-ink-green-8' : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
                :aria-pressed="activePeriod === p.days"
                @click="setPeriod(p.days)"
              >
                {{ p.label }}
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="date"
                :value="queueDateFrom"
                :aria-label="__('Desde')"
                class="w-full rounded-md border border-outline-gray-2 bg-surface-base px-1.5 py-1 text-[11px] text-ink-gray-8 focus:outline-none focus:ring-1 focus:ring-outline-gray-3"
                @change="setQueueFilters({ date_from: $event.target.value })"
              />
              <span class="flex-none text-[10px] text-ink-gray-4">→</span>
              <input
                type="date"
                :value="queueDateTo"
                :aria-label="__('Hasta')"
                class="w-full rounded-md border border-outline-gray-2 bg-surface-base px-1.5 py-1 text-[11px] text-ink-gray-8 focus:outline-none focus:ring-1 focus:ring-outline-gray-3"
                @change="setQueueFilters({ date_to: $event.target.value })"
              />
            </div>
          </div>

          <!-- ── drill-down: specific statuses, grouped + collapsed ─────── -->
          <div v-for="s in sections" :key="s.key" class="border-b border-outline-gray-1 last:border-b-0">
            <button
              class="flex w-full items-center gap-1.5 px-3 py-2 text-left"
              :aria-expanded="expanded === s.key"
              @click="expanded = expanded === s.key ? '' : s.key"
            >
              <span class="text-[10px] text-ink-gray-4">{{ expanded === s.key ? '▾' : '▸' }}</span>
              <span class="flex-1 text-[10px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ s.label }}</span>
              <span v-if="s.selected.length" class="rounded-full bg-surface-green-2 px-1.5 text-[10px] font-bold text-ink-green-8">
                {{ s.selected.length }}
              </span>
            </button>
            <div v-if="expanded === s.key" class="px-3 pb-2">
              <template v-for="grp in s.groups" :key="grp.label">
                <div v-if="grp.options.length" class="pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-[.06em] text-ink-gray-4">
                  {{ grp.label }}
                </div>
                <label
                  v-for="o in grp.options"
                  :key="o.value"
                  class="flex cursor-pointer items-center gap-2 py-[3px] text-[12px] text-ink-gray-8"
                >
                  <input
                    type="checkbox"
                    style="accent-color: var(--brand)"
                    :checked="s.selected.includes(o.value)"
                    @change="s.toggle(o.value)"
                  />
                  <span v-if="o.color" class="h-2 w-2 flex-none rounded-full" :style="`background:${o.color}`" />
                  <span class="truncate">{{ o.label }}</span>
                </label>
              </template>
              <div v-if="!s.groups.some((g) => g.options.length)" class="py-1 text-[11px] text-ink-gray-4">
                {{ __('Sin opciones') }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-between border-t border-outline-gray-1 px-3 py-2">
          <button class="text-[11.5px] text-ink-gray-5" @click="clearQueueFilters">{{ __('Limpiar todo') }}</button>
          <button class="text-[11.5px] font-semibold text-ink-green-7" @click="open = false">{{ __('Listo') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LucideSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import {
  queueFilterOptions,
  queueFilterCount,
  queueDealStatus,
  queueLeadStatus,
  queueRepairStatus,
  queueDealState,
  queueLeadState,
  queueDateFrom,
  queueDateTo,
  setQueueFilters,
  clearQueueFilters,
} from '@/composables/inbox'

const open = ref(false)
const expanded = ref('') // which drill-down section is open (one at a time)

const opts = computed(() => queueFilterOptions.data || {})
const closedTypes = computed(() => opts.value.closed_types || ['Won', 'Lost', 'Junk'])
const repairOptions = computed(() => opts.value.repair_statuses || [])
const activeRepair = computed(() => opts.value.active_repair_statuses || [])

// ── quick filters ────────────────────────────────────────────────────────────
// Toggles, not radio buttons: tapping the active one clears it, so "Abiertos"
// never becomes a trap the operator can't get out of.
const quickFilters = computed(() => [
  // Both sides move together: a deal-only state filter would scope the queue to
  // deals and silently drop every lead conversation (server rule) — "Abiertos"
  // must mean open deals AND open leads.
  {
    id: 'open',
    label: __('Abiertos'),
    hint: __('Todo menos Ganados/Perdidos (Completado, Cancelado…)'),
    active: queueDealState.value === 'open',
    apply: () => setState(queueDealState.value === 'open' ? '' : 'open'),
  },
  {
    id: 'closed',
    label: __('Cerrados'),
    hint: __('Completados, cancelados y perdidos'),
    active: queueDealState.value === 'closed',
    apply: () => setState(queueDealState.value === 'closed' ? '' : 'closed'),
  },
  ...(repairOptions.value.length
    ? [
        {
          id: 'in-repair',
          label: __('En reparación'),
          hint: __('Equipos que siguen en el taller'),
          active: sameSet(queueRepairStatus.value, activeRepair.value),
          apply: () =>
            setQueueFilters({
              repair_status: sameSet(queueRepairStatus.value, activeRepair.value) ? [] : [...activeRepair.value],
            }),
        },
        {
          id: 'ready',
          label: __('Listos p/ entregar'),
          hint: __('Reparaciones terminadas esperando al cliente'),
          active: sameSet(queueRepairStatus.value, ['Listo para Entregar']),
          apply: () =>
            setQueueFilters({
              repair_status: sameSet(queueRepairStatus.value, ['Listo para Entregar']) ? [] : ['Listo para Entregar'],
            }),
        },
      ]
    : []),
])

function sameSet(a, b) {
  return a.length > 0 && a.length === b.length && a.every((x) => b.includes(x))
}
function setState(state) {
  setQueueFilters({ deal_state: state, lead_state: state })
}

// ── period presets ───────────────────────────────────────────────────────────
const periods = [
  { days: 0, label: __('Hoy') },
  { days: 7, label: __('7 días') },
  { days: 30, label: __('30 días') },
]
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const activePeriod = computed(() => {
  if (!queueDateFrom.value || queueDateTo.value) return null
  const p = periods.find((x) => ymd(daysAgo(x.days)) === queueDateFrom.value)
  return p ? p.days : null
})
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
function setPeriod(days) {
  const from = ymd(daysAgo(days))
  setQueueFilters({ date_from: queueDateFrom.value === from && !queueDateTo.value ? '' : from, date_to: '' })
}

// ── drill-down sections ──────────────────────────────────────────────────────
// Statuses grouped by the doctype's own `type`, so the hand-pick list reads
// "Abiertos / Ganados / Perdidos" instead of one 22-item scroll.
function groupByType(list) {
  const open_ = [], won = [], lost = []
  for (const s of list || []) {
    const o = { value: s.name, label: s.name, color: s.color }
    if (s.type === 'Won') won.push(o)
    else if (closedTypes.value.includes(s.type)) lost.push(o)
    else open_.push(o)
  }
  return [
    { label: __('Abiertos'), options: open_ },
    { label: __('Ganados'), options: won },
    { label: __('Perdidos / cancelados'), options: lost },
  ]
}
const sections = computed(() => [
  {
    key: 'deal',
    label: __('Estado del trato'),
    selected: queueDealStatus.value,
    groups: groupByType(opts.value.deal_statuses),
    toggle: (v) => setQueueFilters({ deal_status: toggleIn(queueDealStatus.value, v) }),
  },
  {
    key: 'lead',
    label: __('Estado del lead'),
    selected: queueLeadStatus.value,
    groups: groupByType(opts.value.lead_statuses),
    toggle: (v) => setQueueFilters({ lead_status: toggleIn(queueLeadStatus.value, v) }),
  },
  ...(repairOptions.value.length
    ? [
        {
          key: 'repair',
          label: __('Estado de la reparación'),
          selected: queueRepairStatus.value,
          groups: [{ label: __('Reparación'), options: repairOptions.value.map((s) => ({ value: s, label: s })) }],
          toggle: (v) => setQueueFilters({ repair_status: toggleIn(queueRepairStatus.value, v) }),
        },
      ]
    : []),
])
function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

// ── chips ────────────────────────────────────────────────────────────────────
const chips = computed(() => {
  const out = []
  if (queueDealState.value)
    out.push({
      key: 'ds',
      label: queueDealState.value === 'open' ? __('Abiertos') : __('Cerrados'),
      remove: () => setState(''),
    })
  // deal_state and lead_state move as one ("Abiertos") — chip them once, unless a
  // caller set only the lead side.
  if (queueLeadState.value && queueLeadState.value !== queueDealState.value)
    out.push({
      key: 'ls',
      label: queueLeadState.value === 'open' ? __('Leads abiertos') : __('Leads cerrados'),
      remove: () => setQueueFilters({ lead_state: '' }),
    })
  for (const v of queueDealStatus.value)
    out.push({ key: `d:${v}`, label: v, remove: () => setQueueFilters({ deal_status: toggleIn(queueDealStatus.value, v) }) })
  for (const v of queueLeadStatus.value)
    out.push({ key: `l:${v}`, label: v, remove: () => setQueueFilters({ lead_status: toggleIn(queueLeadStatus.value, v) }) })
  // A repair quick-filter is many statuses at once — chip it as ONE named chip
  // instead of five, which is what it means to the operator.
  if (sameSet(queueRepairStatus.value, activeRepair.value))
    out.push({ key: 'r:active', label: '🔧 ' + __('En reparación'), remove: () => setQueueFilters({ repair_status: [] }) })
  else
    for (const v of queueRepairStatus.value)
      out.push({ key: `r:${v}`, label: `🔧 ${v}`, remove: () => setQueueFilters({ repair_status: toggleIn(queueRepairStatus.value, v) }) })
  if (queueDateFrom.value)
    out.push({ key: 'from', label: `≥ ${queueDateFrom.value}`, remove: () => setQueueFilters({ date_from: '' }) })
  if (queueDateTo.value)
    out.push({ key: 'to', label: `≤ ${queueDateTo.value}`, remove: () => setQueueFilters({ date_to: '' }) })
  return out
})
</script>
