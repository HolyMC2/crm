<template>
  <BottomSheet
    v-model:open="open"
    title="Avísame…"
    :subtitle="title"
    :dismissible="!saving"
  >
    <div class="space-y-4 px-1 pb-2">
      <p v-if="loading" class="text-base text-ink-gray-6">Cargando…</p>

      <!-- A record: one condition, a date for «si no … para el». -->
      <fieldset v-else-if="!isItem" class="space-y-1">
        <legend class="pb-1 text-sm text-ink-gray-7">
          Te llega un aviso en Avisos. Al cliente no se le escribe.
        </legend>
        <button
          v-for="option in options"
          :key="option.key"
          type="button"
          role="radio"
          :aria-checked="choice === option.key"
          :disabled="option.active"
          class="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-base disabled:opacity-60"
          :class="choice === option.key ? 'bg-surface-gray-2' : ''"
          @click="choice = option.key"
        >
          <span
            class="flex size-5 flex-none items-center justify-center rounded-full border-2"
            :class="
              choice === option.key
                ? 'border-ink-gray-9'
                : 'border-outline-gray-3'
            "
            aria-hidden="true"
          >
            <span
              v-if="choice === option.key"
              class="size-2.5 rounded-full bg-ink-gray-9"
            />
          </span>
          <span class="min-w-0 flex-1 break-words">{{ option.label }}</span>
          <span v-if="option.active" class="text-sm text-ink-gray-6"
            >Ya lo pediste</span
          >
        </button>
        <FormControl
          v-if="chosen?.needs_date"
          v-model="untilDate"
          type="date"
          label="Fecha límite"
          class="pt-2 [&_input]:min-h-11"
          :min="today"
        />
      </fieldset>

      <!-- An item: a store and a quantity. -->
      <div v-else class="space-y-3">
        <p class="text-sm text-ink-gray-7">
          Te aviso una vez cada vez que baje de esa cantidad.
        </p>
        <FormControl
          v-if="warehouses.length > 1"
          v-model="warehouse"
          type="select"
          label="Tienda"
          class="[&_select]:min-h-11"
          :options="warehouseOptions"
        />
        <p v-else-if="warehouses.length === 1" class="text-base">
          {{ warehouses[0].label }}
        </p>
        <p v-else class="text-base text-ink-gray-6">
          Este artículo no tiene existencias en ninguna tienda todavía.
        </p>
        <div v-if="warehouses.length" class="space-y-1">
          <label :for="qtyId" class="block text-sm text-ink-gray-7"
            >Cuando baje de</label
          >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2"
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
              class="min-h-11 w-full min-w-0 rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-center text-base"
            />
            <button
              type="button"
              class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2"
              aria-label="Más"
              @click="step(1)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
            </button>
          </div>
          <p v-if="selectedStore" class="text-sm text-ink-gray-6">
            Ahora hay {{ formatQty(selectedStore.qty) }} en
            {{ selectedStore.label }}.
          </p>
        </div>
      </div>

      <section v-if="active.length" aria-labelledby="avisame-mine">
        <h3 id="avisame-mine" class="pb-1 text-sm font-semibold">
          Ya me avisas
        </h3>
        <ul class="space-y-1">
          <li
            v-for="row in active"
            :key="row.name"
            class="flex min-h-11 items-center gap-2"
          >
            <span
              class="lucide-bell-ring size-4 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 break-words text-base">{{
              row.condition
            }}</span>
            <Button
              variant="ghost"
              class="min-h-11"
              label="Quitar"
              :aria-label="`Quitar: ${row.condition}`"
              :loading="removing === row.name"
              @click="remove(row)"
            />
          </li>
        </ul>
      </section>

      <p v-if="note" class="text-sm text-ink-gray-7">{{ note }}</p>
      <p v-if="error" role="alert" class="text-sm text-ink-red-4">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
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
import { BottomSheet } from '@/components/ui'
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
  // Item only: [{ warehouse, label, qty }] the user may watch.
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
const warehouseOptions = computed(() =>
  props.warehouses.map((row) => ({
    value: row.warehouse,
    label: `${row.label} · hay ${formatQty(row.qty)}`,
  })),
)
const selectedStore = computed(() =>
  props.warehouses.find((row) => row.warehouse === warehouse.value),
)
const ready = computed(() => {
  if (isItem.value)
    return Boolean(warehouse.value) && cleanThreshold(threshold.value) !== null
  if (!chosen.value || chosen.value.active) return false
  return !chosen.value.needs_date || Boolean(untilDate.value)
})

watch(open, (value) => {
  if (value) load()
})

async function load() {
  loading.value = true
  error.value = ''
  note.value = ''
  choice.value = ''
  untilDate.value = ''
  try {
    if (isItem.value) {
      warehouse.value = props.warehouses[0]?.warehouse || ''
      threshold.value = ''
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
