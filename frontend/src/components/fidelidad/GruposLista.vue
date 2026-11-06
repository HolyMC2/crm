<template>
  <!-- The customer groups and the price list each one buys at. With room
       (`table`) a row shows the customers as a figure with their share of all
       of them, and the price list in its own column; list rows otherwise. A
       tap opens the group. -->
  <div>
    <div
      v-if="table"
      class="grid items-end gap-x-4 px-5 pb-1.5 text-xs text-ink-gray-5"
      :class="COLUMNS"
      aria-hidden="true"
    >
      <span />
      <span>{{ __('Group') }}</span>
      <span>{{ __('Customers') }}</span>
      <span>{{ __('Price list') }}</span>
    </div>
    <ul
      class="divide-y divide-outline-gray-1"
      :class="table && 'border-t border-outline-gray-1'"
      data-testid="fidelidad-grupos"
    >
      <li v-for="g in groups" :key="g.name">
        <button
          v-if="table"
          type="button"
          class="grid min-h-14 w-full items-center gap-x-4 px-5 py-2 text-left hover:bg-surface-gray-1 focus-visible:bg-surface-gray-2"
          :class="COLUMNS"
          :aria-label="`${g.label}: ${groupLine(g)}`"
          data-fidelidad-grupo-fila
          @click="$emit('open', g)"
        >
          <span
            class="grid size-9 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-7"
            aria-hidden="true"
          >
            <span class="lucide-users size-5" />
          </span>
          <span
            class="min-w-0 truncate text-md font-medium text-ink-gray-9"
            :title="g.label"
            >{{ g.label }}</span
          >
          <span class="min-w-0">
            <span class="num block text-md font-semibold text-ink-gray-9">{{
              g.customers
            }}</span>
            <span
              class="mt-1 block h-1 overflow-hidden rounded-full bg-surface-gray-2"
              :title="__('{0} % of the customers', [percent(g)])"
            >
              <span
                class="block h-full rounded-full bg-surface-gray-7"
                :style="{ width: `${percent(g)}%` }"
              />
            </span>
          </span>
          <span
            class="flex min-w-0 items-center gap-1.5 text-sm"
            :class="
              g.price_list ? 'font-medium text-ink-gray-9' : 'text-ink-gray-5'
            "
          >
            <span
              v-if="g.price_list"
              class="lucide-tags size-4 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="truncate">{{
              g.price_list || __('Default price list')
            }}</span>
          </span>
        </button>
        <ListRow
          v-else
          class="sm:px-5"
          :title="g.label"
          :subtitle="groupLine(g)"
          icon="lucide-users"
          @click="$emit('open', g)"
        />
      </li>
    </ul>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { ListRow } from '@/components/ui'
import { groupLine } from '@/composables/fidelidad'

const props = defineProps({
  groups: { type: Array, default: () => [] },
  /** A table row per group (a wide column); list rows otherwise. */
  table: { type: Boolean, default: false },
})
defineEmits(['open'])

const COLUMNS =
  'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,14rem)]'
const total = computed(() =>
  props.groups.reduce((sum, g) => sum + (g.customers || 0), 0),
)
const percent = (group) =>
  total.value ? Math.round(((group.customers || 0) / total.value) * 100) : 0
</script>
