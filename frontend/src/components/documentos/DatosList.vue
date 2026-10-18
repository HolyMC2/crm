<template>
  <!-- Datos: only the fields that hold data (MOBILE_REFERENCES pattern 5), label
       above value at 305px, side by side when there is room; linked records open. -->
  <section v-if="rows.length" aria-labelledby="doc-datos" class="px-4">
    <h2 id="doc-datos" class="pb-1 text-base font-semibold text-ink-gray-9">
      Datos
    </h2>
    <dl class="divide-y divide-outline-gray-1">
      <div
        v-for="row in visible"
        :key="row.fieldname"
        class="flex min-h-11 flex-col justify-center gap-0.5 py-2 min-[420px]:flex-row min-[420px]:items-baseline min-[420px]:gap-4"
      >
        <dt
          class="text-sm text-ink-gray-6 min-[420px]:w-2/5 min-[420px]:flex-none"
        >
          {{ row.label }}
        </dt>
        <dd class="min-w-0 break-words text-base text-ink-gray-9">
          <RouterLink
            v-if="row.to"
            :to="row.to"
            class="underline decoration-outline-gray-3 underline-offset-4"
            >{{ row.text }}</RouterLink
          >
          <template v-else>{{ row.text }}</template>
        </dd>
      </div>
    </dl>
    <button
      v-if="rows.length > LIMIT && !all"
      type="button"
      class="min-h-11 text-base font-medium text-ink-gray-8"
      @click="all = true"
    >
      Mostrar {{ rows.length - LIMIT }} datos más
    </button>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { documentRoute } from '@/documentos/registry'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  statusLabel,
} from '@/utils/display'

const LIMIT = 12
const props = defineProps({
  fields: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  // Fields the header and sections already show (never repeat them).
  hide: { type: Array, default: () => [] },
  boot: { type: Object, default: null },
})
const all = ref(false)

function text(row) {
  const value = row.value
  switch (row.fieldtype) {
    case 'Date':
      return formatDate(value, { relative: false })
    case 'Datetime':
      return formatDateTime(value)
    case 'Currency':
      return formatMoney(value, props.currency)
    case 'Check':
      return 'Sí'
    case 'Percent':
      return `${Number(value)} %`
    case 'Select':
      return row.fieldname === 'status'
        ? statusLabel(value)
        : row.title || value
    case 'Link':
    case 'Dynamic Link':
      return row.title || value
    default:
      return String(value)
  }
}

const rows = computed(() =>
  props.fields
    .filter((row) => !props.hide.includes(row.fieldname))
    // A bare naming-series code or an internal ID says nothing to a worker.
    .filter((row) => !(row.fieldname === 'naming_series'))
    .map((row) => {
      const linkType = row.fieldtype === 'Link' ? row.options : row.link_doctype
      const to =
        linkType && row.value
          ? documentRoute(linkType, row.value, { boot: props.boot })
          : null
      return {
        ...row,
        text: text(row),
        // Only records the shell can open become links; others stay text.
        to,
      }
    }),
)
const visible = computed(() =>
  all.value ? rows.value : rows.value.slice(0, LIMIT),
)
</script>
