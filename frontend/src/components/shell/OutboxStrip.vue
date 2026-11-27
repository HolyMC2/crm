<!-- Offline-outbox strip (spec 1.4): visible while queued sends wait for signal.
     Tap → the queue (OutboxDialog: read the queued texts, discard mistakes).
     The desk says it in the top bar (ShellStatus). -->
<template>
  <button
    v-if="outbox.length"
    class="press flex w-full flex-none items-center justify-center gap-2 bg-surface-blue-1 px-3 py-1.5 text-[12px] font-semibold text-ink-blue-8"
    role="status"
    @click="open = true"
  >
    📤
    {{
      __('{0} mensaje(s) en cola — se envían al reconectar', [outbox.length])
    }}
    <span
      v-if="outboxFlushing"
      class="h-1.5 w-1.5 animate-pulse rounded-full"
      style="background: #3b82f6"
    />
  </button>
  <OutboxDialog v-model="open" />
</template>

<script setup>
import { ref } from 'vue'
import { outbox, outboxFlushing } from '@/composables/outbox'
import OutboxDialog from './OutboxDialog.vue'

const open = ref(false)
</script>
