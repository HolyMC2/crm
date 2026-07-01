<!--
  Column visibility picker for the redesigned dense list toolbars. Mirrors
  FilterPopover's look, but: fixed columns render disabled-checked, at least one
  toggleable column must stay visible, and "Restablecer" resets to defaults
  (an empty clear would collapse the grid). v-model:selected = visible toggleable keys.
-->
<template>
  <div class="relative inline-block">
    <button
      class="flex items-center gap-1 rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12px] font-medium text-ink-gray-7"
      :title="__('Columnas')"
      @click="open = !open"
    >
      ⋮⋮ {{ __('Columnas') }}
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute right-0 z-[100] mt-1 min-w-[190px] overflow-hidden rounded-[10px] border border-outline-gray-2 bg-surface-white"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12)"
      >
        <div
          class="border-b border-outline-gray-1 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
        >
          {{ __('Columnas') }}
        </div>
        <div class="max-h-[280px] overflow-y-auto py-1">
          <label
            v-for="c in columns"
            :key="c.key"
            class="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-gray-8"
            :class="c.fixed ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-surface-gray-2'"
          >
            <input
              type="checkbox"
              style="accent-color: #16a34a"
              :checked="c.fixed || selected.includes(c.key)"
              :disabled="c.fixed"
              @change="toggle(c.key)"
            />
            {{ c.label }}
          </label>
        </div>
        <div class="flex justify-end border-t border-outline-gray-1 px-3 py-2">
          <button class="text-[12px] text-ink-gray-5" @click="emit('reset')">{{ __('Restablecer') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  // [{ key, label, fixed? }] — fixed columns can't be hidden
  columns: { type: Array, default: () => [] },
  // visible toggleable keys
  selected: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:selected', 'reset'])
const open = ref(false)

function toggle(key) {
  const col = props.columns.find((c) => c.key === key)
  if (col?.fixed) return
  const has = props.selected.includes(key)
  // never let the last toggleable column be turned off (grid would collapse)
  if (has && props.selected.length <= 1) return
  emit('update:selected', has ? props.selected.filter((k) => k !== key) : [...props.selected, key])
}
</script>
