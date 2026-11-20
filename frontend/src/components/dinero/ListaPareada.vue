<template>
  <!-- Por explicar's paired lists (crm docs/DINERO_EN_ORDEN.md §3d): movements
       whose money is already in the books, or that pay an open invoice. Each
       row says what it pairs with and what the tap does; the rows done stay in
       place with their result, and the batch has its undo. -->
  <section
    class="mx-4 mt-6 flex-none"
    :aria-label="title"
    :data-lista-pareada="kind"
  >
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-base font-medium text-ink-gray-9">{{ title }}</h2>
      <span
        v-if="rows.length"
        class="num whitespace-nowrap text-sm text-ink-gray-6"
        >{{ countText(rows.length) }}</span
      >
    </div>
    <p class="mt-0.5 text-sm text-ink-gray-6">{{ hint }}</p>
    <ul
      class="mt-2 divide-y divide-outline-gray-1 border-y border-outline-gray-1"
    >
      <li
        v-for="item in shown"
        :key="item.row.name"
        class="py-3 text-sm"
        :data-lista-pareada-fila="item.row.name"
        :data-lista-pareada-hecha="item.note ? '' : undefined"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="min-w-0 break-words"
            :class="item.note ? 'text-ink-gray-6' : 'text-ink-gray-9'"
            >{{ item.row.description }}</span
          >
          <span
            class="num whitespace-nowrap"
            :class="item.note ? 'text-ink-gray-6' : 'text-ink-gray-9'"
            >{{ item.row.direction === 'Deposit' ? '+' : '−'
            }}{{ fmt(item.row.amount) }}</span
          >
        </div>
        <p class="text-ink-gray-6">
          {{ item.row.bank_label }} · {{ dayText(item.row.date) }}
        </p>
        <p
          v-if="item.note"
          class="mt-1 flex items-start gap-1.5 text-ink-green-7"
        >
          <span
            class="lucide-check-circle-2 mt-0.5 size-4 flex-none"
            aria-hidden="true"
          />
          <span class="min-w-0 break-words">{{ item.note }}</span>
        </p>
        <p
          v-else
          class="mt-1 flex items-start gap-1.5"
          :class="ready(item.row) ? 'text-ink-gray-8' : 'text-ink-gray-6'"
        >
          <span
            class="lucide-arrow-right mt-0.5 size-4 flex-none"
            aria-hidden="true"
          />
          <span class="min-w-0 break-words">{{ pairText(item.row) }}</span>
        </p>
      </li>
      <li v-if="items.length > shown.length" class="py-2">
        <button
          type="button"
          class="press min-h-11 text-sm font-medium text-ink-gray-8"
          @click="all = true"
        >
          Ver los {{ items.length }}
        </button>
      </li>
    </ul>
    <p
      v-if="result.text"
      role="status"
      class="mt-3 text-sm text-ink-gray-8"
      data-por-explicar-recibo
    >
      {{ result.text }}
    </p>
    <p
      v-if="result.problem"
      role="alert"
      class="mt-2 flex items-start gap-1.5 text-sm text-ink-red-7"
    >
      <span
        class="lucide-circle-alert mt-0.5 size-4 flex-none"
        aria-hidden="true"
      />
      <span class="min-w-0">{{ result.problem }}</span>
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        v-if="canAct && actionable.length"
        class="min-h-11"
        variant="solid"
        :label="actionLabel"
        :loading="busy"
        :data-lista-pareada-accion="kind"
        @click="emit('act', actionable)"
      />
      <Button
        v-if="result.canUndo"
        class="min-h-11"
        variant="subtle"
        label="Deshacer"
        :loading="result.busy"
        data-por-explicar-deshacer
        @click="emit('undo')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Button } from 'frappe-ui'
import { money } from '@/components/bancos/bancos'
import { countText } from '@/components/dinero/porExplicar'

const SHOWN = 5

const props = defineProps({
  /** «ya»: entries already in the books; «facturas»: open invoices to pay. */
  kind: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  /** Rows the last tap took, kept in place: {row, note}. */
  done: { type: Array, default: () => [] },
  /** The last tap: {text, problem, canUndo, busy}. */
  result: { type: Object, default: () => ({}) },
  currency: { type: String, default: 'MXN' },
  canAct: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['act', 'undo'])

const all = ref(false)
const fmt = (amount) => money(amount, props.currency)
const items = computed(() =>
  [
    ...props.rows.map((row) => ({ row, note: '' })),
    ...props.done.filter((d) => !props.rows.some((r) => r.name === d.row.name)),
  ].sort((a, b) => String(b.row.date).localeCompare(String(a.row.date))),
)
const shown = computed(() =>
  all.value ? items.value : items.value.slice(0, SHOWN),
)
const title = computed(() =>
  props.kind === 'ya' ? 'Ya están en tus libros' : 'Facturas por pagar',
)
const hint = computed(() =>
  props.kind === 'ya'
    ? 'Ese dinero ya está registrado. Al ligarlo, el movimiento del banco queda explicado y tus saldos no cambian.'
    : 'Cada movimiento pagó una factura que sigue abierta. Al registrarlo, la factura queda pagada desde esa cuenta, con la fecha del movimiento, y el movimiento queda explicado.',
)
const actionable = computed(() => props.rows.filter(ready))
const actionLabel = computed(() => {
  const n = actionable.value.length
  if (props.kind === 'ya')
    return n === 1 ? 'Ligar 1 movimiento' : `Ligar los ${n}`
  return n === 1 ? 'Registrar 1 pago' : `Registrar los ${n} pagos`
})

function ready(r) {
  return props.kind === 'facturas' || Boolean(r.entry?.ligable)
}

function pairText(r) {
  if (props.kind === 'facturas') {
    const inv = r.invoice || {}
    const what =
      r.direction === 'Deposit' ? 'Cobro de la factura' : 'Pago de la factura'
    const who = inv.party ? ` de ${inv.party}` : ''
    const when = inv.date ? ` del ${dayText(inv.date)}` : ''
    return `${what}${who}${when}`
  }
  const e = r.entry || {}
  const what = [e.word, e.party, e.date && `del ${dayText(e.date)}`]
    .filter(Boolean)
    .join(' · ')
  return e.ligable
    ? what
    : `${what}. Ya está en tus libros: no lo registres otra vez.`
}

function dayText(day) {
  if (!day) return ''
  return new Date(`${String(day).slice(0, 10)}T12:00:00`).toLocaleDateString(
    'es-MX',
    { day: 'numeric', month: 'short' },
  )
}
</script>
