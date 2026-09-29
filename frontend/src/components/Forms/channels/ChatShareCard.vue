<template>
  <section class="flex flex-col gap-3">
    <div>
      <div class="text-base font-semibold text-ink-gray-9">
        {{ __('Send the link in a chat') }}
      </div>
      <div class="text-p-sm text-ink-gray-6">
        {{
          __(
            'Ready-to-send messages with a tagged link, so chat submissions show where they came from. Save one as a quick reply to use it from the inbox.',
          )
        }}
      </div>
    </div>
    <div
      v-for="ch in chats"
      :key="ch.key"
      class="rounded-lg border border-outline-gray-2 p-3"
    >
      <div
        class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-gray-8"
      >
        <component :is="ch.icon" class="size-4" />
        {{ ch.label }}
      </div>
      <p class="whitespace-pre-wrap break-words text-p-sm text-ink-gray-7">
        {{ share(ch.key)?.text || '—' }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          icon-left="copy"
          :label="__('Copy message')"
          :disabled="!share(ch.key)?.text"
          @click="copyToClipboard(share(ch.key).text)"
        />
        <Button
          size="sm"
          icon-left="message-square"
          :label="__('Save as quick reply')"
          :loading="c.busy.value === `reply-${ch.key}`"
          :disabled="!share(ch.key)?.text"
          @click="c.saveQuickReply(ch.key)"
        />
      </div>
    </div>
  </section>
</template>

<script setup>
import { Button } from 'frappe-ui'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import LucideMessageCircle from '~icons/lucide/message-circle'
import { copyToClipboard } from '@/utils'
import { inject } from 'vue'
import { FORM_CHANNELS } from './useFormChannels'

const c = inject(FORM_CHANNELS)
const chats = [
  { key: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon },
  { key: 'messenger', label: 'Messenger', icon: LucideMessageCircle },
]
const share = (key) => c.channels.data?.share?.[key]
</script>
