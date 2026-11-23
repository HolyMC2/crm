<template>
  <!-- The shop's challenges: one row each, the goal (purchases or money), what
       completing it gives and until when, how many customers completed it, and
       its state. A tap opens it. -->
  <ul class="divide-y divide-outline-gray-1" data-testid="fidelidad-retos">
    <li v-for="c in rows" :key="c.name">
      <ListRow
        class="sm:px-5"
        :title="c.title"
        :subtitle="subtitle(c)"
        :subtitle-lines="2"
        :subtitle-tone="c.ending_soon ? 'text-ink-amber-8' : ''"
        icon="lucide-target"
        data-fidelidad-reto-fila
        @click="$emit('open', c)"
      >
        <template #trailing>
          <StatusChip :label="stateChip(c).label" :tone="stateChip(c).tone" />
        </template>
      </ListRow>
    </li>
  </ul>
</template>
<script setup>
import { ListRow, StatusChip } from '@/components/ui'
import {
  CTX,
  awardedLine,
  challengeLine,
  stateChip,
} from '@/components/fidelidad/premios/view'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
})
defineEmits(['open'])

function subtitle(row) {
  const parts = [challengeLine(row, props.currency), awardedLine(row)]
  if (!row.show_to_customers) parts.push(__('Hidden from customers', null, CTX))
  return parts.filter(Boolean).join(' · ')
}
</script>
