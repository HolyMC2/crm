<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (08716fb45b7a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The kit's switch (Material 3): a 52 x 32 track in a 44 px target. On,
       the track takes the shop's accent and the thumb grows with a check; off,
       a hollow track and a small thumb. A drop-in for frappe-ui's <Switch>
       (v-model, label, description, disabled; `size` is accepted and
       ignored): with a label it is a row, the label leading and the switch
       trailing, and a tap anywhere on the row turns it. -->
  <component
    :is="label || description || $slots.label ? 'div' : 'span'"
    :class="[
      label || description || $slots.label
        ? 'flex min-h-11 items-center gap-3'
        : 'inline-flex',
      padded ? 'state-layer -mx-2 rounded-5 px-2' : '',
      controlPosition === 'start' ? 'flex-row-reverse justify-end' : '',
      attrs.class,
    ]"
    :style="attrs.style"
    data-kit-switch-row
    @click="onRow"
  >
    <span
      v-if="label || description || $slots.label"
      class="flex min-w-0 flex-1 flex-col"
    >
      <span
        :id="labelId"
        class="text-base text-ink-gray-9"
        :class="disabled ? 'text-ink-gray-5' : ''"
        ><slot name="label">{{ label }}</slot></span
      >
      <span
        v-if="description || $slots.description"
        class="text-sm text-ink-gray-6"
        ><slot name="description">{{ description }}</slot></span
      >
    </span>
    <button
      :id="id"
      ref="control"
      type="button"
      role="switch"
      :aria-checked="String(modelValue)"
      :aria-label="ariaLabel"
      :aria-labelledby="label || $slots.label ? labelId : undefined"
      :disabled="disabled"
      class="flex size-11 flex-none items-center justify-center disabled:opacity-40"
      :class="wide ? 'w-14' : ''"
      v-bind="controlAttrs"
      data-kit-switch
      @click.stop.prevent="turn"
    >
      <span
        class="relative inline-flex h-8 w-[52px] items-center rounded-full border-2 transition-colors"
        :class="
          modelValue
            ? 'border-transparent bg-[var(--muelle-accent)]'
            : 'border-[var(--muelle-outline)] bg-[var(--muelle-surface-container-highest)]'
        "
      >
        <span
          class="absolute flex items-center justify-center rounded-full transition-all"
          :class="
            modelValue
              ? 'left-[22px] size-6 bg-[var(--muelle-accent-ink)] text-[var(--muelle-accent)]'
              : 'left-1 size-4 bg-[var(--muelle-outline)]'
          "
        >
          <span
            v-if="modelValue"
            class="lucide-check size-4"
            aria-hidden="true"
          />
        </span>
      </span>
    </button>
  </component>
</template>

<script setup>
import { computed, ref, useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  // a lone switch takes a 56 px wide target (AjustesSwitch's rows)
  wide: { type: Boolean, default: true },
  padded: { type: Boolean, default: false },
  controlPosition: { type: String, default: 'end' },
  // frappe-ui's sizes: accepted, one Material size for all
  size: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue', 'change'])
const attrs = useAttrs()
const control = ref(null)
const labelId = useId()

// class and style stay on the row; the rest (aria-*, data-*, listeners) go to
// the switch itself, the interactive element.
const controlAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'),
  ),
)
const ariaLabel = computed(() =>
  props.label ? undefined : attrs['aria-label'] || undefined,
)

function turn() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
  emit('change', !props.modelValue)
}
function onRow(event) {
  if (!(props.label || props.description)) return
  if (control.value?.contains(event.target)) return
  turn()
}

defineExpose({ focus: (options) => control.value?.focus(options) })
</script>
