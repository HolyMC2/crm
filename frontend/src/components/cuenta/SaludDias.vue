<template>
  <!-- One bar per day of the window, oldest first, today at the right. A day
       with data is a full bar in its state's colour (green fine, amber
       slow, red with a failure); a day without data is a short hollow bar, so
       the state never rests on colour alone. The words are the strip's label,
       each bar's title and the legend under it. -->
  <span class="block">
    <span
      class="flex items-end gap-0.5"
      :class="large ? 'h-10' : 'h-7'"
      role="img"
      :aria-label="summary"
      data-testid="salud-dias"
    >
      <span
        v-for="day in days"
        :key="day.day"
        class="min-w-0 flex-1 rounded-sm"
        :class="BAR[day.state] || BAR.none"
        :title="day.label"
        :data-state="day.state"
      />
    </span>
    <span
      class="mt-1 flex justify-between gap-3 text-xs text-ink-gray-6"
      aria-hidden="true"
    >
      <span>{{ first }}</span>
      <span>{{ __('Today', null, 'Cuenta') }}</span>
    </span>
  </span>
</template>
<script setup>
defineProps({
  /** salud.dayRows: [{day, state, label}], oldest first. */
  days: { type: Array, default: () => [] },
  /** The first day's short date («14 oct»). */
  first: { type: String, default: '' },
  /** The strip in words (salud.daysSummary), for screen readers. */
  summary: { type: String, default: '' },
  /** The sheet's taller strip. */
  large: { type: Boolean, default: false },
})

// Literal classes (a class built at runtime is never generated). The steps
// pass the dataviz checks against the page in each theme: light green-6,
// amber-6, red-6; dark green-9, amber-9, red-8.
const BAR = {
  ok: 'h-full bg-surface-green-6 dark:bg-surface-green-9',
  slow: 'h-full bg-surface-amber-6 dark:bg-surface-amber-9',
  down: 'h-full bg-surface-red-6 dark:bg-surface-red-8',
  none: 'h-1/3 border border-outline-gray-3',
}
</script>
