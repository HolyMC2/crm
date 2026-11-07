import { computed } from 'vue'
import { useElementSize } from '@vueuse/core'
import { isWide } from '@/composables/breakpoint'

// A queue reads as a table only where its own column has room for one: a
// wide window minus the rail and the module's lists. At 1024 px with the
// rail open that leaves about 580 px, so the rows stay. Before the first
// measurement, and where nothing is measured (tests), the window decides.
export const TABLE_MIN_WIDTH = 760

/** `target`: the list's scroller (a ref to its element). */
export function useTableWidth(target, min = TABLE_MIN_WIDTH) {
  const { width } = useElementSize(target)
  return computed(() => isWide.value && (!width.value || width.value >= min))
}
