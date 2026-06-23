// Single source of truth for the mobile breakpoint. Matches App.vue's <640px
// MobileLayout/DesktopLayout swap so the inbox single-pane stack engages on exactly
// the same screens. Derived from useWindowSize (already used elsewhere) for a reactive
// module singleton — import `isMobile` anywhere, no prop-drilling.
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'

const { width } = useWindowSize()
export const isMobile = computed(() => width.value < 640)
