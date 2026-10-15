<template>
  <fieldset class="space-y-2">
    <legend class="mb-1 text-sm font-medium text-ink-gray-8">
      {{ label }}
    </legend>
    <p class="text-sm text-ink-gray-6">
      <template v-if="!modelValue.length">{{ allText }}</template>
      <template v-else-if="options">
        {{ __('Only these ({0}):', [modelValue.length]) }}
      </template>
      <template v-else>
        {{
          __('Only {0} chosen. Open «Choose…» to see which.', [
            modelValue.length,
          ])
        }}
      </template>
    </p>
    <ul v-if="modelValue.length && options" class="flex flex-wrap gap-1.5">
      <li
        v-for="id in modelValue"
        :key="id"
        class="flex items-center gap-1 rounded-full bg-surface-gray-2 py-0.5 pl-3 pr-1 text-sm text-ink-gray-8"
      >
        <span class="max-w-[14rem] truncate">{{ nameOf(id) }}</span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-gray-3"
          :aria-label="__('Take out {0}', [nameOf(id)])"
          @click="toggle(id)"
        >
          <FeatherIcon name="x" class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <Button
        class="min-h-11 sm:min-h-0"
        :label="open ? __('Done choosing') : __('Choose…')"
        :loading="loading"
        :disabled="disabled"
        :aria-expanded="open ? 'true' : 'false'"
        @click="toggleOpen"
      />
      <Button
        v-if="modelValue.length"
        variant="ghost"
        class="min-h-11 sm:min-h-0"
        :label="__('Use all')"
        @click="emit('update:modelValue', [])"
      />
    </div>
    <p v-if="disabled && disabledReason" class="text-sm text-ink-gray-6">
      {{ disabledReason }}
    </p>
    <div
      v-if="open && options"
      class="space-y-2 rounded-lg border border-outline-gray-2 p-2"
    >
      <FormControl
        v-if="options.length > 8"
        v-model="search"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="text"
        :placeholder="__('Search')"
        :aria-label="__('Search in {0}', [label])"
      />
      <p v-if="!options.length" class="p-2 text-sm text-ink-gray-6">
        {{ __('Paperless has none yet.') }}
      </p>
      <ul class="max-h-72 overflow-y-auto">
        <li v-for="option in visible" :key="option.id">
          <label
            class="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-surface-gray-1"
          >
            <input
              type="checkbox"
              class="h-5 w-5 shrink-0 rounded"
              :checked="modelValue.includes(option.id)"
              @change="toggle(option.id)"
            />
            <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{
              option.name
            }}</span>
            <span class="shrink-0 text-sm text-ink-gray-5">{{
              __('{0} docs', [option.document_count || 0])
            }}</span>
          </label>
        </li>
      </ul>
    </div>
  </fieldset>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, FeatherIcon, FormControl } from 'frappe-ui'

// A multi-select over a Paperless catalog (document types, correspondents).
// The catalog loads on demand: the host fetches it when `load` fires.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: null },
  label: { type: String, required: true },
  allText: { type: String, required: true },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  disabledReason: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'load'])
const open = ref(false),
  search = ref('')

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  const rows = props.options || []
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
})
function nameOf(id) {
  return props.options?.find((o) => o.id === id)?.name || `#${id}`
}
function toggle(id) {
  const next = props.modelValue.includes(id)
    ? props.modelValue.filter((v) => v !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', next)
}
function toggleOpen() {
  open.value = !open.value
  if (open.value && !props.options) emit('load')
}
</script>
