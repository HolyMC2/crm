<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<!-- A list page's search and the buttons beside it, at the thumb on a phone
     (Marco 2026-11-08). While the phone command bar is mounted (primaryDock)
     `#bar` teleports into its #shell-page-tools slot and `#panel`, the page's
     filters, rises above the bar while `open`, over a scrim, from
     #shell-page-panel. Off the phone both slots render in place, so a desktop
     toolbar keeps its markup and order. The shell renders the two targets
     beside #shell-primary-action and reads pageToolsDocked to shrink what
     shares the bar. The page styles its own controls with .dock-pill,
     .dock-icon and .dock-badge (shell.css) while the `docked` slot prop is
     on; `toggle` opens the panel from an icon, `close` folds it. -->
<template>
  <Teleport to="#shell-page-tools" :disabled="!docked" defer>
    <slot name="bar" :docked="docked" :open="open" :toggle="toggle" />
  </Teleport>
  <Teleport to="#shell-page-panel" :disabled="!docked" defer>
    <template v-if="docked">
      <Transition name="tool-scrim">
        <div
          v-if="open"
          class="tool-dock-scrim"
          aria-hidden="true"
          data-tool-dock-scrim
          @click="close"
        />
      </Transition>
      <ExpandTransition>
        <div v-if="open" class="tool-dock-panel" data-tool-dock-panel>
          <slot name="panel" :docked="true" :close="close" />
        </div>
      </ExpandTransition>
    </template>
    <slot v-else name="panel" :docked="false" :close="close" />
  </Teleport>
</template>
<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import ExpandTransition from './ExpandTransition.vue'
import { primaryDock } from './primaryDock'
import { pageToolsDocked } from './toolDock'

const open = defineModel('open', { type: Boolean, default: false })
const docked = computed(() => primaryDock.value)

watch(
  docked,
  (now, before) => {
    if (now && !before) pageToolsDocked.value += 1
    else if (!now && before) pageToolsDocked.value -= 1
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (docked.value) pageToolsDocked.value -= 1
})

function close() {
  open.value = false
}
function toggle() {
  open.value = !open.value
}
defineExpose({ close })
</script>
