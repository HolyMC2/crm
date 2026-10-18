<template>
  <!-- «Cómo se vende» (Shell D4.2, DD9): what neither Producto nor Mercado's
       card showed. How much sold in 30 and 90 days, the last sale and the
       last purchase, how long each store's stock lasts at that pace (with
       «Reordenar» where it is short), the margin by month for who may see
       cost, and the channels the product is offered on. -->
  <section
    id="ventas-ritmo"
    class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-base"
    data-producto-insights
  >
    <header
      class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
    >
      <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('How it sells', null, CTX) }}
      </h2>
    </header>
    <div class="grid grid-cols-3 gap-px bg-outline-gray-1" data-insights-kpis>
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="bg-surface-base px-4 py-3"
      >
        <p class="text-sm leading-snug text-ink-gray-6">{{ tile.label }}</p>
        <p
          class="mt-0.5 break-words text-lg font-semibold tabular-nums text-ink-gray-9"
        >
          {{ tile.value }}
        </p>
      </div>
    </div>
    <ul class="divide-y divide-outline-gray-1 border-t border-outline-gray-1">
      <li v-for="event in events" :key="event.key">
        <ListRow
          :to="event.to"
          :icon="event.icon"
          :title="event.title"
          :subtitle="event.subtitle"
          :subtitle-lines="2"
          :meta="event.meta"
          :data-insights-event="event.key"
        />
      </li>
    </ul>

    <template v-if="insights.cover?.length">
      <h3
        class="border-t border-outline-gray-1 px-4 pb-1 pt-3 text-sm font-semibold text-ink-gray-8"
      >
        {{ __('Days of stock per store', null, CTX) }}
      </h3>
      <ul class="divide-y divide-outline-gray-1" data-insights-cover>
        <li
          v-for="row in coverRows"
          :key="row.warehouse"
          class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
        >
          <span class="min-w-0 flex-1">
            <span class="block break-words text-base text-ink-gray-9">{{
              row.label
            }}</span>
            <span
              class="block text-sm"
              :class="row.short ? 'text-ink-red-7' : 'text-ink-gray-6'"
              >{{ row.text }}</span
            >
          </span>
          <Button
            v-if="row.reorder"
            class="min-h-11"
            :label="__('Reorder', null, CTX)"
            data-insights-reorder
            @click="$emit('reorder', row.reorder)"
          >
            <template #prefix>
              <span class="lucide-shopping-cart size-4" aria-hidden="true" />
            </template>
          </Button>
        </li>
      </ul>
    </template>

    <template v-if="trend.length">
      <h3
        class="flex items-center gap-2 border-t border-outline-gray-1 px-4 pb-1 pt-3 text-sm font-semibold text-ink-gray-8"
      >
        <span class="lucide-lock size-4 text-ink-gray-5" aria-hidden="true" />
        {{ __('Margin by month', null, CTX) }}
      </h3>
      <ol
        class="flex items-end gap-2 px-4 pb-3 pt-2"
        :aria-label="__('Margin by month', null, CTX)"
        data-insights-trend
      >
        <li
          v-for="month in trend"
          :key="month.month"
          class="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span class="text-xs tabular-nums" :class="month.tone">{{
            month.pct
          }}</span>
          <span
            class="w-full max-w-10 rounded-t bg-surface-gray-3"
            :class="month.bar"
            :style="{ height: `${month.height}px` }"
            aria-hidden="true"
          />
          <span class="text-xs text-ink-gray-6">{{ month.label }}</span>
        </li>
      </ol>
    </template>

    <div
      v-if="insights.channels?.length"
      class="flex flex-wrap items-center gap-2 border-t border-outline-gray-1 px-4 py-3"
      data-insights-channels
    >
      <span class="text-sm text-ink-gray-6">{{
        __('Offered on', null, CTX)
      }}</span>
      <span
        v-for="channel in insights.channels"
        :key="channel.key"
        class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm"
        :class="
          channel.on
            ? 'border-transparent bg-surface-green-2 text-ink-green-8'
            : 'border-outline-gray-2 text-ink-gray-6'
        "
      >
        <span
          :class="[channel.on ? 'lucide-check' : 'lucide-minus', 'size-4']"
          aria-hidden="true"
        />
        {{ channel.label }}
        <span class="sr-only">{{
          channel.on ? __('listed', null, CTX) : __('not listed', null, CTX)
        }}</span>
      </span>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { ListRow } from '@/components/ui'
