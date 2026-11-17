<template>
  <!-- Por explicar's paired lists (crm docs/DINERO_EN_ORDEN.md §3d): movements
       whose money is already in the books, or that pay an open invoice. Each
       row says what it pairs with; one button takes every row that can go. -->
  <section
    class="mx-4 mt-4 flex-none rounded-7 border border-outline-gray-2 p-4"
    :aria-label="title"
    :data-lista-pareada="kind"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 class="text-base font-medium text-ink-gray-9">{{ title }}</h2>
      <span class="num whitespace-nowrap text-sm text-ink-gray-6">{{
        countText(rows.length)
      }}</span>
    </div>
    <p class="mt-0.5 text-sm text-ink-gray-6">{{ hint }}</p>
    <ul class="mt-2 divide-y divide-outline-gray-1">
      <li
        v-for="r in shown"
        :key="r.name"
        class="py-2 text-sm"
        :data-lista-pareada-fila="r.name"
      >
        <div class="flex items-start justify-between gap-3">
          <span class="min-w-0 break-words text-ink-gray-9">{{
            r.description
          }}</span>
          <span class="num whitespace-nowrap text-ink-gray-9"
            >{{ r.direction === 'Deposit' ? '+' : '−'
            }}{{ fmt(r.amount) }}</span
          >
        </div>
        <p class="text-ink-gray-6">
          {{ r.bank_label }} · {{ dayText(r.date) }}
        </p>
        <p
          class="mt-0.5 flex items-start gap-1"
          :class="ready(r) ? 'text-ink-gray-8' : 'text-ink-gray-6'"
        >
          <span
            class="lucide-arrow-right mt-0.5 size-4 flex-none"
            aria-hidden="true"
          />
          <span class="min-w-0 break-words">{{ pairText(r) }}</span>
        </p>
      </li>
      <li v-if="rows.length > shown.length" class="py-2">
        <button
          type="button"
          class="press min-h-11 text-sm font-medium text-ink-gray-8"
          @click="all = true"
        >
          Ver los {{ rows.length }}
        </button>
      </li>
    </ul>
    <Button
      v-if="canAct && actionable.length"
      class="mt-3 min-h-11"
      variant="solid"
      :label="actionLabel"
      :loading="busy"
      :data-lista-pareada-accion="kind"
      @click="emit('act', actionable)"
    />
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
  currency: { type: String, default: 'MXN' },
  canAct: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['act'])

const all = ref(false)
const fmt = (amount) => money(amount, props.currency)
const shown = computed(() =>
  all.value ? props.rows : props.rows.slice(0, SHOWN),
)
const title = computed(() =>
  props.kind === 'ya' ? 'Ya están en tus libros' : 'Facturas por pagar',
)
const hint = computed(() =>
  props.kind === 'ya'
    ? 'Ese dinero ya está registrado: lígalo con su movimiento para no registrarlo dos veces.'
    : 'Cada cargo es el pago de una factura que tienes abierta: registra el pago desde esa cuenta.',
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
    const who = inv.party ? ` de ${inv.party}` : ''
    return `Factura${who} · ${inv.name}`
  }
  const e = r.entry || {}
  const what = [e.word, e.party, e.name].filter(Boolean).join(' · ')
  return e.ligable
    ? what
    : `${what}. Ya está en tus libros: no lo registres otra vez.`
}

function dayText(day) {
  if (!day) return ''
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  })
}
</script>
