<template>
  <!-- A labelled picker (the shell's control, not the browser's native select):
       the chosen value on a row, and its choices one tap below it. No second
       sheet over the form: the list opens in place and collapses on a choice. -->
  <div class="relative">
    <span
      class="mb-1.5 block text-sm font-medium text-ink-gray-7"
      aria-hidden="true"
      >{{ label }}</span
    >
    <button
      type="button"
      class="flex min-h-12 w-full items-center gap-3 rounded-lg border bg-surface-base px-3 text-left text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-gray-4"
      :class="open ? 'border-outline-gray-4' : 'border-outline-gray-2'"
      :aria-label="showLabel"
      :aria-expanded="String(open)"
      aria-haspopup="listbox"
      :data-field="field"
      @click="toggle"
    >
      <span
        class="min-w-0 flex-1 truncate"
        :class="selected ? 'text-ink-gray-9' : 'text-ink-gray-5'"
        >{{ selected ? selected.label : placeholder }}</span
      >
      <span
        v-if="selected?.meta"
        class="hidden max-w-[45%] truncate text-sm text-ink-gray-6 sm:block"
        >{{ selected.meta }}</span
      >
      <span
        class="lucide-chevron-down size-4 flex-none text-ink-gray-5 transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="open"
      ref="listEl"
      role="listbox"
      :aria-label="label"
      class="mt-2 max-h-72 overflow-y-auto rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-sm"
    >
      <li v-for="option in options" :key="option.value" role="none">
        <button
          type="button"
          role="option"
          :aria-selected="String(option.value === modelValue)"
          class="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-base hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :class="
            option.value === modelValue
              ? 'bg-surface-gray-2 font-medium'
              : 'text-ink-gray-8'
          "
          @click="choose(option.value)"
        >
          <span
            class="lucide-check size-4 flex-none text-ink-blue-link"
            :class="option.value === modelValue ? '' : 'invisible'"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <span
            v-if="option.meta"
            class="max-w-[45%] truncate text-sm text-ink-gray-6"
            >{{ option.meta }}</span
          >
        </button>
      </li>
    </ul>
    <p v-if="hint" class="mt-1.5 text-sm text-ink-gray-6">{{ hint }}</p>
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'

// The choices come from the server (the ready expense types, the people who may
// decide); this control only shows them and hands the picked value back.
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  /** [{ value, label, meta? }] */
  options: { type: Array, default: () => [] },
  /** The form's field key, for «point at what is missing». */
  field: { type: String, default: '' },
  hint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const open = ref(false)
const listEl = ref(null)
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
)
const showLabel = computed(() =>
  selected.value ? `${props.label}: ${selected.value.label}` : props.label,
)
async function toggle() {
  open.value = !open.value
  if (!open.value) return
  // The sheet scrolls: bring the choices into sight, never half under the actions.
  await nextTick()
  listEl.value?.scrollIntoView?.({ block: 'nearest' })
}
function choose(value) {
  emit('update:modelValue', value)
  open.value = false
}
</script>
