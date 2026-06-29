<!--
  Respuestas rápidas — a small picker of saved canned replies for any composer.
  Emits `pick(body)`; the parent inserts it into its textarea (then edits before
  sending). Backed by doco_marketing.api.inbox.get_canned_replies(channel).
-->
<template>
  <div class="relative">
    <button
      type="button"
      class="flex size-4.5 items-center justify-center text-ink-gray-5 hover:text-ink-gray-8"
      :title="__('Respuestas rápidas')"
      :aria-label="__('Respuestas rápidas')"
      @click.stop="toggle"
    >
      <LucideZap class="size-4.5" />
    </button>
    <div
      v-if="open"
      ref="pop"
      class="absolute bottom-7 left-0 z-30 max-h-72 w-72 overflow-y-auto rounded-xl border border-outline-gray-2 bg-surface-white p-1 shadow-lg"
    >
      <div v-if="res.loading" class="px-2 py-3 text-center text-[11px] text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!replies.length" class="px-2 py-3 text-center text-[11px] text-ink-gray-4">{{ __('Sin respuestas rápidas') }}</div>
      <button
        v-for="r in replies"
        :key="r.name"
        type="button"
        class="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-gray-2"
        @click="pick(r)"
      >
        <div class="truncate text-[12.5px] font-semibold text-ink-gray-8">{{ r.title }}</div>
        <div class="truncate text-[11px] text-ink-gray-5">{{ r.body }}</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createResource } from 'frappe-ui'
import LucideZap from '~icons/lucide/zap'

const props = defineProps({ channel: { type: String, default: '' } })
const emit = defineEmits(['pick'])

const open = ref(false)
const pop = ref(null)
const res = createResource({ url: 'doco_marketing.api.inbox.get_canned_replies' })
const replies = computed(() => res.data || [])

function toggle() {
  open.value = !open.value
  if (open.value) res.submit({ channel: props.channel || undefined })
}
function pick(r) {
  emit('pick', r.body)
  open.value = false
}
function onDocClick(e) {
  if (open.value && pop.value && !pop.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
