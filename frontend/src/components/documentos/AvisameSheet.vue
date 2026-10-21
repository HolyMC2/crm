<template>
  <!-- «Avísame…» (Shell SPEC §6 DD8): M3 list items (56px) — the conditions
       of a record as radio rows, or a store for an item (the aviso follows
       that store's minimum) — then the avisos already asked, each with
       «Quitar». -->
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

      <!-- A record that already did everything (a paid invoice, a cancelled
           document): the server's one line instead of an empty list. -->
      <p
        v-else-if="!isItem && !options.length"
        class="px-4 py-3 text-base text-ink-gray-7"
        data-avisame-done
      >
        {{ optionsNote || 'No hay nada que avisarte en este documento.' }}
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
        <p
          v-if="optionsNote"
          class="px-4 pt-1 text-sm text-ink-gray-6"
          data-avisame-done
        >
          {{ optionsNote }}
        </p>
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

      <!-- An item: a store, nothing to type. The aviso follows the store's
           minimum (ERPNext's reorder level), set in «Mínimos por tienda». -->
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
              :subtitle="storeLine(row)"
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
          :subtitle="storeLine(warehouses[0])"
          data-avisame-store
        />
        <p v-else class="px-4 py-2 text-base text-ink-gray-6">
          Este artículo no tiene existencias en ninguna tienda todavía.
        </p>
        <p
          v-if="selectedStore && minimum > 0"
          class="px-4 pt-3 text-sm text-ink-gray-6"
          data-avisame-minimum
        >
          Te aviso una vez cada vez que baje de {{ formatQty(minimum) }} en
          {{ selectedStore.label }}. El mínimo se cambia en «Mínimos por
          tienda».
        </p>
        <!-- No minimum yet: who keeps the catalog sets it from here; anyone
             else is told who does. -->
        <div
          v-else-if="selectedStore"
          class="space-y-2 px-4 pt-3"
          data-avisame-no-minimum
        >
          <p v-if="canSetMinimum" class="text-sm text-ink-gray-7">
            Esta tienda no tiene mínimo. Ponlo primero.
          </p>
          <p v-else class="text-sm text-ink-gray-7" data-avisame-ask-minimum>
            Esta tienda no tiene mínimo. Pide a quien mantiene el catálogo que
            lo ponga.
          </p>
          <Button
            v-if="canSetMinimum"
            class="min-h-11 sm:min-h-7"
            label="Poner mínimo"
            data-avisame-set-minimum
            @click="setMinimum"
          />
        </div>
      </section>

      <section v-if="active.length" aria-labelledby="avisame-mine">
        <h3
          id="avisame-mine"
          class="px-4 pb-1 pt-3 text-sm font-medium text-ink-gray-7"
        >
          Tus avisos
        </h3>
        <ul>
          <li v-for="row in active" :key="row.name">
            <ListRow
              icon="lucide-bell-ring"
              :title="row.condition"
              :subtitle="avisoStatus(row)"
            >
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
  conditionInSentence,
  errorText,
  misAvisos,
  quitarAviso,
  storeMinimum,
  todayIso,
} from './avisame'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  // The record's display name (party or item), shown under the title.
  title: { type: String, default: '' },
  // Item only: [{ warehouse, label, qty, reorder_level, watch }] the user may
  // watch. reorder_level is the store's minimum in ERPNext, the aviso's line
  // (qty is null where the user's stock read does not reach); watch is the
  // user's own there, { name, status: activo | disparado | pausado }, or null.
  warehouses: { type: Array, default: () => [] },
  // Item only: the store to select on opening (the page brings the sheet
  // back on the store whose minimum was just set); else the first store that
  // can take a new aviso.
  store: { type: String, default: '' },
  // Item only: the user keeps the catalog, so a store without a minimum
  // offers «Poner mínimo»; anyone else is told who sets it.
  canSetMinimum: { type: Boolean, default: false },
})
// set-minimum (warehouse): «Poner mínimo» closed the sheet; the page shows
// that store's «Mínimo».
const emit = defineEmits(['changed', 'set-minimum'])

