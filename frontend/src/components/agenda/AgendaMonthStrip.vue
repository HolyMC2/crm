<template>
  <div
    ref="strip"
    class="ag-strip"
    role="listbox"
    :aria-label="__('Choose a month')"
    data-no-swipe
  >
    <template v-for="entry in entries" :key="entry.key">
      <span v-if="entry.year" class="ag-strip__year" aria-hidden="true">{{
        entry.year
      }}</span>
      <button
        v-else
        type="button"
        role="option"
        class="ag-strip__month"
        :class="{
          'is-selected': entry.month === selectedMonth,
          'is-current': entry.month === todayMonth,
        }"
        :aria-selected="entry.month === selectedMonth"
        :aria-label="entry.long"
        :data-month="entry.month"
        @click="emit('pick', entry.month)"
      >
        {{ entry.short }}
      </button>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

// Month view on a phone: the title opens a strip of months (a year back, two ahead) with
// the year between December and January; the chosen month sits in the middle.
const props = defineProps({
  selected: { type: String, required: true },
  today: { type: String, required: true },
  locale: { type: String, default: undefined },
})
const emit = defineEmits(['pick'])
const strip = ref(null)

const selectedMonth = computed(() => props.selected.slice(0, 7))
const todayMonth = computed(() => props.today.slice(0, 7))
const fmt = (options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' })
const shortFmt = computed(() => fmt({ month: 'short' }))
const longFmt = computed(() => fmt({ month: 'long', year: 'numeric' }))

function monthsAround(month, before = 12, after = 24) {
  const [y, m] = month.split('-').map(Number)
  const rows = []
  for (let offset = -before; offset <= after; offset++) {
    const value = new Date(Date.UTC(y, m - 1 + offset, 1, 12))
    rows.push(value.toISOString().slice(0, 7))
  }
  return rows
}

const entries = computed(() => {
  const rows = []
  const year = todayMonth.value.slice(0, 4)
  for (const month of monthsAround(selectedMonth.value)) {
    if (month.endsWith('-01') && month.slice(0, 4) !== year)
      rows.push({ key: `y-${month}`, year: month.slice(0, 4) })
    const date = new Date(`${month}-01T12:00:00Z`)
    rows.push({
      key: month,
      month,
      short: shortFmt.value.format(date).replace('.', ''),
      long: longFmt.value.format(date),
    })
  }
  return rows
})

function center(smooth = false) {
  const host = strip.value
  const chip = host?.querySelector(`[data-month="${selectedMonth.value}"]`)
  if (!host || !chip) return
  const left = chip.offsetLeft - (host.clientWidth - chip.clientWidth) / 2
  host.scrollTo({
    left: Math.max(0, left),
    behavior: smooth ? 'smooth' : 'auto',
  })
}
onMounted(() => nextTick(() => center(false)))
watch(selectedMonth, () => nextTick(() => center(true)))
</script>
<style scoped>
.ag-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 10px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.ag-strip::-webkit-scrollbar {
  display: none;
}
.ag-strip__month {
  flex: none;
  min-width: 64px;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--surface-gray-2);
  color: var(--ink-gray-8);
  font-size: 15px;
  scroll-snap-align: center;
  transition:
    background 0.18s,
    color 0.18s,
    transform 0.12s;
}
.ag-strip__month:active {
  transform: scale(0.94);
}
.ag-strip__month.is-current {
  color: var(--ag-accent-ink);
  font-weight: 600;
}
.ag-strip__month.is-selected {
  background: var(--ag-select-strong);
  color: var(--ag-accent-ink);
  font-weight: 600;
}
.ag-strip__year {
  flex: none;
  padding: 0 4px;
  font-size: 15px;
  font-weight: 500;
  color: var(--ink-gray-6);
}
</style>
