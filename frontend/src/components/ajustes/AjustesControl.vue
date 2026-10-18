<template>
  <!-- One editable value, its control chosen by the field's type. -->
  <div data-ajustes-control :data-kind="kind">
    <label
      v-if="kind === 'switch'"
      :for="id"
      class="flex min-h-11 items-center gap-3"
    >
      <span class="min-w-0 flex-1 text-base">{{
        modelValue ? __('Activado') : __('Apagado')
      }}</span>
      <AjustesSwitch
        :id="id"
        :model-value="Boolean(modelValue)"
        :label="field.label"
        @update:model-value="emit('update:modelValue', $event ? 1 : 0)"
      />
    </label>
    <div
      v-else-if="kind === 'select'"
      class="grid gap-1"
      role="radiogroup"
      :aria-label="field.label"
    >
      <label
        v-for="option in field.options"
        :key="option.value"
        class="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-gray-2"
      >
        <input
          type="radio"
          class="size-5 flex-none"
          :name="id"
          :value="option.value"
          :checked="(modelValue ?? '') === option.value"
          @change="emit('update:modelValue', option.value)"
        />
        <span class="min-w-0 flex-1 break-words text-base">{{
          option.label
        }}</span>
      </label>
    </div>
    <AjustesLink
      v-else-if="kind === 'link'"
      :id="id"
      :model-value="modelValue || ''"
      :doctype="field.link"
      :label="field.label"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <textarea
      v-else-if="kind === 'text'"
      :id="id"
      :value="plainText"
      rows="4"
      class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base"
      :aria-label="field.label"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <input
      v-else
      :id="id"
      :value="modelValue ?? ''"
      :type="inputType"
      :inputmode="inputMode"
      :step="step"
      class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base"
      :aria-label="field.label"
      @input="onInput($event.target.value)"
    />
  </div>
</template>
<script setup>
import { computed } from 'vue'
import AjustesLink from './AjustesLink.vue'
import AjustesSwitch from './AjustesSwitch.vue'
import { controlKind } from './ajustes'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number, Boolean, null], default: null },
  id: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const kind = computed(() => controlKind(props.field.fieldtype))
const inputType = computed(() => {
  if (kind.value === 'number') return 'number'
  if (kind.value === 'date') return 'date'
  if (kind.value === 'datetime') return 'datetime-local'
  return 'text'
})
const inputMode = computed(() => {
  if (kind.value !== 'number') return undefined
  return props.field.fieldtype === 'Int' ? 'numeric' : 'decimal'
})
const step = computed(() =>
  kind.value === 'number'
    ? props.field.fieldtype === 'Int'
      ? '1'
      : 'any'
    : undefined,
)
// A rich-text description is edited as plain text here.
const plainText = computed(() =>
  String(props.modelValue ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]*>/g, ''),
)
function onInput(value) {
  if (kind.value === 'number')
    emit(
      'update:modelValue',
      value === ''
        ? null
        : props.field.fieldtype === 'Int'
          ? parseInt(value, 10)
          : Number(value),
    )
  else emit('update:modelValue', value)
}
</script>
