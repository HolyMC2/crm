<template>
  <!-- The promotions of one state. On a phone and in a narrow column each is a
       list row; with room (`table`) it is a table row: what it is, what it
       applies to and when it runs, the discount as a figure, its coupons
       (when one of them takes coupons) and its state. A tap opens it. -->
  <div>
    <div
      v-if="table"
      class="grid items-end gap-x-4 px-5 pb-1.5 text-xs text-ink-gray-5"
      :class="columns"
      aria-hidden="true"
    >
      <span />
      <span>{{ __('Promotion') }}</span>
      <span class="text-right">{{ __('Discount') }}</span>
      <span v-if="withCoupons">{{ __('Coupons') }}</span>
      <span class="text-right">{{ __('State') }}</span>
    </div>
    <ul
      class="divide-y divide-outline-gray-1"
      :class="table && 'border-t border-outline-gray-1'"
      data-testid="fidelidad-promos"
    >
      <li v-for="o in offers" :key="o.name">
        <button
          v-if="table"
          type="button"
          class="grid min-h-14 w-full items-center gap-x-4 px-5 py-2 text-left hover:bg-surface-gray-1 focus-visible:bg-surface-gray-2"
          :class="columns"
          data-fidelidad-promo-fila
          @click="$emit('open', o)"
        >
          <span
            class="grid size-9 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-7"
            aria-hidden="true"
          >
            <span :class="iconFor(o)" class="size-5" />
          </span>
          <span class="min-w-0">
            <span
              class="block truncate text-md font-medium text-ink-gray-9"
              :title="o.title"
              >{{ o.title }}</span
            >
            <span class="block truncate text-sm text-ink-gray-6"
              >{{ targetLabel(o, currency) }} ·
              <span :class="o.ending_soon && 'text-ink-amber-8'">{{
                offerWhen(o)
              }}</span></span
            >
          </span>
          <span class="min-w-0 text-right">
            <span
              class="num block truncate text-xl font-semibold leading-tight text-ink-gray-9"
              >{{ discountFigure(o.discount, currency).value }}</span
            >
            <span class="block truncate text-xs text-ink-gray-6">{{
              discountFigure(o.discount, currency).note
            }}</span>
          </span>
          <span
            v-if="withCoupons"
            class="num min-w-0 text-sm text-ink-gray-7"
            >{{ couponLine(o) }}</span
          >
          <span class="flex justify-end">
            <StatusChip :label="offerChip(o).label" :tone="offerChip(o).tone" />
          </span>
        </button>
        <ListRow
          v-else
          class="sm:px-5"
          :title="o.title"
          :subtitle="`${offerSummary(o, currency)} · ${offerWhen(o)}`"
          :subtitle-tone="o.ending_soon ? 'text-ink-amber-8' : ''"
          :icon="iconFor(o)"
          @click="$emit('open', o)"
        >
          <template #trailing>
            <StatusChip :label="offerChip(o).label" :tone="offerChip(o).tone" />
          </template>
        </ListRow>
      </li>
    </ul>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { ListRow, StatusChip } from '@/components/ui'
import {
  couponLine,
  discountFigure,
  offerChip,
  offerSummary,
  offerWhen,
  targetLabel,
} from '@/composables/fidelidad'

const props = defineProps({
  offers: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  /** A table row per promotion (a wide column); list rows otherwise. */
  table: { type: Boolean, default: false },
})
defineEmits(['open'])

// A shop without coupon promotions needs no coupons column.
const withCoupons = computed(() => props.offers.some((o) => o.coupon_based))
const columns = computed(() =>
  withCoupons.value
    ? 'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,6.5rem)_minmax(0,8rem)_6.5rem]'
    : 'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,6.5rem)_6.5rem]',
)
const iconFor = (offer) =>
  offer.coupon_based ? 'lucide-ticket' : 'lucide-badge-percent'
</script>
