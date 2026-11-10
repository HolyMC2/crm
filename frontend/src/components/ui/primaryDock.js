// Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { ref } from 'vue'

// True while the phone shell's command bar is mounted: ui/Fab then teleports
// into its #shell-primary-action slot instead of floating over the page.
export const primaryDock = ref(false)
