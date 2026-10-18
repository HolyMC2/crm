<template>
  <!-- «Avísame…» (Shell SPEC §6 DD8): M3 list items (56px) — the conditions
       of a record as radio rows, or a store and a quantity for an item —
       then the avisos already asked, each with «Quitar». -->
  <BottomSheet
    v-model:open="open"
    title="Avísame…"
    :subtitle="title"
    :dismissible="!saving"
    flush
  >
    <div class="pb-2">
      <p v-if="loading" class="px-4 py-3 text-base text-ink-gray-6">
        Cargando…
      </p>

      <!-- A record: one condition, a date for «si no … para el». -->
      <section v-else-if="!isItem" aria-labelledby="avisame-when">
        <h3
          id="avisame-when"
          class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-7"
        >
          Te llega a Avisos. Al cliente no se le escribe.
        </h3>
        <ul role="radiogroup" aria-labelledby="avisame-when">
          <li v-for="option in options" :key="option.key">
            <ListRow
              role="radio"
              :aria-checked="choice === option.key ? 'true' : 'false'"
              :disabled="option.active"
              :title="option.label"
              :subtitle="optionHint(option)"
              :selected="choice === option.key"
              :class="option.active ? 'opacity-60' : ''"
              @click="choice = option.key"
            >
              <template #leading>
                <RadioDot :on="choice === option.key" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div v-if="chosen?.needs_date" class="px-4 pt-2">
          <FormControl
            v-model="untilDate"
            type="date"
            label="Fecha límite"
            placeholder="Elige la fecha"
            class="[&_input]:min-h-12"
            :min="today"
          />
        </div>
      </section>

      <!-- An item: a store and a quantity. -->
      <section v-else aria-labelledby="avisame-store">
        <h3
          id="avisame-store"
          class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-7"
        >
          {{ warehouses.length > 1 ? 'En qué tienda' : 'Tienda' }}
        </h3>
        <ul
          v-if="warehouses.length > 1"
          role="radiogroup"
          aria-labelledby="avisame-store"
        >
          <li v-for="row in warehouses" :key="row.warehouse">
            <ListRow
              role="radio"
              :aria-checked="warehouse === row.warehouse ? 'true' : 'false'"
              :title="row.label"
              :subtitle="`Hay ${formatQty(row.qty)}`"
              :selected="warehouse === row.warehouse"
              @click="warehouse = row.warehouse"
            >
              <template #leading>
                <RadioDot :on="warehouse === row.warehouse" />
              </template>
            </ListRow>
          </li>
        </ul>
        <ListRow
          v-else-if="warehouses.length === 1"
          :title="warehouses[0].label"
          :subtitle="`Hay ${formatQty(warehouses[0].qty)}`"
          data-avisame-store
        />
        <p v-else class="px-4 py-2 text-base text-ink-gray-6">
          Este artículo no tiene existencias en ninguna tienda todavía.
        </p>
        <div v-if="warehouses.length" class="space-y-1 px-4 pt-3">
          <label :for="qtyId" class="block text-sm text-ink-gray-7"
            >Cuando baje de</label
          >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2"
              aria-label="Menos"
              @click="step(-1)"
            >
              <span class="lucide-minus size-4" aria-hidden="true" />
            </button>
            <input
              :id="qtyId"
              v-model="threshold"
              type="number"
              inputmode="decimal"
              min="0"
              placeholder="Cantidad"
              class="min-h-12 w-full min-w-0 rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-center text-lg"
            />
            <button
              type="button"
              class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2"
              aria-label="Más"
              @click="step(1)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
            </button>
          </div>
          <p class="text-sm text-ink-gray-6">
            Te aviso una vez cada vez que baje de esa cantidad<template
              v-if="selectedStore && warehouses.length > 1"
            >
              en {{ selectedStore.label }}</template
            >.
          </p>
        </div>
      </section>

      <section v-if="active.length" aria-labelledby="avisame-mine">
        <h3
          id="avisame-mine"
          class="px-4 pb-1 pt-3 text-sm font-medium text-ink-gray-7"
        >
          Ya me avisas
        </h3>
        <ul>
          <li v-for="row in active" :key="row.name">
            <ListRow icon="lucide-bell-ring" :title="row.condition">
              <template #trailing>
                <Button
                  variant="ghost"
                  class="min-h-11"
                  label="Quitar"
                  :aria-label="`Quitar: ${row.condition}`"
                  :loading="removing === row.name"
                  @click="remove(row)"
                />
              </template>
            </ListRow>
          </li>
        </ul>
      </section>

      <p v-if="note" class="px-4 pt-2 text-sm text-ink-gray-7">{{ note }}</p>
      <p v-if="error" role="alert" class="px-4 pt-2 text-sm text-ink-red-4">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-12 w-full"
        variant="solid"
        label="Avísame"
        :disabled="!ready"
        :loading="saving"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import RadioDot from './RadioDot.vue'
