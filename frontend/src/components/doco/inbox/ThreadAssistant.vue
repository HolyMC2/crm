<!--
  «Pregúntale a Muelle» about the open conversation (S46 item 2). The sparkle in the
  conversation's bar opens a short menu of what a worker asks for a customer; the pick
  opens the assistant with the conversation as its screen, so it reads the thread
  (doco conversacion_cliente) and prepares the work as cards: a reply for the
  customer (responder_al_cliente), a quote, a repair intake. The tap on a card does it;
  nothing is sent from here. Shows only when the assistant is on for this person.
-->
<template>
  <div v-if="assistantOn" class="relative flex-none">
    <button
      type="button"
      class="press inline-flex h-8 items-center gap-1.5 rounded-6 px-2 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
      :class="open && 'bg-surface-gray-2 text-ink-gray-9'"
      :aria-expanded="open"
      :title="__('Pregúntale a Muelle por este cliente')"
      data-testid="thread-assistant"
      @pointerenter="warmAssistant"
      @focus="warmAssistant"
      @click="open = !open"
    >
      <span class="lucide-sparkles size-4" aria-hidden="true" />
      <span class="max-sm:sr-only">{{ __('Asistente') }}</span>
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full z-30 mt-1 w-64 rounded-7 bg-surface-gray-1 p-1 shadow-lg"
      role="menu"
      @keydown.esc="open = false"
    >
      <button
        v-for="ask in asks"
        :key="ask.text"
        type="button"
        role="menuitem"
        class="state-layer flex min-h-11 w-full items-center gap-2 rounded-5 px-3 text-left text-sm text-ink-gray-9"
        :data-testid="`thread-ask-${ask.key}`"
        @click="pick(ask)"
      >
        <span
          :class="[ask.icon, 'size-4 flex-none text-ink-gray-6']"
          aria-hidden="true"
        />
        {{ ask.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import {
  assistantOn,
  loadAssistant,
  warmAssistant,
} from '@/components/assistant/assistantDoor'
import { activeDeal, activeDealDoctype } from '@/composables/inbox'

const open = ref(false)
// Literal icon classes: a class built at runtime is never generated.
const asks = [
  {
    key: 'responder',
    icon: 'lucide-message-circle',
    label: __('¿Qué le respondo?'),
    text: __('Lee la conversación con este cliente y prepárame la respuesta.'),
  },
  {
    key: 'cotizar',
    icon: 'lucide-receipt',
    label: __('Cotízale lo que pide'),
    text: __('Lee lo que pide este cliente y prepárale la cotización.'),
  },
  {
    key: 'reparacion',
    icon: 'lucide-wrench',
    label: __('Registra su reparación'),
    text: __(
      'Con lo que dice este cliente, registra la reparación de su equipo.',
    ),
  },
  {
    key: 'estado',
    icon: 'lucide-clipboard-check',
    label: __('Mándale el estado'),
    text: __(
      'Revisa cómo va la reparación de este cliente y prepárale el mensaje con el estado.',
    ),
  },
]

let dropContext = null
async function pick(ask) {
  open.value = false
  const m = await loadAssistant()
  dropContext?.()
  const doctype = activeDealDoctype.value
  const name = activeDeal.value
  // The conversation's record is the assistant's screen while this sheet opens.
  dropContext = m.useAssistantContext(() => ({ doctype, name, title: name }))
  await m.openAssistant({ text: ask.text, send: true })
}

// Another conversation: this one's record stops being the assistant's screen.
watch([activeDeal, activeDealDoctype], () => {
  dropContext?.()
  dropContext = null
  open.value = false
})
onBeforeUnmount(() => dropContext?.())
</script>
