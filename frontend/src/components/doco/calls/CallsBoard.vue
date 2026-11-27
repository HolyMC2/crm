<template>
  <!-- The calls page's board (crm.api.calls.board): pickup against the goal,
       the missed calls by open or closed and what happened to them, when the
       calls come in by hour, each week's pickup, and (managers) who took them.
       A tile narrows the list below to its calls. -->
  <section
    class="flex flex-col gap-3"
    :aria-label="__('Seguimiento de llamadas')"
    data-calls-board
  >
    <Segmented
      class="self-start"
      :model-value="days"
      :options="periods"
      fit="content"
      :label="__('Periodo')"
      @update:model-value="(v) => emit('update:days', v)"
    />
    <p v-if="error" role="alert" class="text-sm text-ink-red-7">{{ error }}</p>
    <KpiGrid v-if="board">
      <KpiTile
        :label="__('Contestadas')"
        :value="pickup.value"
        :hint="pickup.hint"
        :tone="pickup.tone"
        data-tile="pickup"
      />
      <KpiTile
        :label="__('Perdidas en horario')"
        :value="t.missed_open || 0"
        :hint="
          board.hours_configured
            ? ''
            : __('Sin horario: son todas las perdidas')
        "
        :pressed="focus === 'missed_open'"
        data-tile="missed_open"
        @click="toggle('missed_open')"
      />
      <KpiTile
        v-if="board.hours_configured || t.missed_closed"
        :label="__('Fuera de horario')"
        :value="t.missed_closed || 0"
        :hint="t.messages ? __('{0} dejaron recado', [t.messages]) : ''"
        :pressed="focus === 'closed'"
        data-tile="closed"
        @click="toggle('closed')"
      />
      <KpiTile
        :label="__('Sin devolver')"
        :value="t.waiting_numbers || 0"
        :hint="onTimeHint"
        :tone="t.waiting_numbers ? 'danger' : 'neutral'"
        :pressed="focus === 'waiting'"
        data-tile="waiting"
        @click="toggle('waiting')"
      />
    </KpiGrid>
    <button
      v-if="board && !board.hours_configured && canSetUp"
      type="button"
      class="press self-start rounded-full bg-surface-gray-2 px-4 py-2 text-sm font-medium text-ink-gray-8"
      data-set-hours
      @click="emit('settings')"
    >
      {{ __('Poner el horario de la tienda') }}
    </button>

    <div v-if="hours.length" class="flex flex-col gap-1" data-hour-bars>
      <div
        class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
      >
        <span class="whitespace-nowrap text-sm font-medium text-ink-gray-8">{{
          __('Cuándo llaman')
        }}</span>
        <span
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muelle-on-surface-variant)]"
        >
          <span class="flex items-center gap-1"
            ><span
              class="size-2 rounded-full bg-surface-gray-7"
              aria-hidden="true"
            />{{ __('Contestadas') }}</span
          >
          <span class="flex items-center gap-1"
            ><span
              class="size-2 rounded-full bg-surface-red-5"
              aria-hidden="true"
            />{{ __('Perdidas') }}</span
          >
          <span v-if="board.hours_configured" class="flex items-center gap-1"
            ><span
              class="size-2 rounded-full bg-surface-gray-3"
              aria-hidden="true"
            />{{ __('Cerrado') }}</span
          >
        </span>
      </div>
      <div
        class="flex h-20 items-end gap-px"
        role="img"
        :aria-label="hoursSummary"
      >
        <div
          v-for="bar in hours"
          :key="bar.hour"
          class="flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-4"
          :class="bar.open === false ? 'bg-surface-gray-2' : ''"
          :title="
            __('{0} h: {1} contestadas, {2} perdidas', [
              bar.label,
              bar.answered,
              bar.missed,
            ])
          "
          :data-hour="bar.hour"
        >
          <span
            v-if="bar.missed"
            class="block rounded-t-4 bg-surface-red-5"
            :style="{ height: `${bar.missedPct}%` }"
          />
          <span
            v-if="bar.answered"
            class="block bg-surface-gray-7"
            :class="bar.missed ? '' : 'rounded-t-4'"
            :style="{ height: `${bar.answeredPct}%` }"
          />
        </div>
      </div>
      <div class="flex gap-px" aria-hidden="true">
        <span
          v-for="bar in hours"
          :key="bar.hour"
          class="num min-w-0 flex-1 text-center text-[10px] text-[var(--muelle-on-surface-variant)]"
          >{{ bar.hour % 3 === 0 ? bar.label : '' }}</span
        >
      </div>
    </div>

    <div v-if="weeks.length > 1" class="flex flex-col gap-1" data-week-bars>
      <span class="text-sm font-medium text-ink-gray-8">{{
        __('Contestadas por semana')
      }}</span>
      <div class="flex items-end gap-2 overflow-x-auto pb-1">
        <div
          v-for="w in weeks"
          :key="w.start"
          class="flex w-12 flex-none flex-col items-center gap-1"
          :title="__('{0} de {1} contestadas', [w.answered, w.incoming])"
        >
          <span class="num text-xs" :class="weekTone(w)">{{
            w.pct === null ? '—' : `${w.pct} %`
          }}</span>
          <span
            class="flex h-12 w-6 flex-col justify-end rounded-4 bg-surface-gray-2"
          >
            <span
              class="block rounded-4"
              :class="weekFill(w)"
              :style="{ height: `${w.pct || 0}%` }"
            />
          </span>
          <span
            class="num text-[10px] text-[var(--muelle-on-surface-variant)]"
            >{{ w.label }}</span
          >
        </div>
      </div>
    </div>

    <ul
      v-if="board?.people?.length"
      class="flex flex-col divide-y divide-outline-gray-1 rounded-7 bg-surface-gray-1 px-4"
      data-call-people
    >
      <li
        v-for="p in board.people"
        :key="p.user"
        class="flex items-center justify-between gap-3 py-2"
      >
        <span class="min-w-0 truncate text-sm text-ink-gray-8">{{
          p.name
        }}</span>
        <span
          class="num flex-none text-sm text-[var(--muelle-on-surface-variant)]"
          >{{ __('contestó {0} · llamó {1}', [p.answered, p.made]) }}</span
        >
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { KpiGrid, KpiTile, Segmented } from '@/components/ui'
import { PERIODS, hourBars, pickupTile, weekBars } from './board'

