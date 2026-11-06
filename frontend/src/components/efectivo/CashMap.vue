<template>
  <!-- Efectivo's hero: the cash of the safes this worker answers for and
       where it sits, in the order it moves (cashMap). One bar split by
       state; a row per state with its bags and amount opens those bags.
       When cash moves the figures count to their new value and the bar's
       parts slide to their new share. -->
  <section
    class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4"
    aria-label="Efectivo en las cajas fuertes"
    data-efectivo-hero
  >
    <p class="text-sm text-ink-gray-6">{{ map.label }}</p>
    <TweenedMoney
      class="mt-1 block break-words text-3xl font-semibold text-ink-gray-9"
      :value="map.balance"
      :currency="map.currency"
    />
    <div
      class="relative mt-4 h-3 overflow-hidden rounded-full bg-surface-gray-3"
      role="img"
      :aria-label="barLabel"
      data-efectivo-bar
    >
      <span
        v-for="segment in segments"
        :key="segment.key"
        class="ef-segment absolute inset-0 origin-left"
        :class="[
          segment.dot,
          focus && focus !== segment.key ? 'opacity-25' : '',
        ]"
        :style="{
          transform: `translateX(${segment.start * 100}%) scaleX(${grown ? segment.share : 0})`,
        }"
        :data-segment="segment.key"
      />
    </div>
    <TransitionGroup
      tag="ul"
      name="ef-part"
      class="relative -mx-2 mt-3"
      aria-label="Dónde está el efectivo"
    >
      <li v-for="part in map.parts" :key="part.key" :data-part="part.key">
        <button
          v-if="part.view"
          type="button"
          class="press flex min-h-10 w-full items-center gap-2 rounded-6 px-2 text-left hover:bg-surface-gray-2 focus-visible:bg-surface-gray-2"
          :aria-label="`${part.label}: ${partLine(part)}. Ver esas bolsas`"
          @pointerenter="focus = part.key"
          @pointerleave="focus = ''"
          @focus="focus = part.key"
          @blur="focus = ''"
          @click="$emit('pick', part)"
        >
          <span
            class="size-2 flex-none rounded-full"
            :class="part.dot"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">
            {{ part.label }}
            <span class="num ml-1 text-ink-gray-5">{{ part.count }}</span>
          </span>
          <TweenedMoney
            class="flex-none text-base font-semibold text-ink-gray-9"
            :value="part.amount"
            :currency="map.currency"
          />
          <span
            class="lucide-chevron-right -mr-1 size-4 flex-none text-ink-gray-4"
            aria-hidden="true"
          />
        </button>
        <div v-else class="flex min-h-10 items-center gap-2 px-2">
          <span
            class="size-2 flex-none rounded-full"
            :class="part.dot"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">
            {{ part.label }}
          </span>
          <TweenedMoney
            class="flex-none text-base font-semibold"
            :class="part.amount < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'"
            :value="part.amount"
            :currency="map.currency"
          />
          <span class="-mr-1 size-4 flex-none" aria-hidden="true" />
        </div>
      </li>
    </TransitionGroup>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import TweenedMoney from './TweenedMoney.vue'
import { CASH_PARTS, bagsWord, cashSegments, money } from './efectivo'

const props = defineProps({
  /** cashMap(safes): { label, currency, balance, parts } */
  map: { type: Object, required: true },
})
defineEmits(['pick'])

// Every state keeps its segment, so one that empties shrinks away while
// its neighbours slide over instead of vanishing.
const segments = computed(() =>
  cashSegments(
    CASH_PARTS.map(
      (part) =>
        props.map.parts.find((p) => p.key === part.key) || {
          ...part,
          amount: 0,
        },
    ),
  ),
)
/** The part a finger or the keyboard is on: the bar shows its share alone. */
const focus = ref('')
const partLine = (part) =>
  part.count
    ? `${bagsWord(part.count)}, ${money(part.amount, props.map.currency)}`
    : money(part.amount, props.map.currency)
const barLabel = computed(() =>
  props.map.parts.map((p) => `${p.label} ${partLine(p)}`).join('; '),
)

// The bar fills from empty once, on the first paint after mount.
const grown = ref(false)
onMounted(() => {
  if (typeof requestAnimationFrame !== 'function') grown.value = true
  else
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (grown.value = true)),
    )
})
</script>
<style scoped>
.ef-segment {
  transition:
    transform 640ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 160ms ease-out;
}
/* A state that empties fades out of the legend; the rows below close up. */
.ef-part-move {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ef-part-enter-active,
.ef-part-leave-active {
  transition: opacity 200ms ease-out;
}
.ef-part-leave-active {
  position: absolute;
  inset-inline: 0;
}
.ef-part-enter-from,
.ef-part-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ef-segment {
    transition: opacity 160ms ease-out;
  }
  .ef-part-move {
    transition: none;
  }
}
</style>
