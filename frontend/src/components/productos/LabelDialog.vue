<template>
  <Dialog v-model="open" :options="{ title: __('Print labels', null, CTX) }">
    <template #body-content>
      <div class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-xs text-ink-gray-6">
            {{ __('Size', null, CTX) }}
            <select
              v-model="size"
              class="h-11 rounded-md border border-outline-gray-2 bg-surface-white px-2 text-base text-ink-gray-9 sm:h-8 sm:text-sm"
            >
              <option v-for="entry in SIZES" :key="entry.id" :value="entry.id">
                {{ entry.label }}
              </option>
            </select>
          </label>
          <label
            v-if="!units"
            class="flex flex-col gap-1 text-xs text-ink-gray-6"
          >
            {{ __('Copies', null, CTX) }}
            <input
              v-model.number="copies"
              type="number"
              min="1"
              max="200"
              inputmode="numeric"
              class="h-11 w-24 rounded-md border border-outline-gray-2 bg-surface-white px-2 text-base text-ink-gray-9 sm:h-8 sm:text-sm"
            />
          </label>
        </div>
        <template v-if="units">
          <p class="text-sm text-ink-gray-7">
            {{
              hasSerial
                ? __(
                    'One label per serial number on hand. Choose which.',
                    null,
                    CTX,
                  )
                : __(
                    'One label per unit of each batch on hand. Choose which.',
                    null,
                    CTX,
                  )
            }}
          </p>
          <p v-if="loadingUnits" role="status" class="text-sm text-ink-gray-6">
            {{ __('Looking for what is on hand…', null, CTX) }}
          </p>
          <p
            v-else-if="!unitRows.length"
            class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
          >
            {{ __('Nothing on hand to label in your stores.', null, CTX) }}
          </p>
          <ul
            v-else
            class="max-h-64 divide-y divide-outline-gray-1 overflow-y-auto rounded-lg border border-outline-gray-2"
          >
            <li v-for="(row, index) in unitRows" :key="index">
              <label
                class="flex min-h-11 items-center gap-3 px-3 py-1.5 text-sm sm:min-h-9"
              >
                <input v-model="picked" type="checkbox" :value="index" />
                <span class="min-w-0 flex-1 truncate font-mono">{{
                  row.serial_no || row.batch_no
                }}</span>
                <span
                  v-if="row.batch_no && !row.serial_no"
                  class="tabular-nums text-ink-gray-6"
                  >× {{ row.qty }}</span
                >
              </label>
            </li>
          </ul>
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
        <a
          v-if="sheetHref"
          :href="sheetHref"
          class="inline-block text-sm text-ink-gray-6 underline-offset-2 hover:text-ink-gray-9 hover:underline"
          >{{ __('More sizes and sheets in Etiquetas', null, CTX) }}</a
        >
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, CTX)" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Print', null, CTX)"
          :loading="printing"
          :disabled="units && !picked.length"
          @click="print"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog } from 'frappe-ui'
import { CTX, problemOf, productosApi } from '@/composables/useProductos'

// «Imprimir etiqueta» in place: Mercado renders the label (its sizes, the
// shop's price and barcode) and the browser prints it. Serialized and batched
// products print one label per unit on hand, chosen here.
const props = defineProps({
  item: { type: String, required: true },
  hasSerial: { type: Boolean, default: false },
  hasBatch: { type: Boolean, default: false },
  sheetHref: { type: String, default: '' },
})
const open = defineModel({ type: Boolean, default: false })
const LABELS = 'mercado.api.labels'
const SIZE_KEY = 'muelle:productos:label-size'
const SIZES = [
  { id: 'xs', label: '30 × 15 mm' },
  { id: 'small', label: '38 × 25 mm' },
  { id: 'medium', label: '50 × 30 mm' },
  { id: 'wide', label: '57 × 40 mm' },
  { id: 'large', label: '80 × 50 mm' },
  { id: 'gondola', label: '100 × 60 mm' },
]
const remembered = () => {
  try {
    const value = localStorage.getItem(SIZE_KEY)
    return SIZES.some((entry) => entry.id === value) ? value : 'medium'
  } catch {
    return 'medium'
  }
}
const size = ref(remembered())
const copies = ref(1)
const unitRows = ref([])
const picked = ref([])
const loadingUnits = ref(false)
const printing = ref(false)
const problem = ref('')
const units = computed(() => props.hasSerial || props.hasBatch)

function fail(error) {
  const found = problemOf(error)
  problem.value = [found.title, found.detail].filter(Boolean).join('. ')
}

async function loadUnits() {
  loadingUnits.value = true
  try {
    const answer = await productosApi(`${LABELS}.list_label_units`, {
      item_code: props.item,
    })
    unitRows.value = answer?.rows || []
    picked.value = unitRows.value.map((_, index) => index)
  } catch (error) {
    fail(error)
  } finally {
    loadingUnits.value = false
  }
}

async function rowsToPrint() {
  if (units.value) return picked.value.map((index) => unitRows.value[index])
  const answer = await productosApi(`${LABELS}.resolve_label_items`, {
    codes: JSON.stringify([props.item]),
  })
  const base = answer?.items?.[props.item]
  if (!base) throw new Error(__('This product cannot be labelled.', null, CTX))
  const count = Math.min(200, Math.max(1, Number(copies.value) || 1))
  return [{ ...base, qty: count }]
}

async function print() {
  // Opened inside the click, so a popup blocker lets the label through.
  const tab = window.open('', '_blank')
  printing.value = true
  problem.value = ''
  try {
    localStorage.setItem(SIZE_KEY, size.value)
  } catch {
    // Private mode: the size is just not remembered.
  }
  try {
    const rows = await rowsToPrint()
    const answer = await productosApi(`${LABELS}.render_label_batch`, {
      rows: JSON.stringify(rows),
      source: `preset:${size.value}`,
      mode: 'html',
      auto_print: 1,
    })
    if (!tab)
      throw new Error(__('Allow pop-ups to print the label.', null, CTX))
    tab.document.open()
    tab.document.write(answer?.html || '')
    tab.document.close()
  } catch (error) {
    tab?.close()
    if (error instanceof Error && !error.messages) problem.value = error.message
    else fail(error)
  } finally {
    printing.value = false
  }
}

watch(open, (value) => {
  if (!value) return
  problem.value = ''
  if (units.value) loadUnits()
})
</script>
