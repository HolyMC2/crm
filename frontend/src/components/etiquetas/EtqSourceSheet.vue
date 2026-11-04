<template>
  <BottomSheet
    :open="open"
    :title="source?.label || ''"
    :subtitle="subtitle"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3" data-etq-source>
      <!-- Pegar códigos: one per line, the copies after the code. -->
      <template v-if="kind === 'pegar'">
        <label class="block">
          <span class="block pb-1 text-sm text-ink-gray-6"
            >Un código por renglón; las copias después, si son varias</span
          >
          <textarea
            v-model="pasted"
            rows="7"
            class="w-full rounded-6 border-0 bg-surface-gray-2 p-3 font-mono text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="7501234567890&#10;CARG-20W 3&#10;FUNDA-A14	2"
            aria-label="Códigos para etiquetar"
            data-etq-pegar
          />
        </label>
        <p class="text-sm text-ink-gray-6" role="status">
          {{
            pastedItems.length
              ? `${codesText(pastedItems.length)}, ${labelsText(pastedLabels)}.`
              : 'Sirve una columna copiada de Excel o una lista de un mensaje.'
          }}
        </p>
      </template>

      <!-- Lo que hay en tienda: a warehouse, then what of it. -->
      <template v-else-if="kind === 'existencias' && warehouse">
        <button
          type="button"
          class="press -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2"
          @click="warehouse = null"
        >
          <span class="lucide-chevron-left size-4" aria-hidden="true" />
          Otro almacén
        </button>
        <section class="space-y-2" aria-labelledby="etq-grupo">
          <h3 id="etq-grupo" class="text-sm font-semibold text-ink-gray-8">
            Qué productos
          </h3>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="chipClass(!group)"
              :aria-pressed="!group ? 'true' : 'false'"
              @click="group = ''"
            >
              Todos
              <span class="num">{{ warehouse.items }}</span>
            </button>
            <button
              v-for="entry in groups"
              :key="entry.name"
              type="button"
              :class="chipClass(group === entry.name)"
              :aria-pressed="group === entry.name ? 'true' : 'false'"
              @click="group = entry.name"
            >
              {{ entry.name }}
              <span class="num">{{ entry.items }}</span>
            </button>
          </div>
        </section>
        <section class="space-y-2" aria-labelledby="etq-cuantas">
          <h3 id="etq-cuantas" class="text-sm font-semibold text-ink-gray-8">
            Cuántas etiquetas
          </h3>
          <Segmented
            v-model="copies"
            label="Cuántas etiquetas"
            :options="COPIES"
          />
          <p class="text-sm text-ink-gray-6">
            {{
              copies === 'uno'
                ? 'Una de cada producto, para el anaquel.'
                : 'Una por pieza en existencia: cada serie, cada pieza de un lote.'
            }}
          </p>
        </section>
      </template>

      <template v-else>
        <label class="relative flex items-center">
          <span
            class="lucide-search pointer-events-none absolute left-3 size-4 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            v-model="query"
            type="search"
            class="h-11 w-full rounded-full border-0 bg-surface-gray-2 pl-9 pr-9 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
            :placeholder="placeholder"
            :aria-label="placeholder"
          />
          <span
            v-if="loading"
            class="lucide-loader-circle absolute right-3 size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
            aria-hidden="true"
          />
        </label>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
        <p
          v-else-if="reason"
          role="status"
          class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
        >
          {{ reason }}
        </p>
        <ul
          v-if="loading && !shownRows.length"
          class="space-y-2"
          aria-hidden="true"
        >
          <li
            v-for="n in 4"
            :key="n"
            class="h-14 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
          />
        </ul>
        <p
          v-else-if="!shownRows.length && !reason && !problem"
          class="py-6 text-center text-sm text-ink-gray-6"
        >
          {{ emptyText }}
        </p>
        <!-- Llegó mercancía: one tap loads the whole document. -->
        <ul
          v-else-if="kind === 'recibido'"
          class="-mx-4 divide-y divide-outline-gray-1"
        >
          <li v-for="row in rows" :key="`${row.doctype}:${row.name}`">
            <ListRow
              :title="row.title"
              :subtitle="docLine(row)"
              :meta="row.qty ? `${qtyText(row.qty)} pzas` : ''"
              icon="lucide-package-open"
              @click="emit('pick', { doctype: row.doctype, name: row.name })"
            />
          </li>
        </ul>
        <!-- Lo que hay en tienda: the warehouses with stock. -->
        <ul
          v-else-if="kind === 'existencias'"
          class="-mx-4 divide-y divide-outline-gray-1"
        >
          <li v-for="row in shownRows" :key="row.name">
            <ListRow
              :title="row.label"
              :subtitle="row.label !== row.name ? row.name : ''"
              :meta="`${qtyText(row.items)} productos`"
              icon="lucide-warehouse"
              @click="openWarehouse(row)"
            />
          </li>
        </ul>
        <!-- Cambió el precio: every changed product, all checked. -->
        <template v-else>
          <div class="flex items-center justify-between text-sm">
            <span class="text-ink-gray-7">
              <span class="num font-semibold text-ink-gray-9">{{
                picked.size
              }}</span>
              de {{ rows.length }} elegidos
            </span>
            <button
              type="button"
              class="press min-h-11 px-2 font-medium text-ink-gray-8"
              @click="toggleAll"
            >
              {{
                picked.size === rows.length ? 'Quitar todos' : 'Elegir todos'
              }}
            </button>
          </div>
          <ul class="-mx-4 divide-y divide-outline-gray-1">
            <li v-for="row in rows" :key="row.item_code">
              <label
                class="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2"
              >
                <input
                  type="checkbox"
                  class="size-5 rounded-4"
                  :checked="picked.has(row.item_code)"
                  @change="toggle(row.item_code)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base text-ink-gray-9">{{
                    row.item_name
                  }}</span>
                  <span class="block truncate text-sm text-ink-gray-6"
                    >{{ row.item_code }} · {{ when(row.changed) }}</span
                  >
                </span>
                <span class="num text-base font-semibold text-ink-gray-9">{{
                  money(row.price, row.currency)
                }}</span>
              </label>
            </li>
          </ul>
        </template>
      </template>
    </div>
    <template v-if="action" #actions>
      <Button
        variant="solid"
        class="press min-h-11 w-full"
        :disabled="action.disabled"
        :label="action.label"
        @click="action.run"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ListRow from '@/components/ui/ListRow.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { chipClass } from '@/components/ui/chipClass'
