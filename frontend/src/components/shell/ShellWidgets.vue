<!-- Today's widgets, opened from the top bar's clock the way a Mac's clock
     opens its widgets: the agenda, the day's sales (for whom the shop shows
     its money) and the pendientes, each one tap from its module. They read
     Hoy's one call (crm.api.hoy.page), so they say what Hoy says. -->
<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-x-0 bottom-0 top-9 z-40">
      <div class="absolute inset-0" aria-hidden="true" @click="close" />
      <section
        ref="panel"
        role="dialog"
        :aria-label="__('Today')"
        tabindex="-1"
        class="absolute right-2 top-1.5 flex max-h-[calc(100%-1rem)] w-[360px] max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-y-auto rounded-8 bg-surface-base p-2 text-ink-gray-9 shadow-xl outline-none"
        data-testid="shell-widgets"
        @keydown.esc="close"
      >
        <h2 class="title-face px-3 pb-1 pt-2 text-xl font-semibold">
          {{ dayLong }}
        </h2>
        <template v-if="!day && !failed">
          <div
            v-for="n in 3"
            :key="n"
            class="h-28 animate-pulse rounded-7 bg-surface-gray-1"
            aria-hidden="true"
          />
        </template>
        <div
          v-else-if="!day"
          class="flex items-center gap-2 rounded-7 bg-surface-gray-1 p-4 text-sm"
          role="alert"
        >
          <span class="flex-1">{{ __('We could not read your day.') }}</span>
          <Button :label="__('Retry')" @click="read" />
        </div>
        <template v-else>
          <!-- Agenda: what is on now and next; the earlier ones are done. -->
          <RouterLink
            v-if="agenda"
            :to="agenda.to"
            class="state-layer block rounded-7 bg-surface-gray-1 p-4"
            data-widget="agenda"
            @click="close"
          >
            <span class="flex items-center gap-2 text-sm text-ink-gray-7">
              <span class="lucide-calendar size-4" aria-hidden="true" />
              {{ __('Today’s agenda') }}
            </span>
            <ul v-if="agenda.rows.length" class="mt-2 space-y-1.5">
              <li
                v-for="event in agenda.rows"
                :key="event.source + event.id"
                class="flex items-baseline gap-3"
              >
                <span class="num w-12 flex-none text-sm text-ink-gray-7">{{
                  event.allDay ? __('All day') : eventTime(event.start)
                }}</span>
                <span class="min-w-0 flex-1 truncate text-base">{{
                  event.title
                }}</span>
                <span
                  v-if="event.state === 'now'"
                  class="flex-none rounded-full bg-[var(--muelle-secondary-container)] px-2 text-xs font-medium text-[var(--muelle-on-secondary-container)]"
                  >{{ __('Now') }}</span
                >
              </li>
            </ul>
            <p v-else class="mt-2 text-base text-ink-gray-7">
              {{ __('Nothing on your agenda for today.') }}
            </p>
            <p v-if="agenda.more" class="mt-1.5 text-sm text-ink-gray-6">
              {{ __('{0} more', [agenda.more]) }}
            </p>
          </RouterLink>
          <!-- The day's sales: what the tills charged so far. -->
          <component
            :is="sales.to ? RouterLink : 'div'"
            v-if="sales"
            :to="sales.to || undefined"
            class="block rounded-7 bg-surface-gray-1 p-4"
            :class="sales.to ? 'state-layer' : ''"
            data-widget="ventas"
            @click="close"
          >
            <span class="flex items-center gap-2 text-sm text-ink-gray-7">
              <span class="lucide-chart-column size-4" aria-hidden="true" />
              {{ __('Today’s sales') }}
            </span>
            <span class="num mt-1 block text-3xl font-semibold">{{
              sales.total
            }}</span>
            <span
              v-if="sales.facts.length || sales.yesterday"
              class="mt-0.5 block text-sm text-ink-gray-7"
              >{{
                [...sales.facts, sales.yesterday].filter(Boolean).join(', ')
              }}</span
            >
          </component>
          <!-- Pendientes: overdue first, then today's; the count turns red while any is late. -->
          <RouterLink
            v-if="tasks"
            to="/pendientes"
            class="state-layer block rounded-7 bg-surface-gray-1 p-4"
            data-widget="pendientes"
            @click="close"
          >
            <span class="flex items-center gap-2 text-sm text-ink-gray-7">
              <span class="lucide-circle-check size-4" aria-hidden="true" />
              <span class="flex-1">{{ __('Pendientes') }}</span>
              <span
                v-if="tasks.count"
                class="num"
                :class="tasks.overdue ? 'text-ink-red-7' : 'text-ink-gray-9'"
                >{{ tasks.count }}</span
              >
            </span>
            <ul v-if="tasks.rows.length" class="mt-2 space-y-1.5">
              <li
                v-for="row in tasks.rows"
                :key="row.name"
                class="flex items-center gap-2.5 text-base"
              >
                <span
                  class="size-1.5 flex-none rounded-full bg-surface-gray-5"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">{{
                  row.description
                }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-base text-ink-gray-7">
              {{ __('Nothing overdue or due today. You are up to date.') }}
            </p>
          </RouterLink>
        </template>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import {
  agendaPlan,
  dueMore,
  eventLink,
  loadHoy,
  salesToday,
} from '@/composables/useHoy'

