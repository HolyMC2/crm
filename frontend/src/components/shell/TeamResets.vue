<template>
  <!-- The owner's two resets, each saying whom it reaches: the puesto on
       screen back to the suggested arrangement, and every puesto at once.
       The second is two taps in place (it reaches other people), never a
       dialog. -->
  <section
    v-if="one || arranged"
    class="space-y-1 border-t border-outline-gray-1 pt-3"
    data-testid="team-resets"
  >
    <button
      v-if="one"
      type="button"
      :class="ROW"
      :disabled="!!busy"
      data-testid="layout-reset"
      @click="$emit('one')"
    >
      <span
        class="lucide-undo-2 size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1">
        <span class="block">{{ __('Back to the suggested one') }}</span>
        <span class="block text-sm text-ink-gray-6">{{
          __('Only {0}.', [klassLabel])
        }}</span>
      </span>
      <span
        v-if="busy === 'reset'"
        class="lucide-loader-circle size-4 flex-none animate-spin text-ink-gray-6"
        aria-hidden="true"
      />
    </button>
    <button
      v-if="arranged"
      type="button"
      :class="[ROW, armed ? 'bg-surface-red-1 text-ink-red-8' : '']"
      :disabled="!!busy"
      aria-describedby="team-reach"
      data-testid="layout-reset-all"
      @click="all"
      @blur="armed = false"
    >
      <span class="lucide-users size-4 flex-none" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <span class="block">{{
          armed ? __('Yes, reset every puesto') : __('Reset every puesto')
        }}</span>
        <span id="team-reach" class="block text-sm text-ink-gray-6">{{
          reachText
        }}</span>
      </span>
      <span
        v-if="busy === 'reset-all'"
        class="lucide-loader-circle size-4 flex-none animate-spin text-ink-gray-6"
        aria-hidden="true"
      />
    </button>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  /** The puesto on screen, as the owner reads it. */
  klassLabel: { type: String, default: '' },
  /** The puesto on screen has an arrangement of its own. */
  one: { type: Boolean, default: false },
  /** How many puestos have one. */
  arranged: { type: Number, default: 0 },
  /** The people who follow those puestos (no arrangement of their own). */
  reach: { type: Number, default: 0 },
  busy: { type: String, default: '' },
})
const emit = defineEmits(['one', 'all'])

const reachText = computed(() => {
  if (!props.reach)
    return __(
      'Nobody follows these puestos now: whoever arranged their own keeps it.',
    )
  return props.reach === 1
    ? __('Changes what one person sees. Whoever arranged their own keeps it.')
    : __('Changes what {0} people see. Whoever arranged their own keeps it.', [
        props.reach,
      ])
})

// First tap arms, the second resets; it disarms by itself after a moment.
const armed = ref(false)
let timer = 0
function all() {
  if (!armed.value) {
    armed.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (armed.value = false), 5000)
    return
  }
  armed.value = false
  emit('all')
}
watch(
  () => props.arranged,
  () => (armed.value = false),
)
onBeforeUnmount(() => window.clearTimeout(timer))

const ROW =
  'press flex min-h-12 w-full items-center gap-2.5 rounded-6 px-2 py-1.5 text-left text-base hover:bg-surface-gray-2 disabled:opacity-60'
</script>
