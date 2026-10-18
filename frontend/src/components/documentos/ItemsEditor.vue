<template>
  <!-- The items of a draft (Shell SPEC §6 DD4/D1.2): one card per item with a
       quantity stepper; add by name, code or barcode (a scanner gun types into
       the search; the camera scans where the phone supports it). Prices come
       from the price list on save unless the worker types one. -->
  <section aria-labelledby="doc-items-edit" class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h3 id="doc-items-edit" class="text-base font-semibold text-ink-gray-9">
        {{ label }}
      </h3>
      <span class="text-sm text-ink-gray-6">{{ countLabel }}</span>
    </div>
    <ul class="flex flex-col gap-2">
      <li
        v-for="(row, i) in rows"
        :key="row._key"
        class="rounded-xl border border-outline-gray-1 bg-surface-gray-1 p-3"
        data-testid="documentos-item-edit"
      >
        <div class="flex items-start gap-2">
          <p class="min-w-0 flex-1 break-words text-base leading-snug text-ink-gray-9">
            {{ row.item_name || row.item_code }}
          </p>
          <button
            type="button"
            class="-m-2 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
            :aria-label="`Quitar ${row.item_name || row.item_code}`"
            @click="remove(i)"
          >
            <span class="lucide-x size-5" aria-hidden="true" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
          <div
            class="flex items-center rounded-full border border-outline-gray-2"
            role="group"
            :aria-label="`Cantidad de ${row.item_name || row.item_code}`"
          >
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
              aria-label="Uno menos"
              :disabled="Number(row.qty) <= 1"
              @click="step(i, -1)"
            >
              <span class="lucide-minus size-5" aria-hidden="true" />
            </button>
            <input
              :value="row.qty"
              type="text"
              inputmode="decimal"
              class="h-11 w-16 border-0 bg-transparent text-center text-base tabular-nums text-ink-gray-9 focus:ring-0"
              aria-label="Cantidad"
              @change="setQty(i, $event.target.value)"
            />
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              aria-label="Uno más"
              @click="step(i, 1)"
            >
              <span class="lucide-plus size-5" aria-hidden="true" />
            </button>
          </div>
          <span v-if="row.uom" class="text-sm text-ink-gray-6">{{
            unitLabel(row.uom, row.qty)
          }}</span>
          <label v-if="editRate" class="flex min-w-0 flex-1 items-center gap-2">
            <span class="text-sm text-ink-gray-6">Precio</span>
            <input
              :value="row.rate ?? ''"
              type="text"
              inputmode="decimal"
              class="h-11 w-full min-w-0 max-w-32 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-right text-base tabular-nums text-ink-gray-9"
              :placeholder="row.rate == null ? 'De lista' : ''"
              @change="setRate(i, $event.target.value)"
            />
          </label>
        </div>
      </li>
    </ul>
    <div class="relative">
      <div class="flex items-center gap-2">
        <label class="sr-only" for="doc-item-search">Agregar artículo</label>
        <input
          id="doc-item-search"
          v-model="search"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          class="h-12 min-w-0 flex-1 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Agregar: nombre, clave o código de barras"
          data-testid="documentos-item-search"
          @keydown.enter.prevent="onEnter"
        />
        <button
          v-if="canScan"
          type="button"
          class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3"
          aria-label="Escanear código de barras"
          @click="scanning = true"
        >
          <span class="lucide-scan-barcode size-6" aria-hidden="true" />
        </button>
      </div>
      <p v-if="note" class="pt-1 text-sm text-ink-gray-7" role="status">
        {{ note }}
      </p>
      <ul
        v-if="results.length"
        class="mt-1 overflow-hidden rounded-xl border border-outline-gray-2 bg-surface-modal shadow"
      >
        <li v-for="r in results" :key="r.value">
          <ListRow
            icon="lucide-package"
            :title="r.title"
            :subtitle="r.subtitle"
            @click="add(r.value, r.title)"
          />
        </li>
      </ul>
    </div>
    <BarcodeCamera v-if="scanning" @code="onCode" @close="scanning = false" />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { ListRow } from '@/components/ui'
import { looksLikeId, unitLabel as unitWord } from '@/utils/display'

