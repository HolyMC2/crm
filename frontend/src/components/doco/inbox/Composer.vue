<!-- Inbox composer: Reply / Private Note / Internal modes + quick templates + ⌘↵ send. §5.1 -->
<template>
  <div class="flex-none border-t border-outline-gray-1 bg-surface-white px-3.5 py-2.5">
    <div class="mb-2.5 flex items-center gap-2">
      <button
        v-for="m in modes"
        :key="m.key"
        class="rounded-full px-3 py-[5px] text-[11.5px] font-semibold"
        :style="
          composeMode === m.key
            ? 'color:#fff;background:#1c2230'
            : 'color:#5b6472;background:#f1f2f4'
        "
        @click="composeMode = m.key"
      >
        {{ m.label }}
      </button>
      <span class="ml-auto text-[11px] text-ink-gray-4">⌘↵ {{ __('enviar') }}</span>
    </div>

    <div v-if="composeMode === 'reply' && templateNames.length" class="mb-2.5 flex flex-wrap gap-1.5">
      <button
        v-for="t in templateNames"
        :key="t.name"
        class="rounded-[7px] px-[9px] py-1 text-[10.5px] font-semibold text-ink-gray-7"
        style="background: #f1f2f4"
        @click="applyTemplate(t)"
      >
        ⚡ {{ t.label }}
      </button>
    </div>

    <div
      class="rounded-[11px] border-[1.5px] p-3"
      :style="composeMode === 'reply' ? 'border-color:#c7ecd5;background:#fff' : 'border-color:#f1dca6;background:#fffdf6'"
    >
      <textarea
        ref="input"
        v-model="text"
        :rows="2"
        :placeholder="placeholder"
        class="w-full resize-none border-0 bg-transparent text-[12.5px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        @keydown="onKeydown"
      />
      <div class="mt-1.5 flex items-center gap-3">
        <span class="text-[12px] text-ink-gray-4" aria-hidden="true">📎</span>
        <span class="text-[12px] text-ink-gray-4" aria-hidden="true">😊</span>
        <button
          class="ml-auto rounded-lg px-4 py-[7px] text-[12.5px] font-semibold text-white disabled:opacity-50"
          :style="`background:${composeMode === 'reply' ? '#16a34a' : '#b9790a'}`"
          :disabled="sending || !text.trim()"
          @click="send"
        >
          {{ sending ? __('Enviando…') : sendLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { createListResource, toast } from 'frappe-ui'
import {
  activeChannel,
  composeMode,
  activeDeal,
  queue,
  sendMessage,
  savePrivateNote,
  CHANNEL_META,
} from '@/composables/inbox'

const text = ref('')
const sending = ref(false)
const input = ref(null)

const channelLabel = computed(() => CHANNEL_META[activeChannel.value]?.[0] || activeChannel.value)
const modes = computed(() => [
  { key: 'reply', label: `↩ ${__('Responder')} · ${channelLabel.value}` },
  { key: 'note', label: `✐ ${__('Nota privada')}` },
  { key: 'comment', label: `💬 ${__('Interno')}` },
])
const placeholder = computed(() =>
  composeMode.value === 'reply'
    ? __('Escribe un mensaje…')
    : __('Nota visible solo para el equipo. Usa @ para mencionar.'),
)
const sendLabel = computed(() => (composeMode.value === 'reply' ? __('Enviar') : __('Guardar nota')))

const row = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})

// quick templates from Email Template (spec §6.4)
const templates = createListResource({
  doctype: 'Email Template',
  fields: ['name', 'subject', 'response', 'use_html'],
  pageLength: 8,
  auto: true,
})
const templateNames = computed(() =>
  (templates.data || []).map((t) => ({ name: t.name, label: t.name, body: t.response })),
)
function applyTemplate(t) {
  const body = (t.body || '').replace(/<[^>]+>/g, '').trim()
  text.value = text.value ? `${text.value}\n${body}` : body
  input.value?.focus()
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    send()
  }
}

function parseMentions(s) {
  return [...s.matchAll(/@([\w.+-]+@[\w.-]+)/g)].map((m) => m[1])
}

async function send() {
  const body = text.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    if (composeMode.value === 'reply') {
      await sendMessage(body, { to: row.value.mobile_no })
      toast.success(__('Mensaje enviado'))
    } else {
      await savePrivateNote(body, parseMentions(body))
      toast.success(__('Nota guardada'))
    }
    text.value = ''
  } catch (e) {
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo enviar'))
  } finally {
    sending.value = false
  }
}
</script>
