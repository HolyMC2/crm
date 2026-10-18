<template>
  <!-- One setting: what it is called, what it does, its value in words, when
       it applies, and why it is locked when the worker can't change it. A
       switch toggles in place; any other row opens its editor. -->
  <div
    class="flex items-start gap-3 py-3"
    :class="field.applies === false ? 'opacity-70' : ''"
    data-ajustes-field
    :data-fieldname="field.fieldname"
  >
    <component
      :is="tappable ? 'button' : 'div'"
      :type="tappable ? 'button' : undefined"
      class="min-w-0 flex-1 text-left"
      :class="tappable ? 'min-h-11 rounded-lg focus-visible:outline-2' : ''"
      :aria-label="tappable ? __('Cambiar {0}', [field.label]) : undefined"
      @click="tappable && emit('edit', field)"
    >
      <span class="flex flex-wrap items-baseline gap-x-2">
        <span class="break-words text-base font-medium text-ink-gray-9">{{
          field.label
        }}</span>
        <span
          v-if="pending"
          class="rounded-full bg-surface-amber-2 px-2 text-xs font-medium leading-5 text-ink-amber-9"
          >{{ __('Sin guardar') }}</span
        >
      </span>
      <span
        v-if="!isSwitch"
        class="mt-0.5 block break-words text-base"
        :class="shownSet ? 'text-ink-gray-8' : 'text-ink-gray-5'"
        data-ajustes-value
        >{{ shown }}</span
      >
      <span
        v-if="field.help"
        class="mt-0.5 block break-words text-sm text-ink-gray-6"
        >{{ field.help }}</span
      >
      <span
        v-if="field.when"
        class="mt-1 flex items-start gap-1 text-sm text-ink-gray-6"
      >
        <span
          class="lucide-git-branch mt-0.5 size-4 flex-none"
          aria-hidden="true"
        />
        <span class="min-w-0 break-words"
          >{{ field.when
          }}<template v-if="field.applies === false">
            {{ __('Ahora no aplica.') }}</template
          ></span
        >
      </span>
      <span
        v-if="field.required_when"
        class="mt-1 block break-words text-sm text-ink-gray-6"
        >{{ field.required_when }}</span
      >
      <span
        v-if="!field.can_write && field.reason"
        class="mt-1 flex items-start gap-1 text-sm text-ink-gray-6"
        data-ajustes-locked
      >
        <span class="lucide-lock mt-0.5 size-4 flex-none" aria-hidden="true" />
        <span class="min-w-0 break-words">{{ field.reason }}</span>
      </span>
    </component>
    <AjustesSwitch
      v-if="isSwitch"
      :model-value="Boolean(value)"
      :label="field.label"
      :disabled="!field.can_write"
      @update:model-value="emit('toggle', field, $event ? 1 : 0)"
    />
    <span
      v-else-if="tappable"
      class="lucide-chevron-right mt-3 size-5 flex-none text-ink-gray-5"
      aria-hidden="true"
    />
  </div>
</template>
<script setup>
import { computed } from 'vue'
import AjustesSwitch from './AjustesSwitch.vue'
import { pendingDisplay } from './ajustes'

const props = defineProps({
  field: { type: Object, required: true },
  value: { type: [String, Number, Boolean, null], default: null },
  pending: { type: Boolean, default: false },
  rowsCount: { type: Number, default: null },
})
const emit = defineEmits(['edit', 'toggle'])

const isSwitch = computed(() => props.field.fieldtype === 'Check')
const isTable = computed(() =>
  ['Table', 'Table MultiSelect'].includes(props.field.fieldtype),
)
// Tables open even when locked: the worker can still read their rows.
const tappable = computed(
  () => !isSwitch.value && (props.field.can_write || isTable.value),
)
const shown = computed(() => {
  if (isTable.value && props.rowsCount !== null)
    return props.rowsCount === 0
      ? __('Sin filas')
      : props.rowsCount === 1
        ? __('1 fila')
        : __('{0} filas', [props.rowsCount])
  return props.pending
    ? pendingDisplay(props.field, props.value)
    : props.field.display
})
const shownSet = computed(() =>
  isTable.value ? props.rowsCount > 0 : props.pending || props.field.set,
)
</script>
