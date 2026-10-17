<template>
  <!-- The desktop dock: chip on top, the conversation, the composer. The
       phone sheet places the same three parts in ui/BottomSheet's slots. -->
  <section class="flex h-full min-h-0 flex-col" :aria-label="__('Ask Muelle')">
    <AssistantHeader docked class="flex-none" @close="$emit('close')" />
    <AssistantLog docked @navigate="$emit('navigate')" />
    <AssistantComposer class="flex-none" />
  </section>
</template>
<script setup>
import AssistantComposer from './AssistantComposer.vue'
import AssistantHeader from './AssistantHeader.vue'
import AssistantLog from './AssistantLog.vue'

defineEmits(['close', 'navigate'])
</script>
