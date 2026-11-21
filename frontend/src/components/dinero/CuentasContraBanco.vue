<template>
  <!-- Por explicar's goal (crm docs/DINERO_EN_ORDEN.md §3d): each bank and card
       account against its bank, and where it lands once everything waiting on it
       is explained. A tap opens the account's «¿Cuadra con el banco?». -->
  <section
    class="mx-4 mt-6 flex-none"
    aria-label="Tus cuentas contra el banco"
    data-cuentas-contra-banco
  >
    <h2 class="text-sm font-medium text-ink-gray-7">
      Tus cuentas contra el banco
    </h2>
    <ul
      class="mt-1 divide-y divide-outline-gray-1 border-y border-outline-gray-1"
    >
      <li
        v-for="a in shown"
        :key="a.bank_account"
        :data-fresh="fresh.has(accountKey(a)) ? '' : undefined"
      >
        <button
          type="button"
          class="press flex min-h-14 w-full items-start gap-3 py-3 text-left"
          :data-cuenta-contra-banco="a.bank_account"
          @click="emit('abrir', a.bank_account)"
        >
          <span class="min-w-0 flex-1">
            <span class="block break-words text-base text-ink-gray-9">{{
              a.label
            }}</span>
            <span v-if="a.figures" class="block text-sm text-ink-gray-6">
              {{ a.figures.bank }}
              <span class="num whitespace-nowrap">{{
                a.figures.bankAmount
              }}</span>
              · Libros
              <span class="num whitespace-nowrap">{{ a.figures.books }}</span>
            </span>
            <span
              class="mt-0.5 block text-sm"
              :class="a.state.agrees ? 'text-ink-green-7' : 'text-ink-gray-8'"
              data-cuenta-contra-banco-linea
              >{{ a.state.line }}</span
            >
          </span>
          <span v-if="a.state.known" class="flex-none text-right">
            <span
              class="num block whitespace-nowrap text-base font-semibold"
              :class="a.state.agrees ? 'text-ink-green-7' : 'text-ink-gray-9'"
              >{{ a.state.figure }}</span
            >
            <span v-if="!a.state.agrees" class="block text-xs text-ink-gray-6"
              >no cuadra</span
            >
          </span>
          <span
            class="lucide-chevron-right mt-1 size-4 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { money } from '@/components/bancos/bancos'
import { accountKey, accountState } from '@/components/dinero/porExplicar'

const props = defineProps({
  /** The page's accounts: {bank_account, label, count, net}. */
  rows: { type: Array, default: () => [] },
  /** crm Bancos' accounts (balances and difference), when readable. */
  cards: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  /** Keys a live read just changed (porExplicar.liveKeys), marked a moment. */
  fresh: { type: Set, default: () => new Set() },
})
const emit = defineEmits(['abrir'])

const fmt = (n) => money(n, props.currency)

const shown = computed(() => {
  const byName = new Map((props.cards || []).map((c) => [c.cuenta, c]))
  return (props.rows || [])
    .map((r) => {
      const card = byName.get(r.bank_account) || null
      const bank = card?.bank_balance?.amount
      const figures =
        card && bank !== null && bank !== undefined && card.balance !== null
          ? {
              bank: card.kind === 'tarjeta' ? 'Debes según el banco' : 'Banco',
              bankAmount: fmt(bank),
              books: fmt(card.balance),
            }
          : null
      return {
        ...r,
        label: card?.label || r.label,
        figures,
        state: accountState(card, r, fmt),
      }
    })
    .filter((a) => a.count || a.state.known)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})
</script>
