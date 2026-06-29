<!--
  Messenger composer. Replies through the UNIFIED inbox endpoint
  doco_marketing.api.inbox.send_message(channel='messenger') — resolves the PSID,
  posts via the Page (24h window: free RESPONSE inside, else HUMAN_AGENT tag),
  records the Outgoing row + touchpoint, publishes realtime. Same emoji + attach UI
  as WhatsAppBox (IconPicker + FileUploader/Dropdown) for a consistent composer.
-->
<template>
  <div class="border-t border-outline-gray-1 bg-surface-white px-3 py-2 dark:bg-surface-gray-1 sm:px-10">
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide" style="color: #0084ff">
      {{ __('Responder · Messenger') }}
    </div>
    <div class="flex items-end gap-2">
      <div class="flex h-8 items-center gap-2">
        <FileUploader @success="(file) => uploadFile(file)">
          <template #default="{ openFileSelector }">
            <div class="flex items-center space-x-2">
              <Dropdown :options="uploadOptions(openFileSelector)">
                <FeatherIcon name="plus" class="size-4.5 cursor-pointer text-ink-gray-5" />
              </Dropdown>
            </div>
          </template>
        </FileUploader>
        <IconPicker
          v-slot="{ togglePopover }"
          v-model="emoji"
          @update:modelValue="onEmoji"
        >
          <SmileIcon
            class="flex size-4.5 cursor-pointer rounded-sm text-xl leading-none text-ink-gray-4"
            @click="togglePopover"
          />
        </IconPicker>
      </div>
      <textarea
        ref="textareaRef"
        v-model="text"
        rows="1"
        :placeholder="__('Escribe un mensaje…')"
        class="min-h-[38px] flex-1 resize-none rounded-lg border border-outline-gray-2 px-3 py-2 text-[13px] text-ink-gray-8 dark:bg-surface-gray-2 dark:text-ink-gray-8"
        @keydown.enter.exact.prevent="send"
      />
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
import { call, toast, FileUploader, Dropdown, FeatherIcon } from 'frappe-ui'
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})
const emit = defineEmits(['sent'])

const text = ref('')
const busy = ref(false)
const emoji = ref('')
const fileType = ref('')
const textareaRef = ref(null)

function onEmoji() {
  text.value += emoji.value
  textareaRef.value?.focus?.()
}

function uploadOptions(openFileSelector) {
  return [
    { label: __('Imagen'), icon: 'image', onClick: () => { fileType.value = 'image'; openFileSelector('image/*') } },
    { label: __('Video'), icon: 'video', onClick: () => { fileType.value = 'video'; openFileSelector('video/*') } },
    { label: __('Documento'), icon: 'file', onClick: () => { fileType.value = 'document'; openFileSelector() } },
  ]
}

async function uploadFile(file) {
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
