<template>
  <!-- An es-MX date (and/or 24-hour time): type dd/mm/aaaa, tap Hoy · Mañana ·
       En una semana, or open the month. Never the browser's US mm/dd/yyyy. -->
  <div class="date-field flex flex-col gap-2" data-ui-date-field>
    <div v-if="mode !== 'time'" class="flex items-center gap-2">
      <input
        :id="id"
        :value="typed"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="dd/mm/aaaa"
        class="h-11 min-w-0 flex-1 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base tabular-nums text-ink-gray-9"
        :aria-label="label"
        :aria-invalid="bad ? 'true' : undefined"
        @input="typed = $event.target.value"
        @change="commitTyped"
        @keydown.enter.prevent="commitTyped"
      />
      <button
        type="button"
        class="flex size-11 flex-none items-center justify-center rounded-lg border border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="open ? 'Cerrar calendario' : 'Abrir calendario'"
        :aria-expanded="open"
        @click="toggle"
      >
        <span class="lucide-calendar size-5" aria-hidden="true" />
      </button>
    </div>
    <p v-if="bad" role="alert" class="text-sm text-ink-red-7">
      Escribe la fecha como día/mes/año, por ejemplo 18/10/2026.
    </p>
    <p v-else-if="words" class="text-sm text-ink-gray-7">{{ words }}</p>

    <div v-if="mode !== 'time'" class="flex flex-wrap gap-2">
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="min-h-11 rounded-full border border-outline-gray-2 px-4 text-base text-ink-gray-8 hover:bg-surface-gray-2"
        :aria-pressed="date === chip.value"
        :class="date === chip.value ? 'bg-surface-gray-2 font-medium' : ''"
        @click="pick(chip.value)"
      >
        {{ chip.label }}
      </button>
      <button
        v-if="!required && date"
        type="button"
        class="min-h-11 px-2 text-base text-ink-gray-7 underline"
        @click="pick('')"
      >
        Quitar
      </button>
    </div>

    <div
      v-if="open && mode !== 'time'"
      class="date-month rounded-xl border border-outline-gray-1 p-2"
      role="group"
      :aria-label="`${monthName} de ${view.y}`"
    >
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Mes anterior"
          @click="shift(-1)"
        >
          <span class="lucide-chevron-left size-5" aria-hidden="true" />
        </button>
        <span class="text-base-medium text-ink-gray-9"
          >{{ monthName }} {{ view.y }}</span
        >
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Mes siguiente"
          @click="shift(1)"
        >
          <span class="lucide-chevron-right size-5" aria-hidden="true" />
        </button>
      </div>
      <div
        class="date-grid text-center text-sm text-ink-gray-6"
        aria-hidden="true"
      >
        <span v-for="(w, i) in WEEKDAYS" :key="i" class="py-1">{{ w }}</span>
      </div>
      <div v-for="(week, wi) in weeks" :key="wi" class="date-grid">
        <template v-for="(day, di) in week" :key="di">
          <button
            v-if="day"
            type="button"
            class="date-day rounded-full text-base tabular-nums text-ink-gray-9 hover:bg-surface-gray-2"
            :class="{ 'is-picked': day === date, 'is-today': day === today }"
            :aria-pressed="day === date"
            :aria-label="dayLabel(day)"
            @click="pick(day, true)"
          >
            {{ Number(day.slice(8)) }}
          </button>
          <span v-else />
        </template>
      </div>
    </div>

    <div v-if="mode !== 'date'" class="flex items-center gap-2">
      <input
        :id="mode === 'time' ? id : undefined"
        :value="typedTime"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="hh:mm"
        class="h-11 w-28 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base tabular-nums text-ink-gray-9"
        :aria-label="mode === 'time' ? label : `${label}: hora`"
        :aria-invalid="badTime ? 'true' : undefined"
        @input="typedTime = $event.target.value"
        @change="commitTime"
        @keydown.enter.prevent="commitTime"
      />
      <span class="text-sm text-ink-gray-7">{{
        badTime ? 'Hora de 00:00 a 23:59' : '24 horas'
      }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import {
  MONTHS,
  WEEKDAYS,
  addDays,
  inWords,
  joinValue,
  monthGrid,
  parseTime,
  parseTyped,
  splitIso,
  timeOf,
  toTyped,
} from './dateField'

const props = defineProps({
  /** Frappe's stored form: «2026-10-18», «2026-10-18 14:30:00» or «14:30:00». */
  modelValue: { type: String, default: '' },
  /** 'date' (Date), 'datetime' (Datetime) or 'time' (Time). */
  mode: { type: String, default: 'date' },
  id: { type: String, default: undefined },
  label: { type: String, default: '' },
  /** A required date offers no «Quitar». */
  required: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const today = addDays(0)
const date = computed(() =>
  props.mode === 'time'
    ? ''
    : splitIso(props.modelValue)
      ? props.modelValue.slice(0, 10)
      : '',
)
const time = computed(() => timeOf(props.modelValue))
const typed = ref(toTyped(props.modelValue))
const typedTime = ref(time.value)
const bad = ref(false)
const badTime = ref(false)
const open = ref(false)
const start = splitIso(props.modelValue) || splitIso(today)
const view = ref({ y: start.y, m: start.m })

watch(
  () => props.modelValue,
  (value) => {
    typed.value = toTyped(value)
    typedTime.value = timeOf(value)
    bad.value = false
    badTime.value = false
  },
)

// A line of its own starts with a capital («Hoy», «Sábado 24 de octubre»).
const words = computed(() => {
  const text = date.value ? inWords(date.value) : ''
  return text ? text[0].toUpperCase() + text.slice(1) : ''
})
const chips = [
  { label: 'Hoy', value: today },
  { label: 'Mañana', value: addDays(1) },
  { label: 'En una semana', value: addDays(7) },
]
const monthName = computed(() => {
  const name = MONTHS[view.value.m - 1]
  return name.charAt(0).toUpperCase() + name.slice(1)
})
const weeks = computed(() => monthGrid(view.value.y, view.value.m))

function emitValue(d, t) {
  emit('update:modelValue', joinValue(props.mode, d, t))
}
function pick(value, close = false) {
  bad.value = false
  emitValue(value, time.value)
  if (value) {
    const p = splitIso(value)
    view.value = { y: p.y, m: p.m }
  }
  if (close) open.value = false
}
function commitTyped() {
  const iso = parseTyped(typed.value)
  if (iso === null) {
    bad.value = true
    return
  }
  pick(iso)
}
function commitTime() {
  const t = parseTime(typedTime.value)
  if (t === null) {
    badTime.value = true
    return
  }
  badTime.value = false
  emitValue(date.value || (props.mode === 'datetime' ? today : ''), t)
}
function toggle() {
  open.value = !open.value
}
function shift(step) {
  let { y, m } = view.value
  m += step
  if (m < 1) [y, m] = [y - 1, 12]
  if (m > 12) [y, m] = [y + 1, 1]
  view.value = { y, m }
}
function dayLabel(day) {
  const p = splitIso(day)
  return `${p.d} de ${MONTHS[p.m - 1]} de ${p.y}`
}
</script>
<style scoped>
/* scoped: the picker's grid stays out of the global stylesheet */
.date-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.date-day {
  min-height: 2.5rem;
  margin: 1px;
}
.date-day.is-today {
  box-shadow: inset 0 0 0 1px var(--outline-gray-3, currentColor);
}
.date-day.is-picked {
  background: var(--ink-gray-9, #222);
  color: var(--surface-base, #fff);
  font-weight: 600;
}
</style>