import { voucherLink } from '@/components/inventario/kardex'
import { formatDate, formatMoney, formatQty } from '@/utils/display'

const CTX = 'Productos'
const props = defineProps({
  insights: { type: Object, required: true },
  /** Stock rows of the record: state and reorder quantity per store. */
  stock: { type: Array, default: () => [] },
  /** The purchase action (enabled or not) from the server. */
  purchase: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
})
defineEmits(['reorder'])

const uom = computed(() => props.insights.uom)
const perDay = (value) => {
  const n = Number(value) || 0
  if (!n) return '0'
  return n >= 1
    ? formatQty(Math.round(n * 10) / 10, '')
    : __('1 every {0} days', [Math.round(1 / n)], CTX)
}
const tiles = computed(() => [
  {
    key: '30',
    label: __('Sold in 30 days', null, CTX),
    value: formatQty(props.insights.sold_30 || 0, uom.value),
  },
  {
    key: '90',
    label: __('Sold in 90 days', null, CTX),
    value: formatQty(props.insights.sold_90 || 0, uom.value),
  },
  {
    key: 'day',
    label: __('Per day', null, CTX),
    value: perDay(props.insights.per_day),
  },
])

const events = computed(() => {
  const out = []
  const sale = props.insights.last_sale
  out.push(
    sale
      ? {
          key: 'sale',
          icon: 'lucide-shopping-cart',
          title: __('Last sale {0}', [formatDate(sale.date)], CTX),
          subtitle: [sale.party, formatQty(sale.qty, uom.value), sale.store]
            .filter(Boolean)
            .join(' · '),
          meta: sale.rate != null ? formatMoney(sale.rate, props.currency) : '',
          to: voucherLink(sale.voucher),
        }
      : {
          key: 'sale',
          icon: 'lucide-shopping-cart',
          title: __('No sales in 90 days', null, CTX),
          subtitle: '',
        },
  )
  const purchase = props.insights.last_purchase
  out.push(
    purchase
      ? {
          key: 'purchase',
          icon: 'lucide-truck',
          title: __('Last purchase {0}', [formatDate(purchase.date)], CTX),
          subtitle: [
            purchase.party,
            formatQty(purchase.qty, uom.value),
            purchase.store,
          ]
            .filter(Boolean)
            .join(' · '),
          meta:
            purchase.rate != null
              ? formatMoney(purchase.rate, props.currency)
              : '',
          to: voucherLink(purchase.voucher),
        }
      : {
          key: 'purchase',
          icon: 'lucide-truck',
          title: __('No purchases received yet', null, CTX),
          subtitle: '',
        },
  )
  return out
})

const stockBy = computed(
  () => new Map(props.stock.map((row) => [row.warehouse, row])),
)
const coverRows = computed(() =>
  (props.insights.cover || []).map((row) => {
    const stock = stockBy.value.get(row.warehouse) || {}
    const short = ['faltan', 'bajo'].includes(stock.state)
    let text
    if (row.days === 0) text = __('Out of stock', null, CTX)
    else if (row.days === null || row.days === undefined)
      text = __('No sales here in 90 days', null, CTX)
    else if (row.days > 365) text = __('More than a year', null, CTX)
    else text = __('About {0} days', [row.days], CTX)
    if (stock.reorder_level)
      text = `${text} · ${__('minimum {0}', [formatQty(stock.reorder_level, uom.value)], CTX)}`
    return {
      ...row,
      text,
      short: short || row.days === 0,
      reorder:
        short && props.purchase?.enabled
          ? {
              warehouse: row.warehouse,
              qty: stock.reorder_qty || null,
            }
          : null,
    }
  }),
)

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]
const trend = computed(() => {
  const months = props.insights.margin_trend || []
  if (!months.some((m) => m.margin_pct !== null && m.margin_pct !== undefined))
    return []
  const top = Math.max(1, ...months.map((m) => Math.abs(m.margin_pct || 0)))
  return months.map((m) => {
    const pct = m.margin_pct
    const known = pct !== null && pct !== undefined
    return {
      month: m.month,
      label: MONTHS[Number(m.month.slice(5, 7)) - 1] || m.month,
      pct: known ? `${Math.round(pct)}%` : '—',
      tone: known && pct < 0 ? 'text-ink-red-7' : 'text-ink-gray-7',
      bar: known ? (pct < 0 ? 'bg-surface-red-7' : 'bg-surface-green-7') : '',
      height: known ? Math.max(4, Math.round((Math.abs(pct) / top) * 48)) : 2,
    }
  })
})
</script>