const BarcodeCamera = defineAsyncComponent(() => import('./BarcodeCamera.vue'))

const props = defineProps({
  // [{ _idx?, item_code, item_name, qty, rate, uom }]
  modelValue: { type: Array, default: () => [] },
  label: { type: String, default: 'Artículos' },
  // Child fields the worker may change (form().items.fields)
  fields: { type: Array, default: () => ['item_code', 'qty'] },
})
const emit = defineEmits(['update:modelValue'])

let keySeq = 0
const keyed = (row) => ({ ...row, _key: row._key || `r${++keySeq}` })
const rows = computed(() => props.modelValue.map(keyed))
const editRate = computed(() => props.fields.includes('rate'))
const countLabel = computed(() => {
  const n = rows.value.length
  return n === 1 ? '1 artículo' : `${n} artículos`
})
const canScan =
  typeof globalThis.window !== 'undefined' && 'BarcodeDetector' in window

const unitLabel = (uom, qty) => unitWord(uom, qty)

function commit(list) {
  emit('update:modelValue', list)
}
function num(value) {
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function step(i, delta) {
  const list = rows.value.slice()
  const qty = Math.max(1, (num(list[i].qty) || 0) + delta)
  list[i] = { ...list[i], qty }
  commit(list)
}
function setQty(i, value) {
  const qty = num(value)
  const list = rows.value.slice()
  list[i] = { ...list[i], qty: qty && qty > 0 ? qty : list[i].qty }
  commit(list)
}
function setRate(i, value) {
  const list = rows.value.slice()
  const rate = String(value).trim() === '' ? null : num(value)
  list[i] = { ...list[i], rate }
  commit(list)
}
function remove(i) {
  const list = rows.value.slice()
  list.splice(i, 1)
  commit(list)
}
function add(itemCode, itemName = '') {
  const list = rows.value.slice()
  const same = list.findIndex((r) => r.item_code === itemCode && !r._idx)
  if (same >= 0) list[same] = { ...list[same], qty: (num(list[same].qty) || 0) + 1 }
  else list.push(keyed({ item_code: itemCode, item_name: itemName, qty: 1 }))
  commit(list)
  search.value = ''
  results.value = []
  note.value = `Agregado: ${itemName || itemCode}`
}

// ── search and scan ──
const search = ref('')
const results = ref([])
const note = ref('')
const scanning = ref(false)
let timer = null
let seq = 0

async function find(text) {
  const mine = ++seq
  if (text.trim().length < 2) {
    results.value = []
    return
  }
  try {
    const found = await call('frappe.desk.search.search_link', {
      doctype: 'Item',
      txt: text.trim(),
      page_length: 8,
      filters: JSON.stringify({ disabled: 0, has_variants: 0 }),
    })
    if (mine !== seq) return
    results.value = (found || []).map((r) => {
      const words = String(r.description || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const name = words.find((w) => !looksLikeId(w)) || r.label || r.value
      return {
        value: r.value,
        title: name,
        subtitle: name === r.value ? '' : r.value,
      }
    })
    note.value = results.value.length ? '' : 'Ningún artículo se llama así.'
  } catch {
    if (mine === seq) note.value = 'No se pudo buscar. Revisa tu conexión.'
  }
}
watch(search, (text) => {
  clearTimeout(timer)
  note.value = ''
  timer = setTimeout(() => find(text), 250)
})
onBeforeUnmount(() => clearTimeout(timer))

async function byBarcode(code) {
  try {
    const found = await call('erpnext.stock.utils.scan_barcode', {
      search_value: code,
    })
    return found?.item_code ? found : null
  } catch {
    return null
  }
}
// Enter: a scanner gun ends its code with Enter; a code wins over the name search.
async function onEnter() {
  const text = search.value.trim()
  if (!text) return
  const hit = await byBarcode(text)
  if (hit) return add(hit.item_code, hit.item_name || '')
  if (results.value.length === 1)
    return add(results.value[0].value, results.value[0].title)
  await find(text)
}
async function onCode(code) {
  scanning.value = false
  const hit = await byBarcode(code)
  if (hit) add(hit.item_code, hit.item_name || '')
  else note.value = `Ningún artículo tiene el código ${code}.`
}

</script>
