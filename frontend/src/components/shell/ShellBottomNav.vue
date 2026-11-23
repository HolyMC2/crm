<template>
  <!-- sticky: Desk floating launchers (doco floating_dock.js) rise above fixed/sticky bottom bars. -->
  <nav
    class="sticky bottom-0 flex shrink-0 items-stretch border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    :aria-label="__('Main navigation')"
  >
    <!-- A docked app (Escáner on a stock worker's bar) is a plain link that
         leaves the shell with the way back (`href`, from MuelleShell). -->
    <component
      :is="module.app ? 'a' : RouterLink"
      v-for="module in slots"
      :key="module.key"
      v-bind="module.app ? { href: module.href } : { to: module.to }"
      :data-sibling="module.app ? module.key : undefined"
      :class="[
        TAB,
        module.key === active ? 'text-ink-gray-9' : 'text-ink-gray-6',
      ]"
      :aria-current="module.key === active ? 'page' : undefined"
    >
      <span :class="PILL_BOX" aria-hidden="true">
        <span :class="[PILL, module.key === active ? PILL_ON : PILL_OFF]" />
        <span :class="[module.icon, 'relative size-5']" />
        <span
          v-if="counts[module.key]"
          :class="[BADGE, badgeTone(counts[module.key])]"
          data-bar-count
          >{{ counts[module.key].text }}</span
        >
      </span>
      <span :class="LABEL">{{ module.label }}</span>
      <span v-if="counts[module.key]" class="sr-only">
        · {{ counts[module.key].text }}</span
      >
    </component>
    <!-- «Más» lights up while the page is a module the bar does not hold: the
         worker reached it from the sheet, so the way back stays visible. -->
    <button
      :class="[TAB, moreLit ? 'text-ink-gray-9' : 'text-ink-gray-6']"
      aria-haspopup="dialog"
      :aria-current="moreLit ? 'page' : undefined"
      @click="$emit('more')"
    >
      <span :class="PILL_BOX" aria-hidden="true">
        <span :class="[PILL, moreLit ? PILL_ON : PILL_OFF]" />
        <span class="lucide-menu relative size-5" />
        <span
          v-if="moreCount"
          :class="[BADGE, badgeTone(moreCount)]"
          data-bar-count
          >{{ moreCount.text }}</span
        >
      </span>
      <span :class="LABEL">Más</span>
      <span v-if="moreCount" class="sr-only"> · {{ moreCount.text }}</span>
    </button>
  </nav>
</template>
<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  resolveComponent,
  watch,
} from 'vue'
import {
  moduleCount,
  railCounts,
  refreshRailCounts,
} from '@/composables/shellRail'

const props = defineProps({
  slots: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  /** Every module of the shell: what waits in the ones the bar leaves out
   *  adds up on «Más» (the Más sheet shows each one's count). */
  modules: { type: Array, default: () => [] },
})
defineEmits(['more'])
const RouterLink = resolveComponent('RouterLink')
// Five tabs below 360 px leave ~61 px each: «Documentos» at 11 px (~58 px)
// touches its neighbours. 10 px and tighter tracking keep whole words with air
// between tabs (measured at 305: «Documentos» 52 px); the ellipsis inside the
// tab is only a last resort, never an overlap.
// px-px: with negative tracking the last glyph overhangs its box by a hair,
// and truncate's overflow:hidden would shave it («Pendiente» + half an s).
const LABEL =
  'block max-w-full truncate px-px tracking-tight max-[359px]:text-[10px]'
const TAB =
  'press flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium'
// The active tab's pill grows out from under its icon (Material's nav
// indicator), so the eye follows the tap to the place it opened.
const PILL_BOX = 'relative flex h-7 w-12 items-center justify-center'
const PILL =
  'absolute inset-0 rounded-full bg-surface-gray-3 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none'
const PILL_ON = 'opacity-100'
const PILL_OFF = 'scale-x-50 opacity-0'

const moreLit = computed(
  () => !!props.active && !props.slots.some((m) => m.key === props.active),
)

// What waits in each module («14» on Ventas), the same counts as the desktop
// rail, which a phone does not mount: read here on the same rhythm.
const counts = computed(() =>
  Object.fromEntries(
    props.slots.map((m) => [m.key, moduleCount(m, railCounts.value)]),
  ),
)
const moreCount = computed(() => {
  const onBar = new Set(props.slots.map((m) => m.key))
  let count = 0
  let urgent = false
  for (const m of props.modules) {
    if (m.app || onBar.has(m.key) || m.key === 'avisos') continue
    const found = moduleCount(m, railCounts.value)
    if (!found) continue
    count += found.count
    urgent = urgent || found.urgent
  }
  if (!count) return null
  return { count, text: count > 99 ? '99+' : String(count), urgent }
})
const BADGE =
  'num absolute -right-1 -top-1.5 h-[18px] min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold leading-[18px] ring-2 ring-[var(--surface-base)]'
const badgeTone = (found) =>
  found.urgent
    ? 'bg-surface-red-7 text-white'
    : 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'

const COUNTS_EVERY_MS = 120000
let countsTimer = 0
const onFocus = () => refreshRailCounts()
onMounted(() => {
  refreshRailCounts({ force: true })
  window.addEventListener('focus', onFocus)
  countsTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshRailCounts()
  }, COUNTS_EVERY_MS)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus)
  window.clearInterval(countsTimer)
})
// Another page: read again (refreshRailCounts skips a read fresher than 20 s).
watch(
  () => props.active,
  () => refreshRailCounts(),
)
</script>
