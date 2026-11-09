<template>
  <!-- A row's price over time, small enough for the table: this supplier's lists
       as a line, other suppliers' lists as rings, what the shop paid as squares
       (doco.workspaces.lista_precios.historias). The words say the same. -->
  <span
    v-if="shape"
    class="inline-flex flex-none"
    role="img"
    :aria-label="label"
    :title="label"
    data-lista-historia-mini
  >
    <svg
      :width="shape.width"
      :height="shape.height"
      :viewBox="`0 0 ${shape.width} ${shape.height}`"
      class="overflow-visible"
      aria-hidden="true"
    >
      <g class="text-ink-gray-7">
        <polyline
          v-if="shape.mine.length > 1"
          :points="shape.line"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <circle
          v-for="(s, i) in shape.mine"
          :key="`m${i}`"
          :cx="s.x"
          :cy="s.y"
          r="1.8"
          fill="currentColor"
        />
      </g>
      <g class="text-ink-gray-5">
        <circle
          v-for="(s, i) in shape.others"
          :key="`o${i}`"
          :cx="s.x"
          :cy="s.y"
          r="2.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </g>
      <g class="text-ink-gray-9">
        <rect
          v-for="(s, i) in shape.paid"
          :key="`p${i}`"
          :x="s.x - 1.8"
          :y="s.y - 1.8"
          width="3.6"
          height="3.6"
          fill="currentColor"
        />
      </g>
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { money } from '@/composables/useCompras'
import { formatDate } from '@/utils/display'
import { storyFacts, storyShape, tellsAStory } from '@/utils/listaVivo'

const props = defineProps({
  /** [{date, price, source, supplier_name, mine}], oldest first. */
  points: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
})

const shape = computed(() =>
  tellsAStory(props.points) ? storyShape(props.points) : null,
)
const day = (d) => formatDate(d, { relative: false })
const label = computed(() => {
  const facts = storyFacts(props.points)
  const parts = []
  if (facts.mine)
    parts.push(
      __(
        '{0} lists it at {1} ({2})',
        [
          facts.mine.supplier_name,
          money(facts.mine.price, props.currency),
          day(facts.mine.date),
        ],
        'Lista',
      ),
    )
  if (facts.other)
    parts.push(
      __(
        '{0} at {1} ({2})',
        [
          facts.other.supplier_name,
          money(facts.other.price, props.currency),
          day(facts.other.date),
        ],
        'Lista',
      ),
    )
  if (facts.paid)
    parts.push(
      __(
        'you paid {0} ({1})',
        [money(facts.paid.price, props.currency), day(facts.paid.date)],
        'Lista',
      ),
    )
  if (shape.value && shape.value.low !== shape.value.high)
    parts.push(
      __(
        'between {0} and {1}',
        [
          money(shape.value.low, props.currency),
          money(shape.value.high, props.currency),
        ],
        'Lista',
      ),
    )
  return parts.join(', ')
})
</script>
