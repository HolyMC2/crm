<!--
  The next scheduled activity of a lead or deal, as one chip.

  Fed by the denormalised `next_activity_*` fields (the earliest open CRM Task on
  the record), so a row or a board card can show and colour it without an N+1
  query per card. Colour is the whole point: red = vencida, ámbar = hoy, gris =
  planeada. Without a date there is nothing to act on, so it degrades to muted
  text instead of an empty cell.

  `compact` drops the task title and keeps icon + due label — for board cards and
  phone rows, where the line is already full.
-->
<template>
  <span v-if="state === 'none'" class="truncate text-[11px] text-ink-gray-4">{{
    emptyLabel
  }}</span>
  <span
    v-else
    class="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-semibold"
    :class="TONE[state]"
    :title="tooltip"
  >
    <component :is="icon" class="h-3 w-3 flex-none" aria-hidden="true" />
    <span class="flex-none">{{ label }}</span>
    <span v-if="!compact && title" class="truncate font-medium opacity-90"
      >· {{ title }}</span
    >
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { nextStepDisplay } from '@/utils/activityState'
import LucideSquareCheck from '~icons/lucide/square-check'
import LucidePhone from '~icons/lucide/phone'
import LucideMessageCircle from '~icons/lucide/message-circle'
import LucideMail from '~icons/lucide/mail'
import LucideCalendar from '~icons/lucide/calendar'

const props = defineProps({
  at: { type: String, default: '' },
  title: { type: String, default: '' },
  type: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  // the server's verdict (`_v_next_step.overdue`, site clock); null = not sent,
  // the chip then works it out from `at` and the browser clock
  overdue: { type: Boolean, default: null },
  // site-calendar days from today to `at` (negative when late), with `overdue`
  days: { type: Number, default: null },
  emptyLabel: { type: String, default: () => __('Sin actividad') },
})

// ink/surface tokens, so the chip stays legible in both themes (the fixed hexes
// used elsewhere in these pages wash out on the dark UI).
const TONE = {
  overdue: 'bg-surface-red-1 text-ink-red-8',
  today: 'bg-surface-amber-1 text-ink-amber-9',
  planned: 'bg-surface-gray-2 text-ink-gray-7',
}

// CRM Task.activity_type values; anything else is a plain task.
const ICONS = {
  Call: LucidePhone,
  WhatsApp: LucideMessageCircle,
  Email: LucideMail,
  Meeting: LucideCalendar,
  Task: LucideSquareCheck,
}

const display = computed(() =>
  nextStepDisplay(props.at, { overdue: props.overdue, days: props.days }),
)
const state = computed(() => display.value.state)
const label = computed(() => display.value.label)
const icon = computed(() => ICONS[props.type] || LucideSquareCheck)
const tooltip = computed(() =>
  [props.title, props.type, props.at].filter(Boolean).join(' · '),
)
</script>
