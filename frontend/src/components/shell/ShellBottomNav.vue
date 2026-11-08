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
      </span>
      <span :class="LABEL">{{ module.label }}</span>
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
      </span>
      <span :class="LABEL">Más</span>
    </button>
  </nav>
</template>
<script setup>
import { computed, resolveComponent } from 'vue'

const props = defineProps({
  slots: { type: Array, default: () => [] },
  active: { type: String, default: '' },
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
</script>
