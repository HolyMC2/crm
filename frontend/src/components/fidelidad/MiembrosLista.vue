<template>
  <!-- Points members ranked by the points they hold: the row opens the
       customer, the coins beside it adjust their points. -->
  <ul class="divide-y divide-outline-gray-1" data-testid="fidelidad-miembros">
    <li v-for="(m, i) in members" :key="m.name" class="flex items-center">
      <ListRow
        class="min-w-0 flex-1 sm:pl-5"
        :title="m.customer_name"
        :subtitle="m.customer_group || ''"
        :avatar="m.customer_name"
        :to="sourceRoute('Customer', m.name)"
      >
        <template #trailing>
          <span class="num whitespace-nowrap text-sm font-semibold">
            {{ __('{0} pts', [m.points]) }}
          </span>
        </template>
      </ListRow>
      <button
        v-if="canAdjust"
        type="button"
        class="press mr-2 grid size-11 flex-none place-items-center rounded-full hover:bg-surface-gray-2"
        :aria-label="__('Adjust points of {0}', [m.customer_name])"
        :title="__('Adjust points of {0}', [m.customer_name])"
        :data-testid="`fidelidad-ajustar-${i}`"
        @click="$emit('adjust', m)"
      >
        <span class="lucide-coins size-4" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>
<script setup>
import { ListRow } from '@/components/ui'
import { sourceRoute } from '@/utils/shellRoutes'

defineProps({
  members: { type: Array, default: () => [] },
  canAdjust: { type: Boolean, default: false },
})
defineEmits(['adjust'])
</script>
