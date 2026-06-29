<!--
  Messenger composer (MA-23 / Phase D follow-on). Replies through the UNIFIED inbox
  endpoint doco_marketing.api.inbox.send_message(channel='messenger') — which resolves
  the conversation PSID, posts via the Page (24h window: free RESPONSE inside, else
  HUMAN_AGENT tag), records the Outgoing row + touchpoint, and publishes realtime.
  Mirrors the slot WhatsAppBox occupies; PSID-based, so no phone/template path.
-->
<template>
  <div class="border-t border-outline-gray-1 bg-surface-white px-3 py-2 dark:bg-surface-gray-1 sm:px-10">
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide" style="color: #0084ff">
      {{ __('Responder · Messenger') }}
    </div>
    <div class="flex items-end gap-2">
      <textarea
        v-model="text"
        rows="1"
        :placeholder="__('Escribe un mensaje…')"
        class="min-h-[38px] flex-1 resize-none rounded-lg border border-outline-gray-2 px-3 py-2 text-[13px] text-ink-gray-8 dark:bg-surface-gray-2 dark:text-ink-gray-8"
        @keydown.enter.exact.prevent="send"
      />
      <EmojiPicker @pick="onEmoji" />
      <FileUploader @success="(file) => onFile(file)">
        <template #default="{ openFileSelector }">
          <button
            type="button"
            class="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-50"
            :title="__('Adjuntar imagen')"
            :aria-label="__('Adjuntar')"
            :disabled="busy"
            @click="openFileSelector"
          >
            <LucidePaperclip class="h-4 w-4" />
          </button>
        </template>
      </FileUploader>
      <button
        class="flex-none rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        style="background: #0084ff"
        :disabled="busy || !text.trim()"
        @click="send"
      >
        {{ busy ? '…' : __('Enviar') }}
      </button>
    </div>
    <p class="mt-1 text-[10px] text-ink-gray-4 dark:text-ink-gray-5">
      {{ __('Fuera de la ventana de 24 h, Meta solo permite mensajes con etiqueta de agente humano.') }}
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { call, toast, FileUploader } from 'frappe-ui'
import LucidePaperclip from '~icons/lucide/paperclip'
import EmojiPicker from '@/components/doco/inbox/EmojiPicker.vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})
const emit = defineEmits(['sent'])

const text = ref('')
const busy = ref(false)
function onEmoji(e) {
  text.value += e
}

async function onFile(file) {
  if (busy.value || !file?.file_url) return
  busy.value = true
  try {
    await call('doco_marketing.api.inbox.send_message', {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      channel: 'messenger',
      attach: file.file_url,
    })
    emit('sent')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el adjunto'))
  } finally {
    busy.value = false
  }
}

async function send() {
  const content = text.value.trim()
  if (!content || busy.value) return
  busy.value = true
  try {
    await call('doco_marketing.api.inbox.send_message', {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      channel: 'messenger',
      content,
    })
    text.value = ''
    emit('sent')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el mensaje'))
  } finally {
    busy.value = false
  }
}
</script>