const today = todayIso()
const isItem = computed(() => props.doctype === 'Item')
const loading = ref(false)
const saving = ref(false)
const removing = ref('')
const error = ref('')
const note = ref('')
// What the record already did, from avisame_options («Esta factura ya está
// pagada.»): those conditions are left out of the list.
const optionsNote = ref('')
const options = ref([])
const active = ref([])
const choice = ref('')
const untilDate = ref('')
const warehouse = ref('')

const chosen = computed(() => options.value.find((o) => o.key === choice.value))
const selectedStore = computed(() =>
  props.warehouses.find((row) => row.warehouse === warehouse.value),
)
const minimum = computed(() => storeMinimum(selectedStore.value))
function optionHint(option) {
  if (option.active) return 'Ya lo pediste'
  return option.needs_date ? 'Eliges la fecha límite' : 'Un aviso, cuando pase'
}
function storeLine(row) {
  const level = storeMinimum(row)
  const parts = []
  if (row.qty !== null && row.qty !== undefined)
    parts.push(`Hay ${formatQty(row.qty)}`)
  parts.push(level > 0 ? `Mínimo ${formatQty(level)}` : 'Sin mínimo')
  return parts.join(' · ')
}
// «Ya te avisé»: a stock watch that already warned says so. A paused one
// already says it in its own line (Doco's «Pausado: … no tiene mínimo…»)
// and an active one needs no word.
const watchStatus = computed(
  () =>
    new Map(
      props.warehouses
        .filter((row) => row.watch?.name)
        .map((row) => [row.watch.name, row.watch.status]),
    ),
)
function avisoStatus(row) {
  const status = watchStatus.value.get(row.name)
  if (status === 'disparado') return 'Ya te avisé'
  return ''
}
// The store the page asked for, else the first that can take a new aviso:
// one with a minimum and no aviso of the user yet, else one with a minimum,
// else the first.
function firstStore() {
  const rows = props.warehouses
  const found =
    rows.find((row) => props.store && row.warehouse === props.store) ||
    rows.find((row) => storeMinimum(row) > 0 && !row.watch) ||
    rows.find((row) => storeMinimum(row) > 0) ||
    rows[0]
  return found?.warehouse || ''
}
// An item's aviso needs the store's minimum: without one there is nothing
// to cross, and «Poner mínimo» leads to where it is set.
const ready = computed(() => {
  if (isItem.value) return Boolean(selectedStore.value) && minimum.value > 0
  if (!chosen.value || chosen.value.active) return false
  return !chosen.value.needs_date || Boolean(untilDate.value)
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

async function load({ keep = false } = {}) {
  loading.value = true
  error.value = ''
  note.value = ''
  optionsNote.value = ''
  choice.value = ''
  untilDate.value = ''
  try {
    if (isItem.value) {
      // A reload after a save keeps the store the user is looking at.
      if (!keep || !selectedStore.value) warehouse.value = firstStore()
      active.value = await misAvisos('Item', props.name)
    } else {
      const data = await avisameOptions(props.doctype, props.name)
      options.value = data?.options || []
      optionsNote.value = data?.note || ''
      active.value = data?.active || []
      choice.value = options.value.find((o) => !o.active)?.key || ''
    }
  } catch (failure) {
    error.value = errorText(failure, 'No se pudieron cargar tus avisos.')
  } finally {
    loading.value = false
  }
}

// «Poner mínimo»: the minimum is set on the product («Mínimos por tienda»),
// not here; the sheet closes and the page takes the worker to that store.
function setMinimum() {
  const store = warehouse.value
  open.value = false
  emit('set-minimum', store)
}

async function save() {
  if (!ready.value) return
  saving.value = true
  error.value = ''
  try {
    const row = isItem.value
      ? await avisameStock(props.name, warehouse.value)
      : await avisame(
          props.doctype,
          props.name,
          choice.value,
          chosen.value?.needs_date ? untilDate.value : null,
        )
    emit('changed')
    if (row?.note) {
      note.value = row.note
      await load({ keep: true })
      note.value = row.note
      return
    }
    toast.success(
      row?.status === 'Cumplido'
        ? 'Ya pasó: te llegó el aviso.'
        : `Listo. Te aviso: ${conditionInSentence(row?.condition)}.`,
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