const open = defineModel('open', { type: Boolean, default: false })
const AGENDA_ROWS = 4
const TASK_ROWS = 3

const day = ref(null)
const failed = ref(false)
const panel = ref(null)
const locale = shellBoot.value?.locale || globalThis.window?.lang || undefined
const timeZone = computed(
  () => day.value?.time_zone || shellBoot.value?.time_zone || undefined,
)

// 24 h, like the clock above it: «15:00».
function eventTime(instant) {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timeZone.value,
    }).format(date)
  } catch {
    return ''
  }
}

// Hoy's links bring the worker back to Hoy; from the widgets the way back is
// wherever they were, so the return goes.
function plain(href) {
  if (!href) return null
  const url = new URL(href, 'https://muelle.invalid')
  url.searchParams.delete('return_to')
  url.searchParams.delete('return_label')
  return url.pathname + url.search + url.hash
}

// Each open reads again; what is on
// screen stays while the read runs.
let ticket = 0
async function read() {
  const mine = ++ticket
  failed.value = false
  try {
    const answer = await loadHoy({ fresh: true })
    if (mine === ticket) day.value = answer
  } catch {
    if (mine === ticket) failed.value = true
  }
}

const agenda = computed(() => {
  const section = day.value?.agenda
  if (!section?.available) return null
  const plan = agendaPlan(section.events || [], Date.now())
  return {
    rows: plan.rows.slice(0, AGENDA_ROWS),
    more: Math.max(plan.rows.length - AGENDA_ROWS, 0),
    to: plain(eventLink(null, day.value?.today, section.sources)),
  }
})
const sales = computed(() => {
  const shown = salesToday(day.value?.ventas)
  return shown ? { ...shown, to: plain(shown.to) } : null
})
const tasks = computed(() => {
  const section = day.value?.pendientes
  if (!section?.available) return null
  const overdue = section.overdue?.rows || []
  const rows = [...overdue, ...(section.today?.rows || [])]
  const count = rows.length
  return {
    rows: rows.slice(0, TASK_ROWS),
    count: count ? `${count}${dueMore(section) ? '+' : ''}` : '',
    // Red is for the overdue figure only (the count), never the rows.
    overdue: overdue.length > 0,
  }
})

const dayLong = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: shellBoot.value?.time_zone || undefined,
    }).format(new Date())
  } catch {
    return ''
  }
})

function close() {
  open.value = false
}
watch(
  open,
  async (value) => {
    if (!value) return
    read()
    await nextTick()
    panel.value?.focus({ preventScroll: true })
  },
  { immediate: true },
)
const route = useRoute()
watch(() => route.fullPath, close)
</script>
