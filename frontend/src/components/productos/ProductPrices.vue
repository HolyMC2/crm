<template>
  <!-- «Listas de precios» as rows (Shell D4.2, DD9; Mercado's Vigencia): the
       list, its currency and unit, since when it holds and until when, the
       next scheduled price, how fresh it is; the price and its status at the
       end. No sideways scroll at 305px. -->
  <ul class="divide-y divide-outline-gray-1" data-producto-prices>
    <li
      v-for="row in rows"
      :key="row.price_list"
      class="flex items-start gap-3 px-4 py-3"
      data-price-row
    >
      <span class="min-w-0 flex-1">
        <span class="block break-words text-base font-medium text-ink-gray-9">{{
          priceListLabel(row.price_list)
        }}</span>
        <span class="block text-sm text-ink-gray-6">{{ facts(row) }}</span>
        <!-- Freshness as a chip (Mercado's item drawer): a dot and the age. -->
        <span
          v-if="age(row).text"
          class="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="AGE_CHIP[age(row).tone] || AGE_CHIP.recent"
          :title="__('Updated {0}', [midSentence(age(row).text)], CTX)"
          data-price-age
          ><span
            class="size-1.5 rounded-full bg-current"
            aria-hidden="true"
          />{{ __('Updated {0}', [midSentence(age(row).text)], CTX) }}</span
        >
        <span
          v-for="next in row.scheduled || []"
          :key="next.name"
          class="mt-0.5 block text-sm text-ink-blue-7"
          >{{
            __(
              'From {0}: {1}',
              [formatDate(next.valid_from), money(next.rate, row.currency)],
              CTX,
            )
          }}</span
        >
        <span
          v-if="row.blocked_reason && hasRate(row)"
          class="mt-0.5 block text-sm text-ink-gray-6"
          >{{ plain(row.blocked_reason) }}</span
        >
      </span>
      <span class="flex flex-none flex-col items-end gap-1 text-right">
        <span
          class="whitespace-nowrap text-base font-semibold tabular-nums"
          :class="hasRate(row) ? 'text-ink-gray-9' : 'text-ink-gray-5'"
          >{{
            hasRate(row)
              ? money(row.rate, row.currency)
              : __('No price', null, CTX)
          }}</span
        >
        <Badge
          v-if="hasRate(row)"
          :theme="priceStatus(row).theme"
          :label="priceStatus(row).text"
        />
      </span>
    </li>
  </ul>
</template>
<script setup>
import { Badge } from 'frappe-ui'
import {
  money,
  plain,
  priceStatus,
  relativeAge,
} from '@/composables/useProductos'
import { priceListLabel } from '@/utils/priceList'
import { formatDate, unitLabel } from '@/utils/display'

const CTX = 'Productos'
const props = defineProps({
  rows: { type: Array, default: () => [] },
  today: { type: String, default: '' },
})

// The age's tone as a chip: green fresh, grey recent, amber old, red stale.
const AGE_CHIP = Object.freeze({
  fresh: 'bg-surface-green-2 text-ink-green-8',
  recent: 'bg-surface-gray-2 text-ink-gray-7',
  old: 'bg-surface-amber-2 text-ink-amber-8',
  stale: 'bg-surface-red-2 text-ink-red-8',
  never: 'bg-surface-gray-2 text-ink-gray-6',
})
const hasRate = (row) => row && row.rate !== null && row.rate !== undefined
const age = (row) => relativeAge(row?.updated, props.today)
// «Actualizado hace 2 años»: the age reads inside the sentence.
const midSentence = (text) =>
  text ? text.charAt(0).toLowerCase() + text.slice(1) : text

/** «MXN · pza · desde 29 may hasta 31 dic». */
function facts(row) {
  const parts = [row.currency, unitLabel(row.uom || row.stock_uom)]
  if (hasRate(row)) {
    if (row.valid_from && row.valid_upto)
      parts.push(
        __(
          'from {0} to {1}',
          [formatDate(row.valid_from), formatDate(row.valid_upto)],
          CTX,
        ),
      )
    else if (row.valid_upto)
      parts.push(__('until {0}', [formatDate(row.valid_upto)], CTX))
    else if (row.valid_from)
      parts.push(__('since {0}', [formatDate(row.valid_from)], CTX))
  }
  return parts.filter(Boolean).join(' · ')
}
</script>
