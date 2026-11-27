<!-- The desktop's menu bar (from 640 px, where the rail shows), the way a Mac
     keeps the system on one thin row: the shop on the left; on the right
     what the worker should know about the app itself, shown only while it
     matters (ShellStatus: the lists not updating, messages waiting to send,
     the label printer, a caja left open), then Avisos, then the clock, which
     opens today's widgets. The rail keeps the places. -->
<template>
  <header
    class="relative z-20 flex h-9 flex-none items-center gap-0.5 border-b border-outline-gray-1 bg-surface-base pl-2.5 pr-1.5 text-sm text-ink-gray-8"
    data-testid="shell-topbar"
  >
    <span
      class="flex size-6 flex-none items-center justify-center rounded-4 bg-[var(--muelle-accent)] text-xs font-bold text-[var(--muelle-accent-ink)]"
      aria-hidden="true"
      >M</span
    >
    <span
      class="ml-2 min-w-0 truncate font-semibold text-ink-gray-9"
      data-testid="shell-topbar-shop"
      >{{ shop }}</span
    >
    <div class="min-w-4 flex-1" />
    <ShellStatus />
    <AvisosBell
      v-if="avisos"
      bar
      :ventas="ventas"
      :active="active === 'avisos'"
    />
    <button
      type="button"
      class="press num ml-1 flex h-7 flex-none items-center whitespace-nowrap rounded-full px-2.5 text-ink-gray-8 hover:bg-surface-gray-2"
      :class="
        widgetsOpen
          ? 'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
          : ''
      "
      :aria-label="__('Today: {0}', [clockLong])"
      :title="__('Today')"
      :aria-expanded="widgetsOpen"
      aria-haspopup="dialog"
      data-testid="shell-clock"
      @pointerenter="loadWidgets"
      @focus="loadWidgets"
      @click="toggleWidgets"
    >
      {{ clock }}
    </button>
    <ShellWidgets v-if="widgetsWanted" v-model:open="widgetsOpen" />
  </header>
</template>
<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import { shellBoot } from '@/composables/muelleShell'
import ShellStatus from './ShellStatus.vue'

defineProps({
  /** Avisos is one of the worker's places (the bell shows only then). */
  avisos: Boolean,
  ventas: Boolean,
  active: { type: String, default: '' },
})

const AvisosBell = defineAsyncComponent(
  () => import('@/components/avisos/AvisosBell.vue'),
)
const ShellWidgets = defineAsyncComponent(() => import('./ShellWidgets.vue'))

const shop = computed(() => shellBoot.value?.company || 'Muelle')

// The clock reads the worker's language and time zone (the boot's), turning
// at each minute's start.
const now = ref(new Date())
let timer = null
function tick() {
  now.value = new Date()
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
}
tick()
onBeforeUnmount(() => clearTimeout(timer))

function formatter(options) {
  const boot = shellBoot.value || {}
  const locale = boot.locale || globalThis.window?.lang || undefined
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: boot.time_zone || undefined,
    })
  } catch {
    return new Intl.DateTimeFormat(undefined, options)
  }
}
// «jue 26 nov 13:08» («Thu Nov 26 13:08»): the date's words in the
// language's order, without the «de», commas and dots between them.
const DATE_PARTS = ['weekday', 'day', 'month']
const clock = computed(() => {
  const parts = formatter({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now.value)
  const value = (type) => parts.find((part) => part.type === type)?.value
  const date = parts
    .filter((part) => DATE_PARTS.includes(part.type))
    .map((part) => part.value.replace(/\.$/, ''))
  return `${date.join(' ')} ${value('hour')}:${value('minute')}`
})
const clockLong = computed(() =>
  formatter({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now.value),
)

const widgetsWanted = ref(false)
const widgetsOpen = ref(false)
const loadWidgets = () => (widgetsWanted.value = true)
function toggleWidgets() {
  widgetsWanted.value = true
  widgetsOpen.value = !widgetsOpen.value
}
</script>
