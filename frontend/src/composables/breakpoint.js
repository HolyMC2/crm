// Single source of truth for the shell's breakpoints. Derived from
// useWindowSize for a reactive module singleton: import them anywhere, no
// prop-drilling.
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'

const { width } = useWindowSize()
/** The phone: bottom nav, the phone app bar, single-pane lists (< 640px). */
export const isMobile = computed(() => width.value < 640)
/** Too narrow for the desktop-only set-up screens (Shell D3, < 768px). */
export const isNarrow = computed(() => width.value < 768)
/** Room for list and record side by side (master-detail, Shell SPEC §6 DD4: ≥ 1024px). */
export const isWide = computed(() => width.value >= 1024)
