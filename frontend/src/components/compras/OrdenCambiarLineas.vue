<template>
  <!-- «Cambiar artículos» on a confirmed purchase (Desk's «Update Items»): the
       quantities, prices and discounts of its lines, lines added, and the ones
       nothing arrived for removed. What arrived is the floor of each line. -->
  <BottomSheet
    :open="open"
    :title="__('Change items')"
    :dismissible="!busy && !dirty"
    @update:open="(v) => !busy && emit('update:open', v)"
  >
    <p class="pb-2 text-base text-ink-gray-7">
      {{
        __(
          'The supplier already has this purchase: tell them what changed after you save.',
        )
      }}
    </p>
    <ul class="divide-y divide-outline-gray-1" data-testid="cambiar-lineas">
      <li
        v-for="(row, index) in lines"
        :key="row.key"
        class="relative grid grid-cols-3 gap-2 py-3 sm:grid-cols-[1fr_6rem_7.5rem_5.5rem_auto] sm:items-end"
        :data-linea="row.item_code"
      >
        <div class="col-span-3 min-w-0 pr-11 sm:col-span-1 sm:pr-0">
          <p class="break-words font-medium text-ink-gray-9">
            {{ row.item_label || row.item_code }}
          </p>
          <p class="break-words text-sm text-ink-gray-6">
            {{ lineNote(row) }}
          </p>
        </div>
        <FormControl
          v-model="row.qty"
          type="number"
          :label="__('Quantity', null, 'Compras')"
          :min="row.received_qty || 0"
          step="any"
        />
        <FormControl
          v-model="row.rate"
          type="number"
          :label="__('Price', null, 'Compras')"
          min="0"
          step="any"
        />
        <FormControl
          v-model="row.discount_percentage"
          type="number"
          :label="__('% disc.', null, 'Compras')"
          min="0"
          max="100"
          step="any"
        />
        <button
          v-if="row.removable"
          type="button"
          class="press absolute right-0 top-2 flex size-11 items-center justify-center rounded-full text-ink-gray-7 sm:static sm:self-end [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Remove {0}', [row.item_label || row.item_code])"
          :title="__('Remove {0}', [row.item_label || row.item_code])"
          @click="lines.splice(index, 1)"
        >
          <span class="lucide-trash-2 size-5" aria-hidden="true" />
        </button>
        <p
          v-if="lineProblem(row)"
          role="alert"
          class="col-span-3 break-words text-sm text-ink-red-7 sm:col-span-5"
        >
          {{ lineProblem(row) }}
        </p>
      </li>
      <li class="py-3">
        <ComprasPicker
          model-value=""
          :label="__('Add item')"
          :placeholder="__('Search item, code or barcode')"
          :empty-text="__('Only existing purchasable items appear here.')"
          clear-on-pick
          :load="(q) => comprasApi('items', { search: q })"
          @pick="addItem"
        />
      </li>
    </ul>
    <p class="pt-2 text-base text-ink-gray-8" data-testid="cambiar-total">
      {{ __('New subtotal: {0}', [money(subtotal, currency)]) }}
    </p>
    <p v-if="error" role="alert" class="pt-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || !ready"
        data-testid="cambiar-guardar"
        @click="save"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ __('Save changes') }}
      </button>
      <button
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="emit('update:open', false)"
      >
        {{ __('Cancel', null, 'Compras') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { BTN } from '@/documentos/tools'
import {
  comprasApi,
  money,
  netRate,
  qty,
  rowPrice,
} from '@/composables/useCompras'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Every line of the purchase as the service reads them (`order().rows`).
  rows: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'save'])

let key = 0
const lines = ref([])
const start = ref('')

function fromRow(row) {
  return {
    key: ++key,
    name: row.name,
    item_code: row.item_code,
    item_label: row.item_name,
    qty: row.qty,
    uom: row.uom,
    // The price before the line's discount, so «% desc.» reads on top of it.
    rate: rowPrice(row),
    discount_percentage: Number(row.discount_percentage) || 0,
    received_qty: Number(row.received_qty) || 0,
    billed_amt: Number(row.billed_amt) || 0,
    removable: row.removable !== false,
  }
}
watch(
  () => props.open,
  (open) => {
    if (!open) return
    lines.value = props.rows.map(fromRow)
    start.value = JSON.stringify(payload())
  },
  { immediate: true },
)

function addItem(option) {
  lines.value.push({
    key: ++key,
    name: '',
    item_code: option.value,
    item_label: option.label,
    qty: 1,
    uom: option.uom,
    // A confirmed purchase does not look the price up: the last one paid, to change.
    rate: Number(option.last_rate) || '',
    discount_percentage: 0,
    received_qty: 0,
    billed_amt: 0,
    removable: true,
  })
}

function lineNote(row) {
  const unit = row.uom ? ` ${row.uom}` : ''
  if (!row.name) return __('New line') + (row.uom ? ` · ${row.uom}` : '')
  if (row.received_qty)
    return __('{0} arrived: it cannot go under that.', [
      qty(row.received_qty) + unit,
    ])
  if (row.billed_amt)
    return __('Billed {0}: it stays.', [money(row.billed_amt, props.currency)])
  return __('Nothing arrived yet') + (row.uom ? ` · ${row.uom}` : '')
}
function lineProblem(row) {
  const amount = Number(row.qty)
  if (!(amount > 0)) return __('Put a quantity above zero.')
  if (amount < row.received_qty)
    return __('{0} already arrived: put at least that.', [
      qty(row.received_qty),
    ])
  if (!row.name && !(Number(row.rate) > 0))
    return __('Put its price: a confirmed purchase does not look it up.')
  const off = Number(row.discount_percentage) || 0
  if (off < 0 || off > 100) return __('The discount goes from 0 to 100 %.')
  return ''
}

function payload() {
  return lines.value.map((row) => ({
    ...(row.name ? { name: row.name } : {}),
    item_code: row.item_code,
    qty: Number(row.qty),
    ...(row.uom ? { uom: row.uom } : {}),
    rate: Number(row.rate) || 0,
    discount_percentage: Number(row.discount_percentage) || 0,
  }))
}
const dirty = computed(
  () => props.open && JSON.stringify(payload()) !== start.value,
)
const ready = computed(
  () =>
    dirty.value &&
    lines.value.length > 0 &&
    lines.value.every((row) => !lineProblem(row)),
)
const subtotal = computed(() =>
  lines.value.reduce(
    (sum, row) =>
      sum + (Number(row.qty) || 0) * netRate(row.rate, row.discount_percentage),
    0,
  ),
)

function save() {
  if (!ready.value) return
  emit('save', payload())
}
</script>
<style scoped>
/* 44 px fields on a phone, like the purchase editor's. */
@media (max-width: 639px) {
  [data-testid='cambiar-lineas'] :deep(input) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
