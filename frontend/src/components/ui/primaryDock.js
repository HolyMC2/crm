// Vendored from muelle/workspace/packages/ui@0.4.0 (f299ad1b2cf1). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { ref } from 'vue'

// True while the phone shell's command bar is mounted: ui/Fab then teleports
// into its #shell-primary-action slot instead of floating over the page.
export const primaryDock = ref(false)
// How many docked actions keep their word there right now (ui/Fab
// dock="extended", a record's next step): the shell shrinks its search to an
// icon so the word fits.
export const primaryDockExtended = ref(0)
