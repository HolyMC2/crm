<template>
  <!-- «Comparar cotizaciones» (Shell SPEC §6 DD16, D3): the suppliers that
       answered the same request side by side, cheapest first, with what each
       quoted; «Pedir a …» turns the chosen one into an orden de compra.
       The same doco function answers the assistant's comparar_cotizaciones_proveedor. -->
  <section
    v-if="suppliers.length > 1"
    aria-labelledby="doc-comparar"
    class="px-4"
    data-testid="compras-comparar"
  >
    <h2 id="doc-comparar" class="pb-1 text-base font-semibold text-ink-gray-9">
      Comparar cotizaciones
    </h2>
    <p class="pb-2 text-sm text-ink-gray-6">
      {{ suppliers.length }} proveedores cotizaron {{ itemCount }}
      {{ itemCount === 1 ? 'artículo' : 'artículos' }}
    </p>
    <ul class="divide-y divide-outline-gray-1">
      <li
        v-for="s in suppliers"
        :key="s.quotation"
        class="flex flex-col gap-1 py-3"
        data-testid="compras-comparar-row"
      >
        <div class="flex items-start justify-between gap-3">
          <RouterLink
            :to="quoteRoute(s)"
            class="min-w-0 break-words text-base font-medium text-ink-gray-9 hover:underline"
            >{{ s.supplier_name || s.supplier }}</RouterLink
          >
          <span
            class="flex-none whitespace-nowrap text-base tabular-nums text-ink-gray-9"
            >{{ money(s.total, s.currency) }}</span
          >
        </div>
        <p class="text-sm text-ink-gray-7">
          {{ coverage(s) }}
          <template v-if="s.valid_till"> · {{ validLine(s) }}</template>
        </p>
        <p
          v-if="s.cheapest_items"
          class="text-sm text-ink-green-3"
          data-testid="compras-comparar-best"
        >
          {{ bestLine(s) }}
        </p>
        <div v-if="s.can_order" class="pt-1">
          <button
            type="button"
            :class="s === suppliers[0] ? BTN.tonal : BTN.text"
            data-testid="compras-comparar-pedir"
            @click="order(s)"
          >
            Pedir a {{ shortName(s) }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { call, toast } from 'frappe-ui'
import { documentRoute } from '@/documentos/registry'
import { BTN } from '@/documentos/tools'
import {
  dayDiff,
  formatDate,
  formatMoney,
  parseServerDate,
} from '@/utils/display'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  record: { type: Object, default: null },
})
const router = useRouter()
const data = ref(null)

const suppliers = computed(() => data.value?.suppliers || [])
const itemCount = computed(() => data.value?.items?.length || 0)

function money(value, currency) {
  return formatMoney(value, currency || 'MXN')
}
function shortName(s) {
  const name = s.supplier_name || s.supplier || ''
  return name.length > 22 ? `${name.slice(0, 20).trim()}…` : name
}
function coverage(s) {
  const all = itemCount.value
  return s.items_quoted >= all
    ? 'Cotizó todo'
    : `Cotizó ${s.items_quoted} de ${all}`
}
function validLine(s) {
  const d = parseServerDate(s.valid_till)
  if (d && dayDiff(d) < 0) return `venció ${formatDate(s.valid_till)}`
  return `válida hasta ${formatDate(s.valid_till, { relative: false })}`
}
function bestLine(s) {
  const n = s.cheapest_items
  return n === itemCount.value
    ? 'El mejor precio en todo'
    : n === 1
      ? 'El mejor precio en 1 artículo'
      : `El mejor precio en ${n} artículos`
}
function quoteRoute(s) {
  return documentRoute('Supplier Quotation', s.quotation) || ''
}
function order(s) {
  const to = documentRoute('Purchase Order', 'nuevo')
  if (!to) return toast.error('No puedes crear órdenes de compra aquí.')
  router.push({
    path: to.path,
    query: {
      origen: 'Supplier Quotation',
      desde: s.quotation,
      con: 'purchase_order',
    },
  })
}

let seq = 0
async function load() {
  const mine = ++seq
  try {
    const answer = await call('doco.workspaces.cotizaciones.comparar', {
      doctype: props.doctype,
      name: props.name,
    })
    if (mine === seq) data.value = answer
  } catch {
    // Not on this site yet, or nothing to compare: the section stays out.
    if (mine === seq) data.value = null
  }
}
watch(
  () => [props.doctype, props.name, props.record?.modified],
  () => load(),
  { immediate: true },
)
</script>
