<template>
  <!-- One movement: what happened in plain words (Nu «Recibiste una
       transferencia»), its match or «Sin conciliar», one signed amount. -->
  <ListRow
    :title="row.title"
    :data-bancos-row="row.name"
    :data-state="row.state || undefined"
    @click="emit('open', row)"
  >
    <template #leading>
      <span
        class="flex size-10 flex-none items-center justify-center rounded-full text-lg font-semibold"
        :class="
          incoming
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'bg-surface-gray-2 text-ink-gray-7'
        "
        aria-hidden="true"
        >{{ incoming ? '+' : '−' }}</span
      >
    </template>
    <template #subtitle>
      <span
        :class="
          vista === 'banco' && row.state !== 'conciliado'
            ? 'text-ink-amber-8'
            : ''
        "
        >{{ line }}</span
      >
    </template>
    <template #trailing>
      <span
        class="whitespace-nowrap text-base font-semibold tabular-nums"
        :class="amountTone(row.amount)"
        data-bancos-amount
        >{{ signedMoney(row.amount, row.currency || currency) }}</span
      >
      <span
        v-if="
          vista === 'libros' &&
          row.balance !== null &&
          row.balance !== undefined
        "
        class="whitespace-nowrap text-xs tabular-nums text-ink-gray-5"
        >{{ money(row.balance, currency) }}</span
      >
      <span
        v-else-if="vista === 'banco' && row.state === 'conciliado'"
        class="lucide-check-check size-4 text-ink-green-7"
        aria-label="Conciliado"
        role="img"
      />
    </template>
  </ListRow>
</template>
<script setup>
import { computed } from 'vue'
import { ListRow } from '@/components/ui'
import { amountTone, money, movementLine, signedMoney } from './bancos'

const props = defineProps({
  row: { type: Object, required: true },
  vista: { type: String, default: 'banco' },
  currency: { type: String, default: 'MXN' },
})
const emit = defineEmits(['open'])
const incoming = computed(() => Number(props.row.amount) > 0)
const line = computed(() =>
  props.vista === 'banco'
    ? movementLine(props.row)
    : [props.row.detail, props.row.voucher?.name].filter(Boolean).join(' · '),
)
</script>
