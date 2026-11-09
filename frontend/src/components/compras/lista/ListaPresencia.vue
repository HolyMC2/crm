<template>
  <!-- Who else is in this supplier's order right now: the people with it open
       (Frappe's doc_viewers) and Muelle while it is changing it. Grey initials,
       as every avatar. -->
  <div
    v-if="people.length || bot"
    class="flex flex-none items-center"
    role="status"
    :aria-label="label"
    :title="label"
    data-lista-presencia
  >
    <span
      v-if="bot"
      class="relative z-[2] flex size-7 items-center justify-center rounded-full bg-surface-gray-3 ring-2 ring-surface-base"
      data-lista-presencia-bot
    >
      <span
        class="lucide-sparkles size-3.5 text-ink-gray-8"
        aria-hidden="true"
      />
      <span
        class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-surface-gray-7 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    </span>
    <span
      v-for="(p, i) in shown"
      :key="p.user"
      class="flex size-7 items-center justify-center rounded-full bg-surface-gray-3 text-[11px] font-semibold text-ink-gray-8 ring-2 ring-surface-base"
      :class="bot || i ? '-ml-1.5' : ''"
      aria-hidden="true"
      >{{ p.initials }}</span
    >
    <span
      v-if="people.length > shown.length"
      class="-ml-1.5 flex size-7 items-center justify-center rounded-full bg-surface-gray-2 text-[11px] text-ink-gray-7 ring-2 ring-surface-base"
      aria-hidden="true"
      >+{{ people.length - shown.length }}</span
    >
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { initials } from '@/utils/listaVivo'

const props = defineProps({
  /** [{user, name}] of the other people with the order open. */
  people: { type: Array, default: () => [] },
  /** Muelle changed the order within the last minute. */
  bot: { type: Boolean, default: false },
})

const shown = computed(() =>
  props.people.slice(0, 3).map((p) => ({ ...p, initials: initials(p.name) })),
)
const label = computed(() => {
  const names = props.people.map((p) => p.name)
  if (props.bot) names.unshift('Muelle')
  const last = names.pop()
  if (!last) return ''
  if (!names.length) return __('{0} is in this order', [last], 'Lista')
  const first = names.join(', ')
  return __('{0} and {1} are in this order', [first, last], 'Lista')
})
</script>
