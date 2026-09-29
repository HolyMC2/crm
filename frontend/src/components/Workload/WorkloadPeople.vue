<template>
  <section aria-labelledby="workload-people-title">
    <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="workload-people-title" class="text-base font-semibold">
        {{ __('Personas')
        }}<template v-if="!loading"> · {{ totalAgents }}</template>
      </h2>
      <p class="text-xs text-ink-gray-5">
        {{ __('Primero quien está sobre capacidad o tiene tareas vencidas') }}
      </p>
    </div>

    <div
      v-if="loading"
      class="space-y-2"
      aria-hidden="true"
      data-testid="people-skeleton"
    >
      <div
        v-for="n in 4"
        :key="n"
        class="h-14 animate-pulse rounded-lg bg-surface-gray-2"
      />
    </div>

    <p
      v-else-if="!rows.length"
      class="rounded-lg border border-dashed border-outline-gray-2 p-4 text-sm text-ink-gray-6"
    >
      {{ __('Nadie en la rotación') }}
    </p>

    <div v-else class="overflow-hidden rounded-lg border border-outline-gray-2">
      <div
        class="hidden gap-3 border-b border-outline-gray-2 bg-surface-gray-1 px-3 py-2 text-xs font-medium text-ink-gray-6 md:grid"
        :class="gridClass"
        aria-hidden="true"
      >
        <span>{{ __('Persona') }}</span>
        <span class="text-right">{{ __('Abiertos') }}</span>
        <span class="text-right">{{ __('Vencidas') }}</span>
        <span class="text-right">{{ __('Vencen hoy') }}</span>
        <span class="text-right">{{ __('Tareas') }}</span>
        <span>{{ __('Capacidad') }}</span>
      </div>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in rows"
          :key="row.key"
          class="grid grid-cols-4 gap-x-2 gap-y-2 px-3 py-3 md:items-center md:py-2"
          :class="[
            gridClass,
            activeOwner === row.user ? 'bg-surface-gray-2' : 'bg-surface-base',
          ]"
          :data-person="row.user"
        >
          <div class="order-1 col-span-4 min-w-0 md:order-none md:col-span-1">
            <button
              type="button"
              class="min-h-9 max-w-full truncate text-left text-sm font-medium text-ink-gray-9 hover:underline"
              :aria-pressed="activeOwner === row.user && activeBucket === 'all'"
              :disabled="busy"
              @click="$emit('open', row.user, 'all', 'keep')"
            >
              {{ row.label }}
            </button>
            <div class="flex flex-wrap items-center gap-x-2 text-xs">
              <span
                v-if="riskText(row.risk)"
                class="rounded px-1.5 py-0.5"
                :class="riskClass(row.risk)"
                >{{ riskText(row.risk) }}</span
              >
              <span
                v-if="row.shift"
                class="text-ink-gray-5"
                :title="__(row.shiftReason || '')"
                >{{ shiftLabel(row.shift) }}</span
              >
            </div>
          </div>

          <button
            v-for="stat in stats(row)"
            :key="stat.key"
            type="button"
            class="order-3 flex min-h-11 flex-col items-start rounded-md px-2 py-1 text-left hover:bg-surface-gray-2 disabled:opacity-60 md:order-none md:min-h-9 md:items-end md:text-right"
            :class="
              activeOwner === row.user && activeBucket === stat.bucket
                ? 'ring-1 ring-outline-gray-3'
                : ''
            "
            :aria-label="`${row.label}: ${stat.label} ${stat.text}`"
            :disabled="busy || !stat.bucket"
            @click="$emit('open', row.user, stat.bucket, stat.kind)"
          >
            <span class="text-xs text-ink-gray-5 md:sr-only">{{
              stat.label
            }}</span>
            <span class="text-sm font-medium tabular-nums" :class="stat.tone">{{
              stat.text
            }}</span>
          </button>

          <div
            class="order-2 col-span-4 flex items-center gap-2 md:order-none md:col-span-1"
          >
            <template v-if="cap && row.user !== ''">
              <div
                class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-gray-3"
                role="meter"
                :aria-valuenow="row.open"
                aria-valuemin="0"
                :aria-valuemax="cap"
                :aria-label="__('Capacidad')"
              >
                <div
                  class="h-full rounded-full"
                  :class="[barToken(row.open, cap), widthClass(row.open)]"
                />
              </div>
              <span class="w-14 text-right text-xs tabular-nums text-ink-gray-6"
                >{{ row.open }}/{{ cap }}</span
              >
            </template>
            <span v-else class="text-xs text-ink-gray-5">{{
              row.user === '' ? __('Sin responsable') : __('Sin límite')
            }}</span>
          </div>
        </li>
      </ul>
    </div>

    <p
      v-if="dueToday.state === 'partial' || dueToday.state === 'error'"
      class="mt-2 text-xs text-ink-gray-5"
    >
      {{
        dueToday.state === 'partial'
          ? __(
              '«Vencen hoy» es parcial: hay más tareas de hoy de las que revisamos.',
            )
          : __(
              'No se pudo calcular «Vencen hoy». El resto de los conteos es exacto.',
            )
      }}
    </p>

    <div v-if="agentOffset || hasMore" class="mt-2 flex gap-2">
      <button
        type="button"
        class="wl-btn"
        :disabled="!agentOffset || busy"
        @click="$emit('page', -1)"
      >
        {{ __('Personas anteriores') }}
      </button>
      <button
        type="button"
        class="wl-btn"
        :disabled="!hasMore || busy"
        @click="$emit('page', 1)"
      >
        {{ __('Más personas') }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import {
  barToken,
  barWidth,
  riskLevel,
  sortByRisk,
} from '@/utils/workloadFormat'

const props = defineProps({
  agents: { type: Array, default: () => [] },
  unassigned: { type: Object, default: null },
  cap: { type: Number, default: 0 },
  dueToday: { type: Object, default: () => ({ state: 'idle', counts: {} }) },
  totalAgents: { type: Number, default: 0 },
  hasMore: { type: Boolean, default: false },
  agentOffset: { type: Number, default: 0 },
  activeOwner: { type: String, default: null },
  activeBucket: { type: String, default: 'all' },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
defineEmits(['open', 'page'])

const gridClass =
  'md:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_5rem_minmax(8rem,12rem)]'

const rows = computed(() => {
  const list = sortByRisk(props.agents, props.cap).map((agent) => ({
    key: `u:${agent.user}`,
    user: agent.user,
    label: agent.full_name || agent.user,
    open: Number(agent.open_total) || 0,
    overdue: Number(agent.overdue_tasks) || 0,
    tasks: Number(agent.open_tasks) || 0,
    risk: riskLevel(agent, props.cap),
    shift: agent.shift,
    shiftReason: agent.shift_reason,
  }))
  const u = props.unassigned || {}
  const open = (Number(u.open_leads) || 0) + (Number(u.open_deals) || 0)
  const tasks = Number(u.open_tasks) || 0
  if (open || tasks) {
    const overdue = Number(u.overdue_tasks) || 0
    list.unshift({
      key: 'unassigned',
      user: '',
      label: __('Sin asignar'),
      open,
      overdue,
      tasks,
      risk: open || overdue ? 'unassigned' : 'none',
    })
  }
  return list
})

// Tailwind needs literal class names; snap the bar to 5 % steps.
const WIDTHS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
]
function widthClass(load) {
  return WIDTHS[Math.round(barWidth(load, props.cap) / 5)]
}

function todayText(user) {
  const state = props.dueToday.state
  if (state === 'loading') return '…'
  if (state !== 'ready' && state !== 'partial') return '—'
  const count = props.dueToday.counts?.[user] || 0
  return state === 'partial' && count ? `${count}+` : String(count)
}

function stats(row) {
  return [
    {
      key: 'open',
      label: __('Abiertos'),
      text: String(row.open),
      bucket: 'all',
      tone: 'text-ink-gray-8',
    },
    {
      key: 'overdue',
      label: __('Vencidas'),
      text: String(row.overdue),
      bucket: 'overdue',
      tone: row.overdue ? 'text-ink-red-6' : 'text-ink-gray-5',
    },
    {
      key: 'today',
      label: __('Vencen hoy'),
      text: todayText(row.user),
      bucket: 'today',
      tone:
        props.dueToday.counts?.[row.user] > 0
          ? 'text-ink-amber-7'
          : 'text-ink-gray-5',
    },
    {
      key: 'tasks',
      label: __('Tareas'),
      text: String(row.tasks),
      bucket: 'all',
      kind: 'tasks',
      tone: 'text-ink-gray-6',
    },
  ]
}

function riskText(risk) {
  return {
    over: __('Sobre capacidad'),
    behind: __('Con atrasos'),
    near: __('Cerca del límite'),
    unassigned: __('Sin responsable'),
  }[risk]
}
function riskClass(risk) {
  return {
    over: 'bg-surface-red-2 text-ink-red-7',
    behind: 'bg-surface-amber-2 text-ink-amber-8',
    near: 'bg-surface-gray-2 text-ink-gray-7',
    unassigned: 'bg-surface-gray-2 text-ink-gray-7',
  }[risk]
}
function shiftLabel(value) {
  return value === 'on_shift'
    ? __('En turno')
    : value === 'off_shift'
      ? __('Fuera de turno')
      : __('Turno desconocido')
}
</script>

<style scoped>
.wl-btn {
  @apply min-h-9 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50;
}
</style>
