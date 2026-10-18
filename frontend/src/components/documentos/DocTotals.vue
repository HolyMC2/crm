<template>
  <!-- Totals: subtotal, discount, each tax, the total, and what is still owed. -->
  <section v-if="lines.length" aria-label="Totales" class="px-4">
    <dl
      class="divide-y divide-outline-gray-1 rounded-xl border border-outline-gray-1"
    >
      <div
        v-for="line in lines"
        :key="line.key"
        class="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
        :class="
          line.strong
            ? 'text-base font-semibold text-ink-gray-9'
            : 'text-sm text-ink-gray-7'
        "
      >
        <dt class="min-w-0 break-words">{{ line.label }}</dt>
        <dd
          class="flex-none tabular-nums"
          :class="line.tone === 'danger' ? 'text-ink-red-7' : ''"
        >
          {{ line.value }}
        </dd>
      </div>
    </dl>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { formatMoney } from '@/utils/display'

const props = defineProps({
  totals: { type: Object, default: () => ({}) },
  taxes: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  docstatus: { type: Number, default: 0 },
  owedLabel: { type: String, default: 'Saldo pendiente' },
})

const money = (value) => formatMoney(value, props.currency)

const lines = computed(() => {
  const t = props.totals || {}
  const out = []
  const total = t.rounded_total || t.grand_total
  if (t.net_total != null && (props.taxes.length || t.discount_amount))
    out.push({ key: 'net', label: 'Subtotal', value: money(t.net_total) })
  if (Number(t.discount_amount))
    out.push({
      key: 'discount',
      label: 'Descuento',
      value: `-${money(t.discount_amount)}`,
    })
  props.taxes.forEach((tax, i) =>
    out.push({
      key: `tax${i}`,
      label: tax.description || 'Impuesto',
      value: money(tax.amount),
    }),
  )
  if (total != null)
    out.push({
      key: 'total',
      label: 'Total',
      value: money(total),
      strong: true,
    })
  if (props.docstatus === 1 && t.outstanding_amount != null && total != null) {
    const owed = Number(t.outstanding_amount)
    if (owed > 0 && owed < Number(total))
      out.push({
        key: 'paid',
        label: 'Pagado',
        value: money(Number(total) - owed),
      })
    if (owed > 0)
      out.push({
        key: 'owed',
        label: props.owedLabel,
        value: money(owed),
        tone: 'danger',
        strong: true,
      })
  }
  if (t.paid_amount != null && t.grand_total == null)
    out.push({
      key: 'paid_amount',
      label: 'Importe',
      value: money(t.paid_amount),
      strong: true,
    })
  return out
})
</script>