const props = defineProps({
  board: { type: Object, default: null },
  days: { type: Number, default: 30 },
  focus: { type: String, default: '' },
  error: { type: String, default: '' },
  canSetUp: { type: Boolean, default: false },
})
const emit = defineEmits(['update:days', 'update:focus', 'settings'])

const periods = PERIODS.map((d) => ({ value: d, label: __('{0} días', [d]) }))
const t = computed(() => props.board?.totals || {})
const pickup = computed(() => pickupTile(props.board))
const hours = computed(() => hourBars(props.board?.by_hour || []))
const weeks = computed(() => weekBars(props.board?.weeks || []))
const goal = computed(() => Number(props.board?.goals?.pickup_goal) || 0)
const onTimeHint = computed(() =>
  t.value.on_time_pct === null || t.value.on_time_pct === undefined
    ? ''
    : __('{0} % atendidas a tiempo', [t.value.on_time_pct]),
)
const hoursSummary = computed(() => {
  const busiest = [...hours.value].sort((a, b) => b.missed - a.missed)[0]
  return busiest?.missed
    ? __('Llamadas por hora; más perdidas a las {0} h', [busiest.label])
    : __('Llamadas por hora')
})

function toggle(key) {
  emit('update:focus', props.focus === key ? '' : key)
}
const weekTone = (w) =>
  w.pct !== null && goal.value && w.pct < goal.value
    ? 'text-ink-red-7'
    : 'text-ink-gray-8'
const weekFill = (w) =>
  w.pct !== null && goal.value && w.pct < goal.value
    ? 'bg-surface-red-5'
    : 'bg-surface-gray-7'
</script>
