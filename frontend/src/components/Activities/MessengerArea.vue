<!--
  Messenger conversation display (MA-23 / Phase D follow-on). Renders the PSID thread
  returned by doco_marketing.api.inbox.get_communications(channel='messenger'):
  in = left/grey, out = left-blue (#0084ff). Lean MVP — no reactions/receipts (Messenger
  has none); attachments shown as a link. Mirrors the slot WhatsAppArea occupies.
-->
<template>
  <div ref="scrollEl" class="flex max-h-full flex-col gap-2 overflow-y-auto px-3 py-3 sm:px-10">
    <div v-if="!messages.length" class="py-10 text-center text-[13px] text-ink-gray-4 dark:text-ink-gray-5">
      {{ __('Sin mensajes todavía.') }}
    </div>
    <div
      v-for="m in messages"
      :key="m.id"
      class="flex"
      :class="m.direction === 'out' ? 'justify-end' : 'justify-start'"
    >
      <div
        class="max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug"
        :class="
          m.direction === 'out'
            ? 'bg-[#0084ff] text-white'
            : 'bg-surface-gray-2 text-ink-gray-8 dark:bg-surface-gray-3 dark:text-ink-gray-8'
        "
      >
        <div v-if="m.content" class="whitespace-pre-wrap break-words">{{ m.content }}</div>
        <a
          v-if="m.attach"
          :href="m.attach"
          target="_blank"
          rel="noopener"
          class="block break-all underline"
          :class="m.direction === 'out' ? 'text-white' : 'text-ink-blue-3 dark:text-ink-blue-2'"
        >
          {{ __('Ver adjunto') }}
        </a>
        <div class="mt-0.5 text-right text-[10px] opacity-60">{{ fmtTime(m.timestamp) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
})

const scrollEl = ref(null)

function fmtTime(ts) {
  if (!ts) return ''
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return String(ts).slice(0, 16)
  }
}

// stick to the newest message
watch(
  () => props.messages.length,
  () =>
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    }),
  { immediate: true },
)
</script>
