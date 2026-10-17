<template>
  <!-- One horizontal row of filter chips (Shell SPEC §2.2.4, M3 filter chip),
       never wrapping: it scrolls sideways with a fade at the end. Filters
       that do not fit as chips go in the «Filtros» sheet (the #filters slot),
       whose chip shows how many are on. -->
  <div class="relative" data-ui-filter-chips>
    <div
      ref="row"
      role="group"
      :aria-label="label || __('Filters')"
      class="flex flex-nowrap items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      :class="fade ? 'ui-chips-fade' : ''"
      @scroll.passive="updateFade"
    >
      <button
        v-if="$slots.filters"
        type="button"
        class="flex min-h-11 flex-none items-center"
        aria-haspopup="dialog"
        :aria-label="
          filtersCount
            ? __('{0} filters on', [filtersCount])
            : filtersLabel || __('Filters')
        "
        data-ui-filters-chip
        @click="sheet = true"
      >
        <span :class="chipClass(filtersCount > 0)">
          <span
            class="lucide-sliders-horizontal size-4 flex-none"
            aria-hidden="true"
          />
          {{ filtersLabel || __('Filters') }}
          <span
            v-if="filtersCount"
            class="min-w-5 rounded-full bg-surface-gray-10 px-1.5 text-center text-xs font-semibold leading-5 text-ink-base"
            aria-hidden="true"
            >{{ filtersCount }}</span
          >
        </span>
      </button>
      <button
        v-for="chip in chips"
        :key="chip.value"
        type="button"
        class="flex min-h-11 flex-none items-center"
        :aria-pressed="String(isOn(chip.value))"
        :data-chip="chip.value"
        @click="toggle(chip.value)"
      >
        <span :class="chipClass(isOn(chip.value))">
          <span
            v-if="isOn(chip.value)"
            class="lucide-check size-4 flex-none"
            aria-hidden="true"
          />
          <span
            v-else-if="chip.icon"
            :class="[chip.icon, 'size-4 flex-none']"
            aria-hidden="true"
          />
          <span class="whitespace-nowrap">{{ chip.label }}</span>
          <span
            v-if="chip.count !== undefined && chip.count !== null"
            class="tabular-nums"
            :class="isOn(chip.value) ? 'text-ink-gray-8' : 'text-ink-gray-6'"
            >{{ chip.count }}</span
          >
        </span>
      </button>
    </div>
    <BottomSheet
      v-if="$slots.filters"
      v-model:open="sheet"
      :title="filtersLabel || __('Filters')"
    >
      <slot name="filters" :close="() => (sheet = false)" />
      <template #actions>
        <Button
          v-if="filtersCount"
          variant="ghost"
          size="lg"
          class="w-full"
          :label="__('Clear filters')"
          @click="$emit('clear-filters')"
        />
        <Button
          variant="solid"
          size="lg"
          class="w-full"
          :label="__('Show results')"
          @click="apply"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  /** The chosen value; an array with `multiple`. '' means «all». */
  modelValue: { type: [String, Number, Array], default: '' },
  /** [{ value, label, count?, icon? }] */
  chips: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  /** Single choice: tapping the chosen chip again clears it back to ''. */
  deselectable: { type: Boolean, default: true },
  label: { type: String, default: '' },
  filtersLabel: { type: String, default: '' },
  /** How many filters in the sheet are on (shown on its chip). */
  filtersCount: { type: Number, default: 0 },
})
const emit = defineEmits([
  'update:modelValue',
  'clear-filters',
  'apply-filters',
])
const sheet = ref(false)
const row = ref(null)
const fade = ref(false)

function chipClass(on) {
  return [
    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
    on
      ? 'border-transparent bg-surface-gray-3 text-ink-gray-9'
      : 'border-outline-gray-2 text-ink-gray-7',
  ]
}
function isOn(value) {
  return props.multiple
    ? (props.modelValue || []).includes(value)
    : props.modelValue === value
}
function toggle(value) {
  if (props.multiple) {
    const current = props.modelValue || []
    emit(
      'update:modelValue',
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    )
  } else if (props.modelValue === value) {
    if (props.deselectable) emit('update:modelValue', '')
  } else emit('update:modelValue', value)
}
function apply() {
  sheet.value = false
  emit('apply-filters')
}

// The fade shows only while there is more row to scroll to.
function updateFade() {
  const el = row.value
  fade.value = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
let observer = null
onMounted(() => {
  updateFade()
  if (typeof ResizeObserver !== 'undefined' && row.value) {
    observer = new ResizeObserver(updateFade)
    observer.observe(row.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.chips,
  () => nextTick(updateFade),
  { deep: true },
)
</script>
<style>
.ui-chips-fade {
  mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);
}
</style>
