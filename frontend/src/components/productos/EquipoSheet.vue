<template>
  <!-- «Usar en la tienda»: pieces the shop keeps for its own work (a tablet
       at the counter, a tool at the bench) leave one store's stock as the
       company's equipment (doco.workspaces.product_equipo), never rung up as
       a sale. The store, which piece (its serial number on a product that has
       them, else how many), who uses it and a note. -->
  <BottomSheet
    v-model:open="open"
    title="Usar en la tienda"
    :subtitle="itemName || item"
    :dismissible="!saving"
  >
    <div class="space-y-5 pt-2" data-equipo-sheet>
      <p class="text-sm text-ink-gray-7">
        Para equipo que la tienda usa para trabajar. No se cobra: sale del
        inventario y queda como activo de la tienda.
      </p>
      <ChipGroup
        v-if="stores.length > 1"
        v-model="warehouse"
        label="Tienda"
        :options="storeOptions"
        :clear-value="warehouse"
        testid="equipo-tienda"
      />

      <section v-if="serial" :aria-labelledby="qtyId">
        <h3 :id="qtyId" class="text-base-medium text-ink-gray-8">
          ¿Cuál pieza? Busca el número de serie en la caja
        </h3>
        <ul
          v-if="here.serials.length"
          role="group"
          :aria-labelledby="qtyId"
          class="mt-2 max-h-56 overflow-y-auto rounded-7 border border-outline-gray-1"
        >
          <li v-for="code in here.serials" :key="code">
            <ListRow
              role="checkbox"
              :aria-checked="picked.includes(code) ? 'true' : 'false'"
              :title="code"
              data-equipo-serie
              @click="toggle(code)"
            >
              <template #leading>
                <!-- The row is the checkbox; this is only its box. -->
                <span
                  class="flex size-10 flex-none items-center justify-center"
                  aria-hidden="true"
                >
                  <span
                    class="flex size-5 items-center justify-center rounded-[3px] border-2"
                    :class="
                      picked.includes(code)
                        ? 'border-transparent bg-surface-gray-10 text-ink-base'
                        : 'border-outline-gray-4'
                    "
                  >
                    <span
                      v-if="picked.includes(code)"
                      class="lucide-check size-4"
                    />
                  </span>
                </span>
              </template>
            </ListRow>
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-ink-gray-6" data-equipo-sin-series>
          No veo números de serie de este producto en {{ storeName }}. Revisa
          sus unidades en la ficha o pide el conteo.
        </p>
      </section>

      <section v-else class="flex flex-col items-center gap-2">
        <h3 :id="qtyId" class="text-base-medium text-ink-gray-8">
          Piezas que se quedan en la tienda
        </h3>
        <div class="flex items-center gap-3 min-[360px]:gap-4">
          <button
            type="button"
            class="press flex size-14 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
            aria-label="Una menos"
            :disabled="saving || !(amount > 1)"
            data-equipo-menos
            @click="step(-1)"
          >
            <span class="lucide-minus size-6" aria-hidden="true" />
          </button>
          <input
            v-model="typed"
            type="text"
            inputmode="decimal"
            :aria-labelledby="qtyId"
            class="num h-20 w-28 min-w-0 rounded-full border min-[360px]:w-36 border-outline-gray-2 bg-surface-base text-center text-4xl font-semibold text-ink-gray-9 focus:border-outline-gray-4 focus:outline-none"
            :disabled="saving"
            data-equipo-qty
            @focus="$event.target.select()"
          />
          <button
            type="button"
            class="press flex size-14 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
            aria-label="Una más"
            :disabled="saving || amount >= max"
            data-equipo-mas
            @click="step(1)"
          >
            <span class="lucide-plus size-6" aria-hidden="true" />
          </button>
        </div>
        <p class="text-sm text-ink-gray-6" data-equipo-hay>
          Hay <span class="num">{{ pieces(max) }}</span>
          {{ batch ? `en el lote ${batch}` : `en ${storeName}` }}
        </p>
      </section>

      <section v-if="lots" aria-label="Lote">
        <p class="mb-1.5 text-xs font-medium text-ink-gray-6">Lote</p>
        <ul
          v-if="here.batches.length"
          role="radiogroup"
          aria-label="Lote"
          class="max-h-56 overflow-y-auto rounded-7 border border-outline-gray-1"
        >
          <li v-for="entry in here.batches" :key="entry.batch">
            <ListRow
              role="radio"
              :aria-checked="batch === entry.batch ? 'true' : 'false'"
              :title="entry.batch"
              :subtitle="pieces(entry.qty)"
              :selected="batch === entry.batch"
              data-equipo-lote
              @click="batch = entry.batch"
            >
              <template #leading>
                <RadioDot :on="batch === entry.batch" />
              </template>
            </ListRow>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-gray-6">
          No veo lotes de este producto en {{ storeName }}.
        </p>
      </section>

      <FormControl
        v-if="peopleOptions.length > 1"
        v-model="custodian"
        type="select"
        label="¿Quién lo usa? (opcional)"
        :options="peopleOptions"
        class="[&_select]:min-h-12"
        data-equipo-quien
      />
      <FormControl
        v-model="note"
        type="text"
        label="Para qué es (opcional)"
        placeholder="Ej. tableta del mostrador para cotizar"
        maxlength="200"
        class="[&_input]:min-h-12"
        data-equipo-nota
      />

      <p
        v-if="problem"
        role="status"
        class="text-sm"
        :class="over ? 'text-ink-red-7' : 'text-ink-gray-7'"
        data-equipo-falta
      >
        {{ problem }}
      </p>
      <p v-else class="text-sm text-ink-gray-6" data-equipo-efecto>
        {{ effect }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="space-y-1 text-sm text-ink-red-7"
        data-equipo-error
      >
        <span v-if="errorTitle" class="block font-medium">{{
          errorTitle
        }}</span>
        <span class="block">{{ error }}</span>
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-12 w-full"
        variant="solid"
        label="Usar en la tienda"
        :disabled="!ready"
        :loading="saving"
        data-equipo-guardar
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet, ChipGroup, ListRow } from '@/components/ui'
import RadioDot from '@/components/documentos/RadioDot.vue'
import {
  outcomeUnknown,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'
import { formatQty } from '@/utils/display'
import {
  EQUIPO_METHOD,
  equipoPayload,
  equipoProblem,
  equipoQty,
  equipoStores,
  equipoUnits,
} from './equipo'
import { mermaLeft } from './merma'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  item: { type: String, required: true },
  itemName: { type: String, default: '' },
  uom: { type: String, default: '' },
  // The record's stock rows: { warehouse, label, actual_qty }.
  rows: { type: Array, default: () => [] },
  // The store to start on (its row's own button); else the one with most.
  store: { type: String, default: '' },
  // The record's equipo action: { people: [{ employee, name }] }.
  action: { type: Object, default: null },
  // The record's `units`: serial numbers and lots on hand, by store.
  units: { type: Object, default: null },
  serial: { type: Boolean, default: false },
  lots: { type: Boolean, default: false },
})
// saved (Doco's answer: { assets, qty, uom, store, left, custodian }): the
// page says it and reloads. refresh: a refusal; the page reloads the record.
const emit = defineEmits(['saved', 'refresh'])

