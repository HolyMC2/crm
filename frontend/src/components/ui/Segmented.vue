<!-- Vendored from muelle/workspace/packages/ui@0.4.0 (487326036330). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- Two to four views of the same thing (Shell SPEC §2.2.4): one tonal
       track (container-high), equal segments with no border or dividers, the
       chosen one a pill on the secondary container with a check. Not for
       filters (FilterChips) and not for done/cancelled (fold them into a
       «Completados (n)» section). -->
  <div
    ref="root"
    role="radiogroup"
    :aria-label="label"
    class="flex w-full gap-0.5 rounded-full bg-[var(--muelle-surface-container-high)] p-1"
    :class="
      fit === 'content'
        ? 'overflow-x-auto overscroll-x-contain [scrollbar-width:none]'
        : 'overflow-hidden'
    "
    data-ui-segmented
    @keydown="onKey"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="String(option.value === modelValue)"
      :tabindex="tabStop(option.value, index) ? 0 : -1"
      :data-index="index"
      class="state-layer flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-sm leading-tight"
      :class="[
        fit === 'content'
          ? 'flex-auto whitespace-nowrap px-3'
          : 'min-w-0 flex-1',
        option.value === modelValue
          ? 'bg-[var(--muelle-secondary-container)] font-semibold text-[var(--muelle-on-secondary-container)]'
          : 'font-medium text-[var(--muelle-on-surface-variant)]',
      ]"
      @click="select(option.value)"
    >
      <span
        v-if="option.value === modelValue && options.length < 4"
        class="lucide-check size-4 flex-none"
        aria-hidden="true"
      />
      <span
        v-else-if="option.icon"
        :class="[option.icon, 'size-4 flex-none']"
        aria-hidden="true"
      />
      <span class="min-w-0 text-center [hyphens:auto]" lang="es">{{
        option.label
      }}</span>
      <span
        v-if="option.count !== undefined && option.count !== null"
        class="tabular-nums font-normal"
        >{{ option.count }}</span
      >
    </button>
  </div>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  /** [{ value, label, count?, icon? }], two to four of them. */
  options: { type: Array, required: true },
  /** What the segments choose, for screen readers («Vista»). */
  label: { type: String, default: '' },
  /** 'equal' segments (default), or 'content': each at least as wide as its
   *  words (never hyphenated at 305 px or large text), the track scrolls. */
  fit: { type: String, default: 'equal' },
})
const emit = defineEmits(['update:modelValue'])
const root = ref(null)

const current = () =>
  props.options.findIndex((option) => option.value === props.modelValue)
// One tab stop: the chosen segment, or the first when none is.
const tabStop = (value, index) =>
  value === props.modelValue || (current() < 0 && index === 0)

// A scrolling track keeps the chosen segment in sight. Only the track moves:
// scrollIntoView would also scroll the page to a Segmented below the fold.
function reveal() {
  if (props.fit !== 'content') return
  const track = root.value
  const chosen = track?.querySelector('[aria-checked="true"]')
  if (!track || !chosen) return
  const box = chosen.getBoundingClientRect()
  const left =
    box.left - track.getBoundingClientRect().left + track.scrollLeft
  const right = left + box.width
  if (left < track.scrollLeft) track.scrollLeft = left
  else if (right > track.scrollLeft + track.clientWidth)
    track.scrollLeft = right - track.clientWidth
}
onMounted(reveal)
// Counts that arrive later widen the segments: look again.
watch(() => [props.modelValue, props.options], reveal, {
  flush: 'post',
  deep: true,
})

function select(value) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
function onKey(event) {
  const last = props.options.length - 1
  const from = current()
  const next = {
    ArrowRight: from < 0 ? 0 : (from + 1) % (last + 1),
    ArrowDown: from < 0 ? 0 : (from + 1) % (last + 1),
    ArrowLeft: from < 0 ? last : (from - 1 + last + 1) % (last + 1),
    ArrowUp: from < 0 ? last : (from - 1 + last + 1) % (last + 1),
    Home: 0,
    End: last,
  }[event.key]
  if (next === undefined) return
  event.preventDefault()
  select(props.options[next].value)
  root.value?.querySelector(`[data-index="${next}"]`)?.focus()
}
</script>
