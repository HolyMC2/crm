<template>
  <!-- A labelled row of the kit's chips for one setting: `multiple` toggles
       values (at least one stays on unless `allowEmpty`), otherwise one is picked. A tap emits
       the new selection at once; the page saves it. A disabled chip (a
       channel not linked) says why in its own words. -->
  <section :aria-label="label || undefined" class="py-1">
    <p v-if="label" class="text-sm font-medium text-ink-gray-7">
      {{ label }}
    </p>
    <div class="flex flex-wrap gap-x-2">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        :class="[
          chipClass(isOn(option.value)),
          option.disabled ? 'text-ink-gray-5' : '',
        ]"
        :aria-pressed="isOn(option.value)"
        :disabled="option.disabled"
        :data-testid="
          testid ? `${testid}-${option.value || 'base'}` : undefined
        "
        @click="pick(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </section>
</template>
<script setup>
import { chipClass } from '@/components/ui/chipClass'

const props = defineProps({
  label: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  /** A multiple row that may end with nothing on (channels: the Desk always gets it). */
  allowEmpty: { type: Boolean, default: false },
  testid: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

function isOn(value) {
  return props.selected.some((one) => String(one) === String(value))
}

function pick(value) {
  if (!props.multiple) {
    if (!isOn(value)) emit('pick', [value])
    return
  }
  const now = isOn(value)
    ? props.selected.filter((one) => String(one) !== String(value))
    : [...props.selected, value]
  if (now.length || props.allowEmpty) emit('pick', now)
}
</script>
