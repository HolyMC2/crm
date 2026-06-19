<!-- Generic checkbox filter popover for the redesigned list toolbars (handoff §5.2). -->
<template>
  <div class="relative inline-block">
    <button
      class="flex items-center gap-1 rounded-[7px] border px-[9px] py-1 text-[12px] font-medium"
      :style="
        selected.length
          ? 'color:#16a34a;background:#e9f7ef;border-color:#c7ecd5'
          : 'color:#1c2230;background:#f4f5f7;border-color:#e4e7ec'
      "
      @click="open = !open"
    >
      {{ label }}
      <span v-if="selected.length" class="font-semibold">· {{ selected.length }}</span>
      ⌄
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute left-0 z-[100] mt-1 min-w-[180px] overflow-hidden rounded-[10px] border border-outline-gray-2 bg-surface-white"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12)"
      >
        <div
          class="border-b border-outline-gray-1 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
        >
          {{ label }}
        </div>
        <div class="max-h-[260px] overflow-y-auto py-1">
          <label
            v-for="o in options"
            :key="o.value"
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-ink-gray-8 hover:bg-surface-gray-2"
          >
            <input
              type="checkbox"
              :checked="selected.includes(o.value)"
              style="accent-color: #16a34a"
              @change="toggle(o.value)"
            />
            <span v-if="o.color" class="h-2 w-2 rounded-full" :style="`background:${o.color}`" />
            {{ o.label }}
          </label>
        </div>
        <div class="flex justify-between border-t border-outline-gray-1 px-3 py-2">
          <button class="text-[12px] text-ink-gray-5" @click="clear">{{ __('Limpiar') }}</button>
          <button class="text-[12px] font-semibold text-ink-green-3" @click="open = false">
            {{ __('Aplicar') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:selected'])
const open = ref(false)

function toggle(v) {
  const next = props.selected.includes(v)
    ? props.selected.filter((x) => x !== v)
    : [...props.selected, v]
  emit('update:selected', next)
}
function clear() {
  emit('update:selected', [])
}
</script>
