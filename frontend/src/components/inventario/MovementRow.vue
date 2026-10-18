<template>
  <!-- One ledger post (DD10): the kind's icon, what moved (the product, or
       on a product's own log the movement itself), the store, who and when;
       the signed quantity and the balance it left at the end. The row opens
       the voucher when the shell has a page for it. -->
  <ListRow
    :to="link"
    :title="title"
    :subtitle-lines="2"
    data-kardex-row
    :data-kind="row.kind"
  >
    <template #leading>
      <span
        class="flex size-10 flex-none items-center justify-center rounded-full"
        :class="tone"
        aria-hidden="true"
      >
        <span :class="[kindIcon(row.kind), 'size-5']" />
      </span>
    </template>
    <template #subtitle>
      <span v-if="showItem" class="block truncate">{{ rowAction(row) }}</span>
      <span class="block truncate">{{ where }}</span>
    </template>
    <template #trailing>
      <span
        class="whitespace-nowrap text-base font-semibold tabular-nums"
        :class="qtyTone(row.qty)"
        data-kardex-qty
        >{{ signedQty(row.qty, row.uom) }}</span
      >
      <span class="whitespace-nowrap text-xs tabular-nums text-ink-gray-6">{{
        rowBalance(row)
      }}</span>
    </template>
  </ListRow>
</template>
<script setup>
import { computed } from 'vue'
import { ListRow } from '@/components/ui'
import {
  kindIcon,
  qtyTone,
  rowAction,
  rowBalance,
  rowPeople,
  signedQty,
  voucherLink,
} from './kardex'

const props = defineProps({
  row: { type: Object, required: true },
  /** The shop-wide log names the product; a product's own log does not. */
  showItem: { type: Boolean, default: true },
  /** The store is said once in the page title when the log is one store's. */
  showStore: { type: Boolean, default: true },
  /** «12:41», or «17 oct 12:41» in a list that is not grouped by day. */
  when: { type: String, default: '' },
})

const link = computed(() => voucherLink(props.row.voucher))
const title = computed(() =>
  props.showItem ? props.row.item_name : rowAction(props.row),
)
// Who and when first: a long store name is what truncates.
const where = computed(() =>
  [
    rowPeople(props.row),
    props.when || props.row.time,
    props.showStore ? props.row.store : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const tone = computed(() => {
  const n = Number(props.row.qty) || 0
  if (props.row.kind === 'ajuste' || props.row.kind === 'traspaso')
    return 'bg-surface-gray-2 text-ink-gray-7'
  return n > 0
    ? 'bg-surface-green-2 text-ink-green-8'
    : 'bg-surface-red-2 text-ink-red-8'
})
</script>