import {
  etiquetasApi,
  labelsText,
  parsePasted,
  problemText,
  sourceName,
} from '@/composables/useEtiquetas'
import { matchTokens } from '@/vendor/muelle-shell/contracts'
import { formatDate, formatMoney, relativeTime } from '@/utils/display'

const props = defineProps({
  open: { type: Boolean, default: false },
  // { key: 'recibido' | 'precios' | 'existencias' | 'pegar', label }
  source: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'pick'])

const COPIES = [
  { value: 'uno', label: 'Una de cada uno' },
  { value: 'existencia', label: 'Una por pieza' },
]

const kind = computed(() => props.source?.key || '')
const query = ref('')
const rows = ref([])
const loading = ref(false)
const problem = ref('')
const reason = ref('')
const priceList = ref('')
const picked = ref(new Set())
const pasted = ref('')
const warehouse = ref(null)
const groups = ref([])
const group = ref('')
const copies = ref('uno')

const placeholder = computed(
  () =>
    ({
      recibido: 'Busca proveedor o folio',
      existencias: 'Busca un almacén',
    })[kind.value] || 'Busca un producto con precio nuevo',
)
const subtitle = computed(() => {
  if (kind.value === 'precios' && priceList.value)
    return `Lista ${priceList.value}`
  if (kind.value === 'recibido') return 'Últimos 30 días'
  if (kind.value === 'existencias')
    return warehouse.value ? warehouse.value.label : 'Elige el almacén'
  return ''
})
const emptyText = computed(
  () =>
    ({
      recibido: 'No llegó mercancía en los últimos 30 días.',
      existencias: query.value.trim()
        ? 'Ningún almacén con existencia se llama así.'
        : 'Ningún almacén que puedas ver tiene existencia.',
    })[kind.value] || 'Ningún precio cambió en los últimos 7 días.',
)
// The warehouses come whole; the search narrows them here.
const shownRows = computed(() =>
  kind.value === 'existencias' && query.value.trim()
    ? rows.value.filter((row) => matchTokens(query.value, row.label, row.name))
    : rows.value,
)
const pastedItems = computed(() => parsePasted(pasted.value))
const pastedLabels = computed(() =>
  pastedItems.value.reduce((sum, item) => sum + item.qty, 0),
)

