<template>
  <!-- One account (BBVA «Cuenta Ahorro •4 2361 · $12,799.00 Disponible»;
       Xero «30 to match · Balance in Xero / Statement balance»). -->
  <RouterLink
    :to="{ name: 'BancoCuenta', params: { cuenta: card.cuenta }, query }"
    class="flex min-h-16 items-start gap-3 rounded-7 border p-3 hover:bg-surface-gray-1 focus-visible:bg-surface-gray-2"
    :class="
      selected
        ? 'border-outline-gray-4 bg-surface-gray-1'
        : 'border-outline-gray-2'
    "
    :aria-current="selected ? 'true' : undefined"
    data-bancos-card
    :data-cuenta="card.cuenta"
  >
    <span
      class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
      aria-hidden="true"
    >
      <span :class="[icon, 'size-5']" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="break-words text-base leading-snug text-ink-gray-9">{{
        card.label
      }}</span>
      <span class="truncate text-sm text-ink-gray-6">{{ context }}</span>
      <span
        v-if="card.bank_balance"
        class="text-sm text-ink-gray-6"
        data-bancos-bank-balance
        >En el banco
        <span class="tabular-nums">{{
          money(card.bank_balance.amount, card.currency)
        }}</span>
        · {{ balanceWhen(card.bank_balance.at) }}</span
      >
      <span
        v-if="card.pending"
        class="mt-1 inline-flex min-h-6 w-fit items-center whitespace-nowrap rounded-full bg-surface-amber-2 px-2 text-xs font-medium text-ink-amber-8"
        data-bancos-card-pending
        >{{ card.pending }} sin conciliar</span
      >
    </span>
    <span class="flex flex-none flex-col items-end text-right">
      <span
        class="whitespace-nowrap text-base font-semibold tabular-nums"
        :class="Number(card.balance) < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'"
        >{{ money(card.balance, card.currency) }}</span
      >
      <span class="text-xs text-ink-gray-5">{{
        card.kind === 'tarjeta' ? 'por pagar' : 'en libros'
      }}</span>
    </span>
  </RouterLink>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { balanceWhen, cardContext, money } from './bancos'

const props = defineProps({
  card: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
const route = useRoute()
const query = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const ICONS = {
  banco: 'lucide-wallet',
  tarjeta: 'lucide-credit-card',
  efectivo: 'lucide-hand-coins',
}
const icon = computed(() => ICONS[props.card.kind] || 'lucide-wallet')
const context = computed(() => cardContext(props.card))
</script>
