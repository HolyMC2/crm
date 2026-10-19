<template>
  <!-- sticky: Desk floating launchers (doco floating_dock.js) rise above fixed/sticky bottom bars. -->
  <nav
    class="sticky bottom-0 flex shrink-0 items-stretch border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    :aria-label="__('Main navigation')"
  >
    <RouterLink
      v-for="module in slots"
      :key="module.key"
      :to="module.to"
      class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium"
      :class="module.key === active ? 'text-ink-gray-9' : 'text-ink-gray-6'"
      :aria-current="module.key === active ? 'page' : undefined"
    >
      <span
        class="flex h-7 w-12 items-center justify-center rounded-full"
        :class="module.key === active ? 'bg-surface-gray-3' : ''"
        aria-hidden="true"
      >
        <span :class="[module.icon, 'size-5']" />
      </span>
      <span :class="LABEL">{{ module.label }}</span>
    </RouterLink>
    <!-- «Más» lights up while the page is a module the bar does not hold: the
         worker reached it from the sheet, so the way back stays visible. -->
    <button
      class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium"
      :class="moreLit ? 'text-ink-gray-9' : 'text-ink-gray-6'"
      aria-haspopup="dialog"
      :aria-current="moreLit ? 'page' : undefined"
      @click="$emit('more')"
    >
      <span
        class="flex h-7 w-12 items-center justify-center rounded-full"
        :class="moreLit ? 'bg-surface-gray-3' : ''"
        aria-hidden="true"
      >
        <span class="lucide-menu size-5" />
      </span>
      <span :class="LABEL">{{ __('More') }}</span>
    </button>
  </nav>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  slots: { type: Array, default: () => [] },
  active: { type: String, default: '' },
})
defineEmits(['more'])
// Five tabs below 360 px leave ~61 px each: «Documentos» at 11 px (~58 px)
// touches its neighbours. 10 px and tighter tracking keep whole words with air
// between tabs (measured at 305: «Documentos» 52 px); the ellipsis inside the
// tab is only a last resort, never an overlap.
// px-px: with negative tracking the last glyph overhangs its box by a hair,
// and truncate's overflow:hidden would shave it («Pendiente» + half an s).
const LABEL =
  'block max-w-full truncate px-px tracking-tight max-[359px]:text-[10px]'

const moreLit = computed(
  () => !!props.active && !props.slots.some((m) => m.key === props.active),
)
</script>
