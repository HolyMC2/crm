<template>
  <!-- The desktop dock: chip on top, the conversation, the composer. The
       phone sheet places the same three parts in ui/BottomSheet's slots. -->
  <section class="flex h-full min-h-0 flex-col" :aria-label="__('Ask Muelle')">
    <AssistantHeader docked class="flex-none" @close="$emit('close')" />
    <AssistantAgenda
      v-if="sessions.view === 'agenda'"
      docked
      @navigate="$emit('navigate')"
    />
    <AssistantCanvas v-else-if="sessions.view === 'canvas'" docked />
    <AssistantOpenWork
      v-else-if="sessions.view === 'open'"
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
import { defineAsyncComponent } from 'vue'
import AssistantComposer from './AssistantComposer.vue'
import AssistantConversations from './AssistantConversations.vue'
import AssistantHeader from './AssistantHeader.vue'
import AssistantLog from './AssistantLog.vue'
import AssistantOpenWork from './AssistantOpenWork.vue'
import { sessions } from './assistantSessions'

// the agenda and the Lienzo load on their first open
const AssistantAgenda = defineAsyncComponent(
  () => import('./AssistantAgenda.vue'),
)
const AssistantCanvas = defineAsyncComponent(
  () => import('./AssistantCanvas.vue'),
)

defineEmits(['close', 'navigate'])
</script>
