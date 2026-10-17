<template>
  <!-- The one empty state (Shell SPEC §2.2.5): PaneState with the action that
       moves the worker on. `state` also takes loading, denied and error. -->
  <PaneState
    :state="state"
    :title="title"
    :message="message"
    :action="action"
    :reload="reload"
    @retry="$emit('action')"
  />
</template>
<script setup>
import PaneState from '@/components/shell/PaneState.vue'

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
