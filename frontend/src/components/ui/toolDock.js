// Vendored from muelle/workspace/packages/ui@0.4.1 (9225aeab0eb8). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { ref } from 'vue'

// How many list pages have their tools docked in the phone shell's command
// bar right now (ui/ToolDock). The shell reads it to shrink what shares the
// bar with them, such as the assistant's pill, to an icon.
export const pageToolsDocked = ref(0)

// True while the phone shell's command bar is on screen and can hold the
// page's search (ui/AppBar `searchable`): the list's search then sits at the
// thumb instead of the top bar, and the shell's own search steps aside. The
// shell sets it; an app that never does keeps every search in its top bar.
export const searchDock = ref(false)
