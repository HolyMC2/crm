<template>
  <!-- A template's variants the search found, one line each under its row
       (doco `_variant_hits`): «Huawei Y8s · 14 Pza · $50.00», each opening
       its own record; the rest on the template's page, already searched. -->
  <ul
    class="-mt-1.5 mb-2 ml-9 border-l border-outline-gray-2 sm:ml-11"
    :aria-label="__('Variants of {0}', [row.title], 'Productos')"
    data-variant-hits
  >
    <li v-for="hit in hits" :key="hit.name">
      <RouterLink
        :to="productRoute(hit, list)"
        class="press grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-1 pl-8 pr-4 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-blue-link sm:pr-6"
        :title="hit.title"
        @click="emit('leave')"
      >
        <span class="truncate text-sm text-ink-gray-9">{{ labelOf(hit) }}</span>
        <span
          v-if="stockOf(hit)"
          class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums"
          :class="stockOf(hit).ink"
          :title="stockOf(hit).title"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="stockOf(hit).dot"
            aria-hidden="true"
          />
          {{ stockOf(hit).text }}
        </span>
        <span v-else />
        <span
          v-if="priceOf(hit)"
          class="text-sm font-semibold tabular-nums text-ink-gray-9"
          >{{ priceOf(hit) }}</span
        >
        <span v-else class="text-xs text-ink-gray-6">{{
          noStore ? '' : __('No price', null, 'Productos')
        }}</span>
      </RouterLink>
    </li>
    <li v-if="more > 0">
      <RouterLink
        :to="allRoute"
        class="press flex min-h-11 items-center pl-8 pr-4 text-sm font-medium text-ink-blue-link hover:underline sm:pr-6"
        @click="emit('leave')"
      >
        {{ __('See all {0} variants', [qty(matching)], 'Productos') }}
      </RouterLink>
    </li>
  </ul>
</template>
<script setup>
import { computed } from 'vue'
import {
  money,
  productRoute,
  qty,
  stockBadge,
} from '@/composables/useProductos'

const props = defineProps({
  // The template's list row; `row.variants.hits` are its matching variants.
  row: { type: Object, required: true },
  search: { type: String, default: '' },
  // The list the variants (and the template) come back to.
  list: { type: String, default: '' },
  noStore: { type: Boolean, default: false },
})
const emit = defineEmits(['leave'])

const hits = computed(() => props.row.variants?.hits || [])
const matching = computed(() => Number(props.row.variants?.matching) || 0)
const more = computed(() => matching.value - hits.value.length)
const allRoute = computed(() => {
  const to = productRoute(props.row, props.list, props.search)
  return { ...to, query: { ...to.query, accion: 'variantes' } }
})

// The model reads better than the full name, which repeats the template's.
function labelOf(hit) {
  const values = (hit.attributes || []).map((entry) => entry.value)
  return values.length ? values.join(' · ') : hit.title || hit.name
}
const INK = {
  green: { ink: 'text-ink-green-8', dot: 'bg-surface-green-7' },
  red: { ink: 'text-ink-red-7', dot: 'bg-surface-red-7' },
}
// «14 Pza» or «Agotado»: the figure without «en existencia», which the
// template's row already says.
function stockOf(hit) {
  const badge = stockBadge(hit)
  if (!badge || badge.kind === 'service') return null
  if (props.noStore && badge.kind === 'out') return null
  const text =
    badge.kind === 'out'
      ? badge.text
      : [qty(hit.stock.qty), hit.uom].filter(Boolean).join(' ')
  return { text, title: badge.text, ...(INK[badge.theme] || INK.green) }
}
function priceOf(hit) {
  const price = hit.price
  if (!price || price.rate === null || price.rate === undefined) return ''
  return money(price.rate, price.currency)
}
</script>
