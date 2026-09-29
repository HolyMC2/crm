<!--
  Template variables the backend could not fill ({{hole}}), shown as small
  memory-backed inputs under the composer. Enter or picking a suggestion emits
  `fill` so the composer substitutes the value; the value is remembered under
  `hole.<template>.<key>` for this contact.
-->
<template>
  <div
    v-if="holes.length"
    class="flex flex-wrap items-center gap-1.5"
    role="group"
    :aria-label="__('Datos por completar')"
  >
    <span class="text-[11px] text-ink-gray-5">{{ __('Completa:') }}</span>
    <MemoryInput
      v-for="h in holes"
      :key="h.key"
      v-model="values[h.key]"
      class="w-36"
      :scope="`hole.${template}.${h.key}`"
      :context="context"
      :placeholder="h.label || h.key"
      :aria-label="h.label || h.key"
      input-class="w-full rounded-full border border-outline-gray-2 bg-surface-gray-2 px-2.5 py-0.5 text-xs text-ink-gray-8 placeholder-ink-gray-5 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0"
      @pick="(v) => fill(h.key, v)"
      @enter="(e) => onEnter(e, h.key)"
    />
    <button
      type="button"
      class="rounded-full px-1.5 text-xs text-ink-gray-5 hover:bg-surface-gray-2"
      :aria-label="__('Descartar')"
      @click="emit('dismiss')"
    >
      ✕
    </button>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import MemoryInput from '@/components/Composer/MemoryInput.vue'
import { remember } from '@/composables/fieldMemory'

const props = defineProps({
  holes: { type: Array, default: () => [] },
  template: { type: String, default: '' },
  context: { type: String, default: '' },
})
const emit = defineEmits(['fill', 'dismiss'])

const values = reactive({})

function fill(key, value) {
  const v = String(value || '').trim()
  if (!v) return
  remember([
    {
      scope: `hole.${props.template}.${key}`,
      value: v,
      context: props.context,
    },
  ])
  emit('fill', { key, value: v })
  delete values[key]
}

function onEnter(e, key) {
  e.preventDefault()
  e.stopPropagation()
  fill(key, values[key])
}
</script>
