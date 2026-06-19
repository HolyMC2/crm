<!-- Inbox message thread — WhatsApp bubble style for WA, plain card for others. §5.1 -->
<template>
  <div
    ref="scroller"
    class="scb flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-2 pt-4"
    style="background: #f5f3ee"
  >
    <div v-if="thread.loading && !messages.length" class="py-8 text-center text-[11px] text-ink-gray-5">
      {{ __('Cargando mensajes…') }}
    </div>
    <div v-else-if="!messages.length" class="py-8 text-center text-[11px] text-ink-gray-5">
      {{ __('Sin mensajes en este canal todavía') }}
    </div>

    <div
      v-for="m in messages"
      :key="m.id"
      class="max-w-[64%]"
      :class="m.direction === 'in' ? 'self-start' : 'self-end'"
    >
      <div
        class="overflow-hidden rounded-[12px] px-3 py-[9px]"
        :style="bubbleStyle(m)"
      >
        <div v-if="m.template_name" class="mb-1 text-[10.5px] font-semibold" style="color: #1a8a3c">
          📄 {{ __('Plantilla') }} · {{ m.template_name }}
        </div>
        <div v-if="m.subject" class="mb-1 text-[12px] font-semibold text-ink-gray-9">
          {{ m.subject }}
        </div>
        <div
          v-if="m.content_type === 'html'"
          class="dm-msg text-[12.5px] leading-[1.45] text-ink-gray-8"
          v-html="m.content"
        />
        <div v-else class="whitespace-pre-wrap text-[12.5px] leading-[1.45] text-ink-gray-8">
          {{ m.content }}
        </div>
      </div>
      <div
        class="mt-[3px] text-[9.5px]"
        :class="m.direction === 'in' ? 'ml-1 text-left' : 'mr-1 text-right'"
        style="color: #a39e92"
      >
        {{ hhmm(m.timestamp) }}
        <span v-if="m.direction === 'out' && m.status"> · {{ statusTick(m.status) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { thread, hhmm } from '@/composables/inbox'

const scroller = ref(null)
const messages = computed(() => thread.data?.messages || [])

function bubbleStyle(m) {
  const wa = m.channel === 'whatsapp'
  if (m.direction === 'in') {
    return 'background:#fff;border-top-left-radius:3px;box-shadow:0 1px 1px rgba(0,0,0,.05)'
  }
  const bg = wa ? '#dcf8c6' : '#eaf1fe'
  return `background:${bg};border-top-right-radius:3px;box-shadow:0 1px 1px rgba(0,0,0,.05)`
}
function statusTick(s) {
  const v = String(s).toLowerCase()
  if (v.includes('read')) return '✓✓'
  if (v.includes('deliver')) return '✓✓'
  if (v.includes('sent')) return '✓'
  if (v.includes('fail')) return '⚠'
  return s
}

// keep pinned to the latest message as the thread loads / updates
watch(
  () => messages.value.length,
  () =>
    nextTick(() => {
      if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    }),
)
</script>

<style scoped>
.dm-msg :deep(p) {
  margin: 0 0 4px;
}
.dm-msg :deep(img) {
  max-width: 100%;
}
</style>
