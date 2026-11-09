<template>
  <!-- The supplier's open order per product type: its pieces and money, the
       month's budget that holds the type once this order is bought, and what
       the shop bought of the type in the months before
       (doco.workspaces.hoja_pedido). -->
  <ul class="divide-y divide-outline-gray-1" data-lista-tipos>
    <li v-for="row in rows" :key="row.key" class="py-2" data-lista-tipo>
      <div class="flex items-baseline justify-between gap-2">
        <span class="min-w-0 truncate text-sm font-medium text-ink-gray-9">{{
          row.label
        }}</span>
        <span class="num flex-none text-sm tabular-nums text-ink-gray-9">{{
          money(row.amount, currency)
        }}</span>
      </div>
      <p
        class="text-xs"
        :class="row.over ? 'text-ink-red-7' : 'text-ink-gray-6'"
      >
        {{ row.note }}
      </p>
      <div
        v-if="row.bar"
        class="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
        role="img"
        :aria-label="row.barLabel"
        :title="row.barLabel"
      >
        <span
          class="h-full bg-surface-gray-5"
          :style="{ width: row.bar.committedPct + '%' }"
        />
        <span
          class="h-full"
          :class="row.over ? 'bg-surface-red-5' : 'bg-surface-gray-7'"
          :style="{ width: row.bar.orderPct + '%' }"
        />
      </div>
      <div
        v-if="row.months.length"
        class="mt-1.5 flex items-end gap-1"
        role="img"
        :aria-label="row.monthsLabel"
        :title="row.monthsLabel"
      >
        <span
          v-for="m in row.months"
          :key="m.month"
          class="flex w-7 flex-none flex-col items-center gap-0.5"
        >
          <span class="flex h-5 w-full items-end">
            <span
              class="w-full rounded-sm"
              :class="m.running ? 'bg-surface-gray-3' : 'bg-surface-gray-5'"
              :style="{ height: Math.max(m.pct, m.amount ? 8 : 0) + '%' }"
            />
          </span>
          <span class="text-[10px] leading-none text-ink-gray-5">{{
            m.label
          }}</span>
        </span>
        <span
          v-if="row.average"
          class="num ml-auto self-center text-right text-[11px] leading-tight tabular-nums text-ink-gray-6"
          >{{
            __('{0} a month', [money(row.average, currency)], 'Lista')
          }}</span
        >
      </div>
    </li>
  </ul>
</template>

<script setup>
import { computed } from 'vue'
import { money } from '@/composables/useCompras'
import { budgetBar, monthBars, monthlyAverage } from '@/utils/hojaPedido'

const props = defineProps({
  /** typeRows(): [{item_group, pieces, amount, budget, history}]. */
  groups: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  supplierName: { type: String, default: '' },
})

function budgetNote(group, shared) {
  const b = group.budget
  const pieces = __('{0} pcs', [group.pieces], 'Lista')
  if (!b) return __('{0}, no budget for this type', [pieces], 'Lista')
  if (shared)
    return __(
      '{0}, counted in the {1} budget above',
      [pieces, b.concept],
      'Lista',
    )
  if (b.left < 0)
    return __(
      '{0}, {1} over the {2} budget',
      [pieces, money(-b.left, props.currency), b.concept],
      'Lista',
    )
  return __(
    '{0}, {1} left of {2} after this order',
    [pieces, money(b.left, props.currency), b.concept],
    'Lista',
  )
}

// Types under one budget concept share it: the first shows the bar, the
// others point at it.
const rows = computed(() => {
  const seen = new Set()
  return props.groups.map((group) => {
    const months = monthBars(group.history)
    const b = group.budget
    const shared = Boolean(b && seen.has(b.concept))
    if (b) seen.add(b.concept)
    return {
      key: group.item_group || '-',
      label: group.item_group || __('No type', null, 'Lista'),
      amount: group.amount,
      over: Boolean(b && b.state === 'over'),
      note: budgetNote(group, shared),
      bar: shared ? null : budgetBar(b),
      barLabel: b
        ? __(
            '{0}: {1} committed, {2} this order, of {3}',
            [
              b.concept,
              money(b.committed, props.currency),
              money(b.order, props.currency),
              money(b.amount, props.currency),
            ],
            'Lista',
          )
        : '',
      months,
      average: Math.round(monthlyAverage(group.history)),
      monthsLabel: months
        .map((m) =>
          m.supplier
            ? __(
                '{0} {1} ({2} from {3})',
                [
                  m.label,
                  money(m.amount, props.currency),
                  money(m.supplier, props.currency),
                  props.supplierName,
                ],
                'Lista',
              )
            : `${m.label} ${money(m.amount, props.currency)}`,
        )
        .join(', '),
    }
  })
})
</script>
