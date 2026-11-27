<!-- The offline outbox's queue (spec 1.4): read the queued texts, discard
     mistakes, send now. Opened from the phone's strip and the desk's top bar. -->
<template>
  <Dialog v-model="open" :title="__('Mensajes en cola')">
    <template #default>
      <div
        v-if="!outbox.length"
        class="py-4 text-center text-[12px] text-ink-gray-5"
      >
        {{ __('Cola vacía') }}
      </div>
      <div v-else class="flex flex-col gap-2" data-testid="outbox-queue">
        <div
          v-for="(m, i) in outbox"
          :key="m._ts + ':' + i"
          class="flex items-start gap-2 rounded-6 border border-outline-gray-2 p-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="text-[11px] font-semibold text-ink-gray-5">
              {{ m.reference_name }} · {{ m.to }}
            </div>
            <div
              class="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] text-ink-gray-8"
            >
              {{ m.message }}
            </div>
          </div>
          <button
            class="press flex-none rounded-5 px-2 py-1 text-[11.5px] font-medium text-ink-red-8 hover:bg-surface-red-1"
            @click="discardOutbox(i)"
          >
            {{ __('Descartar') }}
          </button>
        </div>
        <Button
          variant="solid"
          :label="
            outboxFlushing ? __('Enviando…') : __('Intentar enviar ahora')
          "
          :disabled="outboxFlushing"
          @click="flushOutbox"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { Button, Dialog } from 'frappe-ui'
import {
  outbox,
  outboxFlushing,
  flushOutbox,
  discardOutbox,
} from '@/composables/outbox'

const open = defineModel({ type: Boolean, default: false })
</script>
