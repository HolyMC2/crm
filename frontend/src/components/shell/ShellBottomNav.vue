<template>
  <!-- sticky: Desk floating launchers (doco floating_dock.js) rise above fixed/sticky bottom bars. -->
  <nav
    class="sticky bottom-0 flex shrink-0 items-stretch bg-[var(--muelle-surface-container)] pb-[env(safe-area-inset-bottom)]"
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
      :class="[TAB, module.key === active ? TAB_ON : TAB_OFF]"
      :aria-current="module.key === active ? 'page' : undefined"
    >
      <span :class="PILL_BOX" aria-hidden="true">
        <span :class="[PILL, module.key === active ? PILL_ON : PILL_OFF]" />
        <span
          :class="[module.icon, ICON, module.key === active ? ICON_ON : '']"
        />
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
      :class="[TAB, moreLit ? TAB_ON : TAB_OFF]"
      aria-haspopup="dialog"
      :aria-current="moreLit ? 'page' : undefined"
      @click="$emit('more')"
    >
      <span :class="PILL_BOX" aria-hidden="true">
        <span :class="[PILL, moreLit ? PILL_ON : PILL_OFF]" />
        <span :class="['lucide-menu', ICON, moreLit ? ICON_ON : '']" />
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
// The bar is a tonal block (the container role), with no rule above it. A
// tab gives under the finger (.press); its state layer is the pill's shape,
// not the tab's rectangle, so `!bg-none` takes the kit's layer off the tab
// and PILL_BOX paints it.
const TAB =
  'group press flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] !bg-none'
const TAB_ON = 'font-semibold text-ink-gray-9'
const TAB_OFF = 'font-medium text-[var(--muelle-on-surface-variant)]'
// The active tab's pill grows out from under its icon (Material's nav
// indicator, on the secondary container), so the eye follows the tap to the
// place it opened. 56 px wide: five tabs at 305 px are 61 px each.
const PILL_BOX =
  'relative flex h-8 w-14 items-center justify-center rounded-full group-active:bg-[color:color-mix(in_srgb,currentColor_10%,transparent)] group-focus-visible:bg-[color:color-mix(in_srgb,currentColor_10%,transparent)]'
const PILL =
  'absolute inset-0 rounded-full bg-[var(--muelle-secondary-container)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none'
const ICON = 'relative size-5'
const ICON_ON = 'text-[var(--muelle-on-secondary-container)]'
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
// The count stays inside the nav, ring included. The command bar above is
// z-10 (it stays bright over a docked panel's scrim, which dims this nav), so
// whatever crosses the nav's top edge is painted over by the bar. Below
// 360 px the last tab's pill ends 2.5 px from the screen's edge, so the count
// keeps to the pill there instead of hanging past it («20» on Más was cut).
const BADGE =
  'num absolute -right-1 top-0.5 h-[18px] min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold leading-[18px] ring-2 ring-[var(--surface-base)] max-[359px]:right-0'
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
