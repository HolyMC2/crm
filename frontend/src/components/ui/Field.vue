<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (1df9eacee039). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The kit's field (Material 3 filled): container-highest, 16 px corners,
       the label inside above the value, 56 px on a phone and 52 on a desk, a
       2 px ring of the accent on focus. An error line under it and nothing
       else: no hint line. Text, number, money (the currency's symbol before
       the value), select and textarea. -->
  <div :class="attrs.class" :style="attrs.style" data-kit-field>
    <label
      :for="inputId"
      class="ui-field relative flex w-full cursor-text flex-col justify-center rounded-6 bg-[var(--muelle-surface-container-highest)] px-4 focus-within:ring-2 focus-within:ring-[var(--muelle-accent)]"
      :class="[
        type === 'textarea' ? 'min-h-24 py-2' : 'h-14 sm:h-[52px]',
        error ? 'ring-2 ring-outline-red-3' : '',
        disabled ? 'cursor-default opacity-60' : '',
      ]"
    >
      <span
        v-if="label"
        class="truncate text-xs font-medium"
        :class="error ? 'text-ink-red-7' : 'text-[var(--muelle-on-surface-variant)]'"
        >{{ label }}<span v-if="required" aria-hidden="true"> *</span></span
      >
      <span class="flex min-w-0 items-baseline gap-1">
        <span
          v-if="type === 'money' && symbol"
          class="flex-none text-base text-ink-gray-7"
          aria-hidden="true"
          >{{ symbol }}</span
        >
        <select
          v-if="type === 'select'"
          :id="inputId"
          ref="control"
          :value="modelValue ?? ''"
          :disabled="disabled"
          :required="required"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? errorId : undefined"
          class="-ml-1 min-w-0 flex-1 appearance-none border-0 bg-transparent bg-none p-0 pl-1 pr-6 text-base text-ink-gray-9 focus:ring-0"
          v-bind="controlAttrs"
          @change="emit('update:modelValue', $event.target.value)"
        >
          <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
          <option v-for="o in options" :key="o.value" :value="o.value">
            {{ o.label ?? o.value }}
          </option>
        </select>
        <textarea
          v-else-if="type === 'textarea'"
          :id="inputId"
          ref="control"
          :value="modelValue ?? ''"
          :placeholder="placeholder"
          :disabled="disabled"
          :required="required"
          :rows="rows"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? errorId : undefined"
          class="min-w-0 flex-1 resize-y border-0 bg-transparent p-0 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
          v-bind="controlAttrs"
          @input="emit('update:modelValue', $event.target.value)"
        />
        <input
          v-else
          :id="inputId"
          ref="control"
          :value="modelValue ?? ''"
          :type="type === 'number' ? 'number' : type === 'money' ? 'text' : type"
          :inputmode="
            type === 'money' ? 'decimal' : type === 'number' ? 'numeric' : undefined
          "
          :placeholder="placeholder"
          :disabled="disabled"
          :required="required"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? errorId : undefined"
          class="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-base tabular-nums text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
          v-bind="controlAttrs"
          @input="emit('update:modelValue', read($event.target.value))"
        />
        <span
          v-if="type === 'select'"
          class="lucide-chevron-down pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-gray-6"
          aria-hidden="true"
        />
      </span>
    </label>
    <p
      v-if="error"
      :id="errorId"
      role="alert"
      class="mt-1 px-4 text-sm text-ink-red-7"
      data-kit-field-error
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup>
import { computed, ref, useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: [String, Number, null], default: '' },
  label: { type: String, default: '' },
  // text, number, money, select, textarea, or any input type (email, tel, date)
  type: { type: String, default: 'text' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  // money: the code whose symbol leads the value (MXN → $, EUR → €)
  currency: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  rows: { type: Number, default: 3 },
  id: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const control = ref(null)
const ownId = useId()
const inputId = computed(() => props.id || ownId)
const errorId = `${ownId}-error`
const controlAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'),
  ),
)
const symbol = computed(() => {
  if (!props.currency) return ''
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: props.currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value || ''
    )
  } catch {
    return props.currency
  }
})
// A number field hands back a number (or '' while empty); text stays text.
function read(value) {
  if (props.type !== 'number') return value
  return value === '' ? '' : Number(value)
}

defineExpose({ focus: (options) => control.value?.focus(options) })
</script>
