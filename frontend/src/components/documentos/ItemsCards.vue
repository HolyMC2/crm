<template>
  <!-- Items as cards (Shell SPEC §6 DD4): name, quantity with its unit, price,
       amount; a tap opens the Producto. A stock count («Ajustar existencia»,
       an Ajuste's rows carry current_qty) reads the before, the after and the
       difference instead of a sale's qty × price. -->
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
            <span
              class="text-sm text-ink-gray-6"
              data-testid="documentos-item-cantidad"
            >
              {{ qtyLine(row) }}
            </span>
            <span
              v-if="differenceLine(row)"
              class="text-sm tabular-nums text-ink-gray-6"
              data-testid="documentos-item-diferencia"
            >
              {{ differenceLine(row) }}
            </span>
            <span v-else-if="progress(row)" class="text-sm text-ink-gray-6">
              {{ progress(row) }}
            </span>
          </span>
          <span
            v-if="rowAmount(row)"
            class="flex-none whitespace-nowrap pt-0.5 text-base tabular-nums"
            :class="amountTone(row)"
            data-testid="documentos-item-monto"
          >
            {{ rowAmount(row) }}
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
import { storeName } from '@/documentos/profiles/_generic'
import { formatMoney, formatQty } from '@/utils/display'

const props = defineProps({
  items: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
})
const rows = computed(() => props.items?.rows || [])

// An Ajuste's row carries the quantity found on hand and the movement it made
// (Stock Reconciliation Item: current_qty, quantity_difference, amount_difference).
function isCount(row) {
  return row.current_qty != null && row.qty != null
}
function unit(row) {
  return row.uom || row.stock_uom
}
function signed(value, text) {
  const n = Number(value)
  if (!Number.isFinite(n) || !n) return ''
  return `${n > 0 ? '+' : '−'}${text}`
}
function signedMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || !n) return ''
  return `${n > 0 ? '+' : '−'}${formatMoney(Math.abs(n), props.currency)}`
}
// «Antes 10 pza · ahora 7 pza»: the count in the order the worker reads it.
function qtyLine(row) {
  if (isCount(row))
    return `Antes ${formatQty(row.current_qty, unit(row))} · ahora ${formatQty(
      row.qty,
      unit(row),
    )}`
  const qty = formatQty(row.qty, unit(row))
  if (row.rate == null) return qty
  return `${qty} × ${formatMoney(row.rate, props.currency)}`
}
// Many stores in one count: say which one this row moved (the header names one store).
const manyStores = computed(
  () =>
    new Set(rows.value.map((row) => row.warehouse).filter(Boolean)).size > 1,
)
// What the count changed, in the row's own unit: «Diferencia −3 pza».
function differenceLine(row) {
  if (!isCount(row)) return ''
  const qty = Number(row.quantity_difference) || 0
  if (!qty && !Number(row.amount_difference)) return 'Sin diferencia'
  const parts = qty
    ? [`Diferencia ${signed(qty, formatQty(Math.abs(qty), unit(row)))}`]
    : []
  if (manyStores.value && row.warehouse) parts.push(storeName(row.warehouse))
  return parts.filter(Boolean).join(' · ')
}
// The amount that moves with an Ajuste is its difference, never the value counted.
function rowAmount(row) {
  if (isCount(row) && row.amount_difference != null)
    return signedMoney(row.amount_difference)
  return row.amount != null ? formatMoney(row.amount, props.currency) : ''
}
function amountTone(row) {
  if (!isCount(row)) return 'text-ink-gray-9'
  const n = Number(row.amount_difference) || 0
  if (!n) return 'text-ink-gray-6'
  return n > 0 ? 'text-ink-green-7' : 'text-ink-red-7'
}
function productRoute(item) {
  return { name: 'Producto', params: { item } }
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
