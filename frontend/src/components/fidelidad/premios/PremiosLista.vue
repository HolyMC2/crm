<template>
  <!-- The shop's rewards: one row each, what it costs in points, the product
       and until when, how many wait at the register or were taken, and its
       state. A tap opens it. -->
  <ul class="divide-y divide-outline-gray-1" data-testid="fidelidad-premios">
    <li v-for="r in rows" :key="r.name">
      <ListRow
        class="sm:px-5"
        :title="r.title"
        :subtitle="subtitle(r)"
        :subtitle-lines="2"
        :subtitle-tone="r.ending_soon ? 'text-ink-amber-8' : ''"
        icon="lucide-gift"
        data-fidelidad-premio-fila
        @click="$emit('open', r)"
      >
        <template #trailing>
          <StatusChip :label="stateChip(r).label" :tone="stateChip(r).tone" />
        </template>
      </ListRow>
    </li>
  </ul>
</template>
<script setup>
import { ListRow, StatusChip } from '@/components/ui'
import { CTX, redeemedLine, rewardLine, stateChip } from './view'

defineProps({
  rows: { type: Array, default: () => [] },
})
defineEmits(['open'])

function subtitle(row) {
  const parts = [rewardLine(row), redeemedLine(row)]
  if (!row.show_to_customers) parts.push(__('Hidden from customers', null, CTX))
  return parts.filter(Boolean).join(' · ')
}
</script>