const qtyId = `equipo-qty-${Math.random().toString(36).slice(2, 8)}`
const warehouse = ref('')
const typed = ref('1')
const picked = ref([])
const batch = ref('')
const custodian = ref('')
const note = ref('')
const saving = ref(false)
const error = ref('')
const errorTitle = ref('')
// The request id stays while the same request is sent again after an unknown
// outcome, so Doco answers with what it already did instead of doing it twice.
let rid = null
let sentKey = ''

const stores = computed(() => equipoStores(props.rows))
const storeOptions = computed(() =>
  stores.value.map((row) => ({
    value: row.warehouse,
    label: row.label || row.warehouse,
    count: pieces(row.actual_qty),
  })),
)
const row = computed(
  () =>
    stores.value.find((entry) => entry.warehouse === warehouse.value) || null,
)
const storeName = computed(
  () => row.value?.label || row.value?.warehouse || 'esta tienda',
)
const here = computed(() => equipoUnits(props.units, warehouse.value))
const lot = computed(
  () => here.value.batches.find((entry) => entry.batch === batch.value) || null,
)
const max = computed(() =>
  props.lots && lot.value
    ? Number(lot.value.qty) || 0
    : Number(row.value?.actual_qty) || 0,
)
const amount = computed(() =>
  props.serial ? picked.value.length : equipoQty(typed.value),
)
const peopleOptions = computed(() => [
  { label: 'Nadie en particular', value: '' },
  ...(props.action?.people || []).map((person) => ({
    label: person.name,
    value: person.employee,
  })),
])
const problem = computed(() =>
  equipoProblem({
    qty: amount.value,
    max: max.value,
    serial: props.serial,
    lots: props.lots,
    batch: batch.value,
  }),
)
const over = computed(() => !!amount.value && amount.value > max.value)
const ready = computed(() => !problem.value && !saving.value && !!row.value)
const effect = computed(() => {
  const left =
    amount.value && amount.value <= max.value
      ? ` ${mermaLeft(
          (Number(row.value?.actual_qty) || 0) - amount.value,
          props.uom,
        )} para vender en ${storeName.value}.`
      : ''
  return `Sale del inventario a su costo y queda como equipo de la tienda.${left}`
})

