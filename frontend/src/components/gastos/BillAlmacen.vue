<template>
  <!-- «En el almacén»: the bill's goods in Escáner (receive, its receipts and
       tasks) and their labels, as flat rows. A step this worker cannot take
       says why and, when a manager can, offers to ask one. -->
  <section
    v-if="rows.length"
    aria-labelledby="bill-almacen"
    class="px-4"
    data-testid="bill-almacen"
  >
    <h2
      id="bill-almacen"
      class="flex items-center gap-2 pb-1 text-base font-semibold text-ink-gray-9"
    >
      {{ __('In the warehouse') }}
    </h2>
    <ul class="divide-y divide-outline-gray-1">
      <li v-for="row in rows" :key="row.key" class="min-w-0">
        <component
          :is="tag(row)"
          v-bind="target(row)"
          class="flex min-h-14 w-full items-center gap-3 py-2 text-left"
          :class="
            tag(row) === 'div'
              ? ''
              : 'press rounded-6 [@media(hover:hover)]:hover:bg-surface-gray-1'
          "
          :data-almacen="row.key"
        >
          <span
            class="flex size-10 flex-none items-center justify-center rounded-full"
            :class="
              row.step
                ? 'bg-surface-gray-10 text-ink-base'
                : 'bg-surface-gray-2 text-ink-gray-7'
            "
            aria-hidden="true"
          >
            <span :class="[row.icon, 'size-5']" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="break-words text-base text-ink-gray-9">{{
              row.title
            }}</span>
            <span
              v-if="row.subtitle"
              class="break-words text-sm text-ink-gray-6"
              >{{ row.subtitle }}</span
            >
            <span
              v-if="row.reason"
              class="break-words text-sm text-ink-gray-7"
              >{{ row.reason }}</span
            >
          </span>
          <span
            v-if="row.href"
            class="lucide-external-link size-4 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
        </component>
        <button
          v-if="row.ask"
          type="button"
          class="press mb-2 ml-[3.25rem] inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base-medium text-ink-gray-9"
          @click="emit('ask', row.reason)"
        >
          {{ __('Ask for it to be received') }}
        </button>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { RouterLink } from 'vue-router'
import { documentRoute } from '@/documentos/registry'
import { etiquetasHref } from '@/composables/useEtiquetas'

const props = defineProps({
  // billAlmacen.js warehouseRows(...)
  rows: { type: Array, default: () => [] },
  // The bill, for its labels' «desde».
  bill: { type: String, required: true },
})
const emit = defineEmits(['ask'])

function tag(row) {
  if (row.href) return 'a'
  if (row.receipt || row.labels) return RouterLink
  return 'div'
}
function target(row) {
  if (row.href) return { href: row.href }
  if (row.receipt)
    return {
      to: documentRoute('Purchase Receipt', row.receipt) || '/documentos',
    }
  if (row.labels)
    return {
      to: etiquetasHref([], { desde: `Purchase Invoice:${props.bill}` }),
    }
  return {}
}
</script>
