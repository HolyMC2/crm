<!-- One labelled row of toggle chips for a search panel: 44 px pills that
     wrap, never scroll sideways. `multiple` toggles values in an array;
     otherwise one value is picked (tapping it again picks `clearValue`). -->
<template>
  <section :aria-label="label">
    <p v-if="label" class="mb-1.5 text-xs font-medium text-ink-gray-6">
      {{ label }}
    </p>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="o in shown"
        :key="o.value"
        type="button"
        :class="chipClass(isOn(o.value))"
        :aria-pressed="isOn(o.value)"
        :title="o.title || undefined"
        :data-testid="testid ? `${testid}-${o.value}` : undefined"
        @click="pick(o.value)"
      >
        <span v-if="o.color" v-bind="dotBinding(o.color)" aria-hidden="true" />
        {{ o.label }}
        <span v-if="o.count != null" class="text-[10px] opacity-70">{{
          o.count
        }}</span>
      </button>
      <button
        v-if="overflow"
        type="button"
        :class="chipClass(false)"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? __('Ver menos')
            : __('+{0} más', [options.length - shown.length])
        }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { chipClass, dotBinding } from './chipClass'

const props = defineProps({
  label: { type: String, default: '' },
  // [{ value, label, color?, count?, title? }]
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  // single mode: the value a second tap on the picked chip returns to
  clearValue: { type: [String, Number, null], default: '' },
  testid: { type: String, default: '' },
  // long lists (companies, owners) show this many, the picked ones always
  // included, and «+N más» opens the rest in place
  max: { type: Number, default: 8 },
})
const model = defineModel({ type: [Array, String, Number, null] })

const expanded = ref(false)
const shown = computed(() => {
  if (expanded.value || props.options.length <= props.max) return props.options
  const head = props.options.slice(0, props.max)
  const picked = props.options.filter((o) => isOn(o.value) && !head.includes(o))
  return [...head, ...picked]
})
const overflow = computed(() => props.options.length > props.max)
function isOn(value) {
  return props.multiple
    ? (model.value || []).includes(value)
    : model.value === value
}
function pick(value) {
  if (props.multiple) {
    const list = model.value || []
    model.value = list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value]
  } else model.value = isOn(value) ? props.clearValue : value
}
</script>
