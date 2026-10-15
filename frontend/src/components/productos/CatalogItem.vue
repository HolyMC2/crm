<template>
  <!-- Tarjetas: a card in the grid, like Mercado's catálogo. -->
  <RouterLink
    v-if="layout === 'tarjetas'"
    :to="to"
    class="group flex h-full flex-col gap-3 rounded-xl border bg-surface-base p-3 transition-shadow hover:border-outline-gray-3 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
    :class="
      focused
        ? 'border-outline-gray-4 ring-1 ring-outline-gray-4'
        : 'border-outline-gray-2'
    "
  >
    <span class="flex min-w-0 items-start gap-3">
      <ProductThumb
        class="h-14 w-14"
        :image="row.image || ''"
        :title="row.title"
        :tone-key="row.item_group"
        :eager="eager"
      />
      <span class="min-w-0 flex-1">
        <span
          class="line-clamp-2 text-sm font-semibold leading-snug text-ink-gray-9"
          :title="row.title"
          >{{ row.title }}</span
        >
        <span class="mt-0.5 block truncate text-xs text-ink-gray-6">
          <span class="font-mono">{{ row.name }}</span>
          <template v-if="groupOf(row)"> · {{ groupOf(row) }}</template>
        </span>
        <span
          v-if="detail"
          class="mt-0.5 block truncate text-xs text-ink-gray-7"
          >{{ detail }}</span
        >
      </span>
    </span>
    <span class="mt-auto flex flex-wrap items-end justify-between gap-2">
      <span class="flex flex-wrap gap-1">
        <StockPill v-if="badge" :badge="badge" />
        <Badge v-if="variants" theme="blue" :label="variants" />
        <Badge
          v-if="review"
          theme="orange"
          :label="__('Price to review', null, 'Productos')"
        />
      </span>
      <PriceFigure :row="row" />
    </span>
  </RouterLink>

  <!-- Lista: one dense row; on a wide screen the columns line up. -->
  <RouterLink
    v-else
    :to="to"
    class="grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-blue-link sm:px-6 lg:grid-cols-[2.5rem_minmax(0,1fr)_12rem_9rem_8rem]"
  >
    <ProductThumb
      class="h-10 w-10"
      :image="row.image || ''"
      :title="row.title"
      :tone-key="row.item_group"
      text-class="text-xs"
      :eager="eager"
    />
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium text-ink-gray-9">{{
        row.title
      }}</span>
      <span class="block truncate text-xs text-ink-gray-6">
        <span class="font-mono">{{ row.name }}</span>
        <span v-if="groupOf(row)" class="lg:hidden"> · {{ groupOf(row) }}</span>
      </span>
      <span v-if="detail" class="block truncate text-xs text-ink-gray-7">{{
        detail
      }}</span>
      <span
        v-if="badge || review || chip || variants"
        class="mt-1 flex flex-wrap gap-1 lg:hidden"
      >
        <StockPill v-if="badge" :badge="badge" />
        <Badge v-if="variants" theme="blue" :label="variants" />
        <Badge v-if="chip" :theme="chip.theme" :label="chip.label" />
        <Badge
          v-if="review"
          theme="orange"
          :label="__('Price to review', null, 'Productos')"
        />
      </span>
    </span>
    <span class="hidden truncate text-sm text-ink-gray-7 lg:block">{{
      groupOf(row)
    }}</span>
    <span class="hidden flex-wrap gap-1 lg:flex">
      <StockPill v-if="badge" :badge="badge" />
      <Badge v-if="variants" theme="blue" :label="variants" />
      <Badge v-if="chip" :theme="chip.theme" :label="chip.label" />
      <Badge
        v-if="review"
        theme="orange"
        :label="__('Price to review', null, 'Productos')"
      />
    </span>
    <PriceFigure :row="row" class="justify-self-end" />
  </RouterLink>
</template>
<script setup>
import { computed, h } from 'vue'
import { Badge } from 'frappe-ui'
import ProductThumb from '@/components/productos/ProductThumb.vue'
import {
  groupOf,
  money,
  stockBadge,
  tierLines,
  variantsLabel,
} from '@/composables/useProductos'

// One product of a Productos list: photo or initials, name, code and group,
// its stock in words and its price (or «Sin precio»).
const props = defineProps({
  row: { type: Object, required: true },
  to: { type: [Object, String], required: true },
  layout: { type: String, default: 'lista' },
  focused: { type: Boolean, default: false },
  eager: { type: Boolean, default: false },
  showStock: { type: Boolean, default: true },
  detail: { type: String, default: '' },
  // Extra price lists to show under the default one («Precios que se muestran»).
  lists: { type: Array, default: () => [] },
})
const tiers = computed(() => tierLines(props.row, props.lists))
const badge = computed(() => (props.showStock ? stockBadge(props.row) : null))
// A template: «N variants» (while searching, how many of them match).
const variants = computed(() => variantsLabel(props.row.variants))
const review = computed(() =>
  Boolean(props.row.price?.review || props.row.price_review),
)
const chip = computed(() =>
  props.row.chip === 'bajo'
    ? { theme: 'orange', label: __('Below minimum', null, 'Productos') }
    : null,
)

const PILL = {
  green: 'bg-surface-green-2 text-ink-green-8',
  red: 'bg-surface-red-2 text-ink-red-8',
  gray: 'bg-surface-gray-2 text-ink-gray-7',
}
const DOT = {
  green: 'bg-surface-green-7',
  red: 'bg-surface-red-7',
  gray: 'bg-surface-gray-7',
}
function StockPill({ badge: value }) {
  return h(
    'span',
    {
      class: `inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium ${PILL[value.theme] || PILL.gray}`,
    },
    [
      h('span', {
        class: `h-1.5 w-1.5 rounded-full ${DOT[value.theme] || DOT.gray}`,
        'aria-hidden': 'true',
      }),
      value.text,
    ],
  )
}
StockPill.props = ['badge']

function TierLines() {
  return tiers.value.map((line) =>
    h(
      'span',
      {
        class: 'max-w-[10rem] truncate text-xs text-ink-gray-6',
        title: line.list,
      },
      `${line.list} · ${line.text}`,
    ),
  )
}
function PriceFigure(_, { attrs }) {
  const price = props.row.price
  if (price && price.rate !== null && price.rate !== undefined)
    return h(
      'span',
      {
        ...attrs,
        class: ['flex flex-col items-end leading-tight', attrs.class],
      },
      [
        h(
          'span',
          { class: 'text-base font-semibold tabular-nums text-ink-gray-9' },
          price.from
            ? __('from {0}', [money(price.rate, price.currency)], 'Productos')
            : money(price.rate, price.currency),
        ),
        price.inherited
          ? h(
              'span',
              { class: 'text-xs text-ink-gray-5' },
              __('Template price', null, 'Productos'),
            )
          : price.price_list
            ? h(
                'span',
                {
                  class: 'max-w-[8rem] truncate text-xs text-ink-gray-5',
                  title: price.price_list,
                },
                price.price_list,
              )
            : null,
        ...TierLines(),
      ],
    )
  const empty = h(
    'span',
    {
      class:
        'inline-flex h-6 items-center whitespace-nowrap rounded-md border border-dashed border-outline-gray-3 px-2 text-xs text-ink-gray-6',
    },
    __('No price', null, 'Productos'),
  )
  if (!tiers.value.length) return h('span', { ...attrs }, [empty])
  return h(
    'span',
    {
      ...attrs,
      class: ['flex flex-col items-end gap-0.5 leading-tight', attrs.class],
    },
    [empty, ...TierLines()],
  )
}
PriceFigure.inheritAttrs = false
</script>
