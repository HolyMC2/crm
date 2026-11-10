// Vendored from muelle/workspace/packages/ui@0.1.0 (7f554d4509b6). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { ref } from 'vue'

// How many list pages have their tools docked in the phone shell's command
// bar right now (ui/ToolDock). The shell reads it to shrink what shares the
// bar with them, such as the assistant's pill, to an icon.
export const pageToolsDocked = ref(0)
