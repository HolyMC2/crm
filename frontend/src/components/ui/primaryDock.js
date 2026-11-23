// Vendored from muelle/workspace/packages/ui@0.2.0 (994848826b28). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { ref } from 'vue'

// True while the phone shell's command bar is mounted: ui/Fab then teleports
// into its #shell-primary-action slot instead of floating over the page.
export const primaryDock = ref(false)