import { formatQty } from '@/utils/display'
import {
  avisame,
  avisameOptions,
  avisameStock,
  cleanThreshold,
  errorText,
  misAvisos,
  quitarAviso,
  todayIso,
} from './avisame'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  // The record's display name (party or item), shown under the title.
  title: { type: String, default: '' },
  // Item only: [{ warehouse, label, qty, reorder_level? }] the user may watch.
  warehouses: { type: Array, default: () => [] },
})
const emit = defineEmits(['changed'])

const qtyId = `avisame-qty-${Math.random().toString(36).slice(2, 8)}`
const today = todayIso()
const isItem = computed(() => props.doctype === 'Item')
const loading = ref(false)
const saving = ref(false)
const removing = ref('')
const error = ref('')
const note = ref('')
const options = ref([])
const active = ref([])
const choice = ref('')
const untilDate = ref('')
const warehouse = ref('')
const threshold = ref('')

const chosen = computed(() => options.value.find((o) => o.key === choice.value))
const selectedStore = computed(() =>
  props.warehouses.find((row) => row.warehouse === warehouse.value),
)
function optionHint(option) {
  if (option.active) return 'Ya lo pediste'
  return option.needs_date ? 'Eliges la fecha límite' : 'Un aviso, cuando pase'
}
const ready = computed(() => {
  if (isItem.value)
    return Boolean(warehouse.value) && cleanThreshold(threshold.value) !== null
  if (!chosen.value || chosen.value.active) return false
  return !chosen.value.needs_date || Boolean(untilDate.value)
})

// One tap should work: the store's reorder level, else one under what it
// has now (at least 1).
function suggested(row) {
  if (!row) return ''
  const level = Number(row.reorder_level) || 0
  if (level > 0) return String(level)
  return String(Math.max(Math.floor(Number(row.qty) || 0) - 1, 1))
}
watch(warehouse, (value, previous) => {
  if (previous && value !== previous)
    threshold.value = suggested(selectedStore.value)
})

// Immediate: a host that mounts the sheet on first tap (Producto) mounts it
// already open.
watch(
  open,
  (value) => {
    if (value) load()
  },
  { immediate: true },
)

async function load() {
  loading.value = true
  error.value = ''
  note.value = ''
  choice.value = ''
  untilDate.value = ''
  try {
    if (isItem.value) {
      warehouse.value = props.warehouses[0]?.warehouse || ''
      threshold.value = suggested(props.warehouses[0])
      active.value = await misAvisos('Item', props.name)
    } else {
      const data = await avisameOptions(props.doctype, props.name)
      options.value = data?.options || []
      active.value = data?.active || []
      choice.value = options.value.find((o) => !o.active)?.key || ''
    }
  } catch (failure) {
    error.value = errorText(failure, 'No se pudieron cargar tus avisos.')
  } finally {
    loading.value = false
  }
}

function step(delta) {
  const current = cleanThreshold(threshold.value) || 0
  threshold.value = String(Math.max(current + delta, 1))
}

async function save() {
  if (!ready.value) return
  saving.value = true
  error.value = ''
  try {
    const row = isItem.value
      ? await avisameStock(
          props.name,
          warehouse.value,
          cleanThreshold(threshold.value),
        )
      : await avisame(
          props.doctype,
          props.name,
          choice.value,
          chosen.value?.needs_date ? untilDate.value : null,
        )
    emit('changed')
    if (row?.note) {
      note.value = row.note
      await load()
      note.value = row.note
      return
    }
    toast.success(
      row?.status === 'Cumplido'
        ? 'Ya pasó: te llegó el aviso.'
        : `Listo. Te aviso: ${(row?.condition || '').toLowerCase()}.`,
    )
    open.value = false
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  removing.value = row.name
  error.value = ''
  try {
    await quitarAviso(row.name)
    active.value = active.value.filter((item) => item.name !== row.name)
    options.value = options.value.map((option) => ({
      ...option,
      active: option.active && row.condition !== option.label,
    }))
    emit('changed')
    if (!isItem.value) await load()
  } catch (failure) {
    error.value = errorText(failure, 'No se pudo quitar el aviso.')
  } finally {
    removing.value = ''
  }
}
</script>
