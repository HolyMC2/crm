<template>
  <!-- The desktop dock: chip on top, the conversation, the composer. The
       phone sheet places the same three parts in ui/BottomSheet's slots. -->
  <section class="flex h-full min-h-0 flex-col" :aria-label="__('Ask Muelle')">
    <AssistantHeader docked class="flex-none" @close="$emit('close')" />
    <AssistantOpenWork
      v-if="sessions.view === 'open'"
      docked
      @navigate="$emit('navigate')"
    />
    <AssistantConversations
      v-else-if="sessions.view !== 'chat'"
      docked
      @navigate="$emit('navigate')"
    />
    <AssistantLog v-else docked @navigate="$emit('navigate')" />
    <AssistantComposer
      v-if="sessions.view === 'chat'"
      docked
      class="flex-none"
    />
  </section>
</template>
<script setup>
import AssistantComposer from './AssistantComposer.vue'
import AssistantConversations from './AssistantConversations.vue'
import AssistantHeader from './AssistantHeader.vue'
import AssistantLog from './AssistantLog.vue'
import AssistantOpenWork from './AssistantOpenWork.vue'
import { sessions } from './assistantSessions'

defineEmits(['close', 'navigate'])
</script>
