<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (1ceb2df0a0ad). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- One horizontal row of filter chips (Shell SPEC §2.2.4, M3 filter chip),
       never wrapping: it scrolls sideways with a fade at the end. Filters
       that do not fit as chips go in the «Filtros» sheet (the #filters slot),
       whose chip shows how many are on. -->
  <!-- In a search panel (`inline`): the chips wrap and the «Filtros» content
       sits in place under them, no sheet. -->
  <div v-if="inline" class="space-y-3" data-ui-filter-chips>
    <section :aria-label="label || t('Filters')">
      <p v-if="label" class="mb-1.5 text-xs font-medium text-ink-gray-6">
        {{ label }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="chip in chips"
          :key="chip.value"
          type="button"
          :class="panelChip(isOn(chip.value))"
          :aria-pressed="String(isOn(chip.value))"
          :data-chip="chip.value"
          @click="toggle(chip.value)"
        >
          <span
            v-if="chip.icon"
            :class="[chip.icon, 'size-3.5 flex-none']"
            aria-hidden="true"
          />
          {{ chip.label }}
          <span
            v-if="chip.count !== undefined && chip.count !== null"
            class="text-[10px] tabular-nums opacity-70"
            >{{ chip.count }}</span
          >
        </button>
      </div>
    </section>
    <section v-if="$slots.filters" :aria-label="filtersLabel || t('Filters')">
      <div class="mb-1.5 flex items-center justify-between">
        <p class="text-xs font-medium text-ink-gray-6">
          {{ filtersLabel || t('Filters') }}
        </p>
        <button
          v-if="filtersCount"
          type="button"
          class="-my-3 min-h-11 px-1 text-xs text-ink-gray-5 underline"
          @click="$emit('clear-filters')"
        >
          {{ t('Clear filters') }}
        </button>
      </div>
      <slot name="filters" :close="() => {}" />
    </section>
  </div>
  <!-- Search panel closed (`summary`): only what narrows the list, each chip
       with its own ×. Renders nothing in the default view. -->
  <div
    v-else-if="summary"
    v-show="onChips.length || filtersCount"
    class="flex flex-wrap gap-1.5"
    data-ui-filter-summary
  >
    <button
      v-for="chip in onChips"
      :key="chip.value"
      type="button"
      :class="panelChip(true)"
      :aria-label="t('Remove filter {0}', [chip.label])"
      @click="toggle(chip.value)"
    >
      {{ chip.label }}
      <span class="lucide-x size-3 flex-none" aria-hidden="true" />
    </button>
    <button
      v-if="filtersCount"
      type="button"
      :class="panelChip(true)"
      :aria-label="t('Clear filters')"
      @click="$emit('clear-filters')"
    >
      {{ t('{0} filters on', [filtersCount]) }}
      <span class="lucide-x size-3 flex-none" aria-hidden="true" />
    </button>
  </div>
  <div v-else class="relative" data-ui-filter-chips>
    <div
      ref="row"
      role="group"
      :aria-label="label || t('Filters')"
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
            ? t('{0} filters on', [filtersCount])
            : filtersLabel || t('Filters')
        "
        data-ui-filters-chip
        @click="sheet = true"
      >
        <span :class="chipClass(filtersCount > 0)">
          <span
            class="lucide-sliders-horizontal size-4 flex-none"
            aria-hidden="true"
          />
          {{ filtersLabel || t('Filters') }}
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
      :title="filtersLabel || t('Filters')"
    >
      <slot name="filters" :close="() => (sheet = false)" />
      <template #actions>
        <Button
          v-if="filtersCount"
          variant="ghost"
          size="lg"
          class="min-h-11 w-full"
          :label="t('Clear filters')"
          @click="$emit('clear-filters')"
        />
        <Button
          variant="solid"
          size="lg"
          class="min-h-11 w-full"
          :label="t('Show results')"
          @click="apply"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { t } from './host'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import BottomSheet from './BottomSheet.vue'
import { chipClass as panelChip } from './chipClass'

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
  /** Laid out in a search panel: chips wrap, the #filters content in place. */
  inline: { type: Boolean, default: false },
  /** The closed panel's line: only the chips that are on, each with ×. */
  summary: { type: Boolean, default: false },
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
      ? 'border-transparent bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
      : 'border-outline-gray-2 text-ink-gray-8',
  ]
}
// '' is «all»: the default view, never a chip to remove
const onChips = computed(() =>
  props.chips.filter((chip) => chip.value !== '' && isOn(chip.value)),
)
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
// The chip that is on stays in sight: a list that opens on a chip at the end
// of the row («Consultas» on Prospectos) scrolls the row to it, not the page.
function revealOn() {
  const el = row.value
  const on = el?.querySelector('[data-chip][aria-pressed="true"]')
  if (on) {
    const box = el.getBoundingClientRect()
    const chip = on.getBoundingClientRect()
    const fadeWidth = 40
    if (chip.right > box.right - fadeWidth)
      el.scrollLeft += chip.right - box.right + fadeWidth
    else if (chip.left < box.left) el.scrollLeft -= box.left - chip.left + 16
  }
  updateFade()
}
let observer = null
onMounted(() => {
  revealOn()
  updateFade()
  if (typeof ResizeObserver !== 'undefined' && row.value) {
    observer = new ResizeObserver(updateFade)
    observer.observe(row.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
// Counts arrive after the first paint and widen the chips: reveal again.
watch(
  () => props.chips,
  () => nextTick(revealOn),
  { deep: true },
)
watch(
  () => props.modelValue,
  () => nextTick(revealOn),
)
</script>
<style>
.ui-chips-fade {
  mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);
}
</style>
