<template>
  <!-- Items as cards (Shell SPEC §6 DD4): name, quantity with its unit, price,
       amount; a tap opens the Producto. -->
  <section v-if="rows.length" aria-labelledby="doc-items" class="space-y-2">
    <h2 id="doc-items" class="px-4 text-base font-semibold text-ink-gray-9">
      {{ rows.length === 1 ? '1 artículo' : `${rows.length} artículos` }}
    </h2>
    <ul class="space-y-2 px-4">
      <li v-for="row in rows" :key="row.name">
        <UiTag
          :as="row.item_code ? RouterLink : 'div'"
          :to="row.item_code ? productRoute(row.item_code) : undefined"
          class="flex min-h-14 w-full items-start gap-3 rounded-xl border border-outline-gray-1 bg-surface-base px-3 py-2.5"
          :class="row.item_code ? 'hover:bg-surface-gray-1' : ''"
          data-testid="documentos-item"
        >
          <img
            v-if="row.image"
            :src="row.image"
            alt=""
            class="size-12 flex-none rounded-lg object-cover"
            loading="lazy"
          />
          <span
            v-else
            class="flex size-12 flex-none items-center justify-center rounded-lg bg-surface-gray-2 text-ink-gray-6"
            aria-hidden="true"
          >
            <span class="lucide-package size-5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              class="line-clamp-2 break-words text-base leading-snug text-ink-gray-9"
            >
              {{ row.item_name || row.item_code }}
            </span>
            <span class="text-sm text-ink-gray-6">
              {{ qtyLine(row) }}
            </span>
            <span v-if="progress(row)" class="text-sm text-ink-gray-6">
              {{ progress(row) }}
            </span>
          </span>
          <span
            v-if="row.amount != null"
            class="flex-none whitespace-nowrap pt-0.5 text-base tabular-nums text-ink-gray-9"
          >
            {{ formatMoney(row.amount, currency) }}
          </span>
        </UiTag>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import UiTag from '@/components/ui/UiTag'
import { formatMoney, formatQty } from '@/utils/display'

const props = defineProps({
  items: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
})
const rows = computed(() => props.items?.rows || [])

function productRoute(item) {
  return { name: 'Producto', params: { item } }
}
function qtyLine(row) {
  const qty = formatQty(row.qty, row.uom || row.stock_uom)
  if (row.rate == null) return qty
  return `${qty} × ${formatMoney(row.rate, props.currency)}`
}
// What is left of the line downstream: delivered or received so far.
function progress(row) {
  const qty = Number(row.qty) || 0
  if (!qty) return ''
  if (row.delivered_qty != null && Number(row.delivered_qty) < qty)
    return `Entregado ${formatQty(row.delivered_qty, row.uom || row.stock_uom)}`
  if (row.received_qty != null && Number(row.received_qty) < qty)
    return `Recibido ${formatQty(row.received_qty, row.uom || row.stock_uom)}`
  return ''
}
</script>
