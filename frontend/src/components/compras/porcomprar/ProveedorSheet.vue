<template>
  <!-- Who a proposed product is bought from: each known supplier with its
       newest price, one tap picks and closes; any other supplier by search. -->
  <BottomSheet
    :open="open"
    :title="line?.item_name || ''"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="line" role="radiogroup" class="space-y-0.5" data-pc-hoja>
      <div
        v-for="row in rows"
        :key="row.supplier"
        class="overflow-hidden first:rounded-t-6 last:rounded-b-6"
      >
        <button
          type="button"
          role="radio"
          class="state-layer flex min-h-16 w-full items-center gap-3 bg-surface-gray-2 px-4 py-2 text-left disabled:cursor-default"
          :class="
            row.supplier === picked
              ? 'bg-[var(--muelle-secondary-container)]'
              : ''
          "
          :aria-checked="row.supplier === picked"
          :disabled="locked"
          :data-pc-oferta="row.supplier"
          @click="emit('pick', row.supplier)"
        >
          <span
            class="flex size-5 flex-none items-center justify-center rounded-full border-2"
            :class="
              row.supplier === picked
                ? 'border-ink-gray-9'
                : 'border-outline-gray-4'
            "
            aria-hidden="true"
          >
            <span
              v-if="row.supplier === picked"
              class="size-2.5 rounded-full bg-ink-gray-9"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block break-words text-base font-medium text-ink-gray-9"
              >{{ labelOf(row.supplier) }}</span
            >
            <span
              v-if="!quantitiesOnly && (row.price_source || row.price_date)"
              class="flex flex-wrap items-center gap-x-1 text-sm"
              :class="row.price_stale ? 'text-ink-amber-7' : 'text-ink-gray-6'"
            >
              <span
                :class="[
                  row.price_stale
                    ? 'lucide-clock'
                    : row.price_source === 'compra'
                      ? 'lucide-receipt'
                      : 'lucide-file-text',
                  'size-3.5',
                ]"
                aria-hidden="true"
              />
              {{
                [sourceLabel(row.price_source), shortDay(row.price_date)]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
            <span
              v-for="extra in row.extras"
              :key="`${extra.supplier}:${extra.price_currency}`"
              class="mt-0.5 flex items-center gap-1 text-sm text-ink-gray-6"
              data-pc-oferta-extra
            >
              <span
                class="rounded-4 bg-surface-gray-3 px-1.5 text-xs font-medium"
                >{{ extra.price_currency }}</span
              >
              <span class="num tabular-nums">{{
                priceText(unitPrice(line, extra), extra.price_currency)
              }}</span>
              <span v-if="extra.price_date"
                >· {{ shortDay(extra.price_date) }}</span
              >
            </span>
          </span>
          <span
            v-if="!quantitiesOnly"
            class="num flex-none text-base font-semibold tabular-nums"
            :class="
              row.price === null
                ? 'font-normal text-ink-gray-6'
                : 'text-ink-gray-9'
            "
            >{{
              row.price === null
                ? __('No price', null, 'PorComprar')
                : priceText(
                    unitPrice(line, row),
                    row.price_currency || currency,
                  )
            }}</span
          >
        </button>
      </div>
    </div>
    <div v-if="line && !locked" class="mt-3">
      <ComprasPicker
        :model-value="''"
        :label="__('Other supplier', null, 'PorComprar')"
        :placeholder="__('Other supplier', null, 'PorComprar')"
        :empty-text="__('No supplier matches', null, 'PorComprar')"
        :load="(q) => comprasApi('suppliers', { search: q })"
        bare
        clear-on-pick
        data-pc-otro
        @pick="emit('pick', $event.value)"
      />
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed } from 'vue'
import { BottomSheet } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { comprasApi } from '@/composables/useCompras'
import { priceText, shortDay, sourceLabel, unitPrice } from './porComprar'

const props = defineProps({
  open: { type: Boolean, default: false },
  line: { type: Object, default: null },
  picked: { type: String, default: '' },
  suppliers: { type: Array, default: () => [] },
  currency: { type: String, default: '' },
  quantitiesOnly: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'pick'])

/** One row per supplier (its home-currency price); a newer price in another
 *  currency rides under it, never as a choice of its own. */
const rows = computed(() => {
  const out = []
  for (const offer of props.line?.offers || []) {
    if (offer.price_extra) {
      const owner = out.find((r) => r.supplier === offer.supplier)
      if (owner) owner.extras.push(offer)
      continue
    }
    out.push({ ...offer, price: offer.price ?? null, extras: [] })
  }
  if (props.picked && !out.some((r) => r.supplier === props.picked))
    out.unshift({ supplier: props.picked, price: null, extras: [] })
  return out
})

function labelOf(supplier) {
  return props.suppliers.find((s) => s.supplier === supplier)?.label || supplier
}
</script>
