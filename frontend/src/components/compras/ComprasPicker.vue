<template>
  <div class="relative">
    <label :for="inputId" class="mb-1.5 block text-xs text-ink-gray-5">{{
      label
    }}</label>
    <input
      :id="inputId"
      v-model="query"
      type="search"
      autocomplete="off"
      role="combobox"
      :aria-controls="listId"
      :aria-expanded="open"
      :aria-invalid="invalid || undefined"
      :disabled="disabled"
      :placeholder="placeholder"
      class="form-input block min-h-11 w-full rounded-lg text-base sm:min-h-8 sm:text-sm"
      :class="invalid ? 'border-outline-red-3' : ''"
      @focus="show"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="pick(options[active])"
      @keydown.esc="close"
      @blur="onBlur"
    />
    <div
      v-if="open"
      :id="listId"
      role="listbox"
      :aria-label="label"
      class="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-outline-gray-2 bg-surface-modal p-1 shadow-lg"
    >
      <p v-if="loading" role="status" class="px-3 py-2 text-sm text-ink-gray-6">
        {{ __('Searching…', null, 'Compras') }}
      </p>
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        role="option"
        :aria-selected="option.value === modelValue"
        class="flex min-h-11 w-full flex-col items-start justify-center rounded-md px-3 py-1 text-left text-sm hover:bg-surface-gray-2"
        :class="index === active ? 'bg-surface-gray-2' : ''"
        @mousedown.prevent="pick(option)"
      >
        <span class="font-medium text-ink-gray-9">{{ option.label }}</span>
        <span
          v-if="option.label !== option.value || option.hint"
          class="text-xs text-ink-gray-5"
          >{{
            [option.value !== option.label ? option.value : '', option.hint]
              .filter(Boolean)
              .join(' · ')
          }}</span
        >
      </button>
      <p
        v-if="!loading && !options.length"
        class="px-3 py-2 text-sm text-ink-gray-6"
      >
        {{ failed ? __('Could not search. Try again.') : emptyText }}
      </p>
    </div>
    <p v-if="hint" class="mt-1 text-xs text-ink-gray-5">{{ hint }}</p>
  </div>
</template>
<script setup>
import { onBeforeUnmount, ref, useId, watch } from 'vue'

// Search-as-you-type over a permission-filtered Compras picker; only a picked
// option becomes the value, so a typed name never reaches the server unchecked.
const props = defineProps({
  modelValue: { type: String, default: '' },
  display: { type: String, default: '' },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  disabled: Boolean,
  invalid: Boolean,
  clearOnPick: Boolean,
  load: { type: Function, required: true },
})
const emit = defineEmits(['update:modelValue', 'pick'])
const inputId = useId()
const listId = useId()
const query = ref(props.display || props.modelValue || '')
const options = ref([])
const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const active = ref(0)
let timer = 0
let ticket = 0

watch(
  () => [props.modelValue, props.display],
  () => {
    if (!open.value) query.value = props.display || props.modelValue || ''
  },
)
watch(query, () => {
  if (!open.value) return
  window.clearTimeout(timer)
  timer = window.setTimeout(search, 250)
})
async function search() {
  const mine = ++ticket
  loading.value = true
  failed.value = false
  try {
    const rows = await props.load(
      query.value === (props.display || props.modelValue)
        ? ''
        : query.value.trim(),
    )
    if (mine === ticket) {
      options.value = rows || []
      active.value = 0
    }
  } catch {
    if (mine === ticket) {
      options.value = []
      failed.value = true
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}
function show() {
  open.value = true
  search()
}
function close() {
  open.value = false
  query.value = props.display || props.modelValue || ''
}
function onBlur() {
  window.setTimeout(close, 120)
}
function move(step) {
  if (!open.value) return show()
  const count = options.value.length
  if (count) active.value = (active.value + step + count) % count
}
function pick(option) {
  if (!option) return
  emit('update:modelValue', option.value)
  emit('pick', option)
  open.value = false
  query.value = props.clearOnPick ? '' : option.label
}
onBeforeUnmount(() => window.clearTimeout(timer))
</script>