function pieces(n) {
  return formatQty(n, props.uom)
}

function start() {
  const wanted = stores.value.find((entry) => entry.warehouse === props.store)
  warehouse.value = (wanted || stores.value[0])?.warehouse || ''
  typed.value = '1'
  picked.value = []
  batch.value = ''
  custodian.value = ''
  note.value = ''
  error.value = ''
  errorTitle.value = ''
  rid = null
  sentKey = ''
}
// Immediate: the page mounts the sheet on its first tap, already open.
watch(
  open,
  (now) => {
    if (now) start()
  },
  { immediate: true },
)
// Another store has its own serial numbers and lots.
watch(warehouse, () => {
  picked.value = []
  batch.value = ''
})
// A reload under the open sheet (a refusal): what left the store leaves the picks.
watch(
  () => here.value.serials,
  (now) => {
    picked.value = picked.value.filter((code) => now.includes(code))
  },
)

function step(delta) {
  const base = amount.value || 0
  const next = Math.round((base + delta) * 1000) / 1000
  typed.value = String(Math.min(Math.max(next, 1), Math.max(max.value, 1)))
}
function toggle(code) {
  picked.value = picked.value.includes(code)
    ? picked.value.filter((entry) => entry !== code)
    : [...picked.value, code]
}

async function save() {
  if (!ready.value) return
  const payload = {
    item: props.item,
    warehouse: warehouse.value,
    qty: amount.value,
    serials: props.serial ? [...picked.value] : [],
    batch: props.lots ? batch.value : '',
    custodian: custodian.value,
    note: note.value,
  }
  const key = JSON.stringify(payload)
  if (!rid || key !== sentKey) rid = requestId()
  sentKey = key
  saving.value = true
  error.value = ''
  errorTitle.value = ''
  try {
    const result = await productosApi(
      EQUIPO_METHOD,
      equipoPayload({ ...payload, requestId: rid }),
    )
    rid = null
    open.value = false
    emit('saved', result)
  } catch (failure) {
    // Doco's words (a serial that left, no equipment account in the chart),
    // under «No sabemos si se guardó» when the answer never came.
    const said = problemOf(failure)
    const unknown = outcomeUnknown(failure)
    error.value = said.detail
    errorTitle.value = unknown ? said.title : ''
    if (!unknown) rid = null
    emit('refresh')
  } finally {
    saving.value = false
  }
}
</script>
