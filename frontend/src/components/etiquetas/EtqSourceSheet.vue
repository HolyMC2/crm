<template>
  <BottomSheet
    :open="open"
    :title="source?.label || ''"
    :subtitle="subtitle"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3" data-etq-source>
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
      <ul v-if="loading && !rows.length" class="space-y-2" aria-hidden="true">
        <li
          v-for="n in 4"
          :key="n"
          class="h-14 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
        />
      </ul>
      <p
        v-else-if="!rows.length && !reason && !problem"
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
            {{ picked.size === rows.length ? 'Quitar todos' : 'Elegir todos' }}
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
    </div>
    <template v-if="kind === 'precios' && rows.length" #actions>
      <Button
        variant="solid"
        class="press min-h-11 w-full"
        :disabled="!picked.size"
        :label="
          picked.size === 1
            ? 'Agregar 1 producto'
            : `Agregar ${picked.size} productos`
        "
        @click="addPicked"
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
import {
  etiquetasApi,
  problemText,
  sourceName,
} from '@/composables/useEtiquetas'
import { formatDate, formatMoney, relativeTime } from '@/utils/display'

const props = defineProps({
  open: { type: Boolean, default: false },
  // { key: 'recibido' | 'precios', label }
  source: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'pick'])

const kind = computed(() => props.source?.key || '')
const query = ref('')
const rows = ref([])
const loading = ref(false)
const problem = ref('')
const reason = ref('')
const priceList = ref('')
const picked = ref(new Set())

const placeholder = computed(() =>
  kind.value === 'recibido'
    ? 'Busca proveedor o folio'
    : 'Busca un producto con precio nuevo',
)
const subtitle = computed(() =>
  kind.value === 'precios' && priceList.value
    ? `Lista ${priceList.value}`
    : kind.value === 'recibido'
      ? 'Últimos 30 días'
      : '',
)
const emptyText = computed(() =>
  kind.value === 'recibido'
    ? 'No llegó mercancía en los últimos 30 días.'
    : 'Ningún precio cambió en los últimos 7 días.',
)

let ticket = 0
async function load() {
  if (!kind.value) return
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  try {
    const answer = await etiquetasApi('candidates', {
      kind: kind.value,
      query: query.value.trim(),
    })
    if (mine !== ticket) return
    rows.value = answer?.rows || []
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
    load()
  },
  { immediate: true },
)
watch(query, () => props.open && loadSoon())

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
