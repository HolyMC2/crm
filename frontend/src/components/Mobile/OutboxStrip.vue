<!-- Offline-outbox strip (spec 1.4): visible while queued sends wait for signal.
     Tap → manager dialog (read the queued texts, discard mistakes). -->
<template>
  <button
    v-if="outbox.length"
    class="press flex w-full flex-none items-center justify-center gap-2 bg-surface-blue-1 px-3 py-1.5 text-[12px] font-semibold text-ink-blue-3"
    role="status"
    @click="open = true"
  >
    📤 {{ __('{0} mensaje(s) en cola — se envían al reconectar', [outbox.length]) }}
    <span v-if="outboxFlushing" class="h-1.5 w-1.5 animate-pulse rounded-full" style="background: #3b82f6" />
  </button>

  <Dialog v-model="open" :options="{ title: __('Mensajes en cola') }">
    <template #body-content>
      <div v-if="!outbox.length" class="py-4 text-center text-[12px] text-ink-gray-5">
        {{ __('Cola vacía') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="(m, i) in outbox"
          :key="m._ts + ':' + i"
          class="flex items-start gap-2 rounded-lg border border-outline-gray-2 p-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="text-[11px] font-semibold text-ink-gray-5">{{ m.reference_name }} · {{ m.to }}</div>
            <div class="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] text-ink-gray-8">{{ m.message }}</div>
          </div>
          <button
            class="press flex-none rounded-md px-2 py-1 text-[11.5px] font-medium text-ink-red-4 hover:bg-surface-red-1"
            @click="discardOutbox(i)"
          >
            {{ __('Descartar') }}
          </button>
        </div>
        <Button
          variant="solid"
          :label="outboxFlushing ? __('Enviando…') : __('Intentar enviar ahora')"
          :disabled="outboxFlushing"
          @click="flushOutbox"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref } from 'vue'
import { Button, Dialog } from 'frappe-ui'
import { outbox, outboxFlushing, flushOutbox, discardOutbox } from '@/composables/outbox'

const open = ref(false)
</script>
