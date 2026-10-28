<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (2914c0d19b1b). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The one empty state (Shell SPEC §2.2.5): PaneState with the action that
       moves the worker on. `state` also takes loading, denied and error. The
       default slot holds further ways out, next to the action. -->
  <PaneState
    :state="state"
    :title="title"
    :message="message"
    :action="action"
    :reload="reload"
    @retry="$emit('action')"
  >
    <template v-if="$slots.default" #default><slot /></template>
  </PaneState>
</template>
<script setup>
import PaneState from './PaneState.vue'

defineProps({
  state: { type: String, default: 'empty' },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  /** The next action's label («Nuevo pendiente»); emits `action`. */
  action: { type: String, default: '' },
  reload: { type: Boolean, default: false },
})
defineEmits(['action'])
</script>