const action = computed(() => {
  if (kind.value === 'pegar')
    return {
      label: pastedItems.value.length
        ? `Agregar ${codesText(pastedItems.value.length)}`
        : 'Agregar',
      disabled: !pastedItems.value.length,
      run: () => emit('pick', { items: pastedItems.value }),
    }
  if (kind.value === 'existencias' && warehouse.value)
    return {
      label: 'Agregar los productos',
      disabled: false,
      run: () =>
        emit('pick', {
          stock: {
            warehouse: warehouse.value.name,
            item_group: group.value,
            copies: copies.value,
          },
          title: group.value
            ? `${group.value} en ${warehouse.value.label}`
            : `Existencias de ${warehouse.value.label}`,
        }),
    }
  if (kind.value === 'precios' && rows.value.length)
    return {
      label:
        picked.value.size === 1
          ? 'Agregar 1 producto'
          : `Agregar ${picked.value.size} productos`,
      disabled: !picked.value.size,
      run: addPicked,
    }
  return null
})

let ticket = 0
async function load() {
  if (!kind.value || kind.value === 'pegar') return
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  try {
    const answer = await etiquetasApi('candidates', {
      kind: kind.value === 'existencias' ? 'almacenes' : kind.value,
      query: kind.value === 'existencias' ? '' : query.value.trim(),
    })
    if (mine !== ticket) return
    rows.value =
      kind.value === 'existencias'
        ? answer?.warehouses || []
        : answer?.rows || []
    reason.value = answer?.reason || ''
    priceList.value = answer?.price_list || ''
    if (kind.value === 'precios')
      picked.value = new Set(rows.value.map((row) => row.item_code))
  } catch (error) {
    if (mine === ticket) problem.value = problemText(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}
const loadSoon = useDebounceFn(load, 250)

watch(
  () => [props.open, kind.value],
  ([open]) => {
    if (!open) return
    query.value = ''
    rows.value = []
    warehouse.value = null
    group.value = ''
    groups.value = []
    load()
  },
  { immediate: true },
)
watch(query, () => props.open && kind.value !== 'existencias' && loadSoon())

async function openWarehouse(row) {
  warehouse.value = row
  group.value = ''
  groups.value = []
  try {
    const answer = await etiquetasApi('candidates', {
      kind: 'almacenes',
      query: row.name,
    })
    if (warehouse.value?.name === row.name) groups.value = answer?.groups || []
  } catch (error) {
    problem.value = problemText(error)
  }
}

function toggle(code) {
  const next = new Set(picked.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  picked.value = next
}
function toggleAll() {
  picked.value =
    picked.value.size === rows.value.length
      ? new Set()
      : new Set(rows.value.map((row) => row.item_code))
}
function addPicked() {
  emit('pick', {
    items: rows.value
      .filter((row) => picked.value.has(row.item_code))
      .map((row) => ({ code: row.item_code, qty: 1 })),
    title: 'Cambios de precio',
  })
}

function codesText(count) {
  return count === 1 ? '1 código' : `${count} códigos`
}
function docLine(row) {
  const parts = [sourceName(row.doctype), row.name]
  if (row.date) parts.push(formatDate(row.date))
  if (row.draft) parts.push('borrador')
  return parts.join(' · ')
}
function qtyText(value) {
  return Number(value).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}
function money(value, currency) {
  return formatMoney(Number(value), currency || 'MXN')
}
function when(value) {
  return relativeTime(value)
}
</script>
