<template>
  <!-- «Piezas»: the serials (or lotes) of one product on hand, all checked.
       The ones picked replace the product's line: one label per serial, a
       lote's copies as many as it holds. -->
  <BottomSheet
    :open="open"
    :title="row ? `Piezas de ${row.item_name}` : 'Piezas'"
    :subtitle="subtitle"
    flush
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-2 pb-4" data-etq-units>
      <p v-if="problem" role="alert" class="px-5 text-sm text-ink-red-7">
        {{ problem }}
      </p>
      <ul v-else-if="loading" class="space-y-2 px-5" aria-hidden="true">
        <li
          v-for="n in 4"
          :key="n"
          class="h-12 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
        />
      </ul>
      <p
        v-else-if="!units.length"
        class="px-5 py-6 text-center text-sm text-ink-gray-6"
      >
        No hay piezas de este producto en existencia. Su línea imprime con el
        código del producto.
      </p>
      <template v-else>
        <div class="flex items-center justify-between px-5 text-sm">
          <span class="text-ink-gray-7">
            <span class="num font-semibold text-ink-gray-9">{{
              picked.size
            }}</span>
            de {{ units.length }} elegidas
          </span>
          <button
            type="button"
            class="press min-h-11 px-2 font-medium text-ink-gray-8"
            @click="toggleAll"
          >
            {{ picked.size === units.length ? 'Quitar todas' : 'Elegir todas' }}
          </button>
        </div>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="unit in units" :key="unitKey(unit)">
            <label
              class="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-2"
            >
              <input
                type="checkbox"
                class="size-5 rounded-4"
                :checked="picked.has(unitKey(unit))"
                @change="toggle(unit)"
              />
              <span class="min-w-0 flex-1">
                <span class="num block truncate text-base text-ink-gray-9">{{
                  unit.serial_no
                    ? `S/N ${unit.serial_no}`
                    : `Lote ${unit.batch_no}`
                }}</span>
                <span
                  v-if="unitLine(unit)"
                  class="block truncate text-sm text-ink-gray-6"
                  >{{ unitLine(unit) }}</span
                >
              </span>
            </label>
          </li>
        </ul>
        <p v-if="more" class="px-5 text-sm text-ink-gray-6">
          Hay más piezas; aquí están las primeras {{ units.length }}.
        </p>
      </template>
    </div>
    <template v-if="units.length" #actions>
      <Button
        variant="solid"
        class="press min-h-11 w-full"
        :disabled="!picked.size"
        :label="addLabel"
        @click="add"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import {
  etiquetasApi,
  labelsText,
  problemText,
} from '@/composables/useEtiquetas'
import { formatDate } from '@/utils/display'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The product's line on the list.
  row: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'pick'])

const units = ref([])
const more = ref(false)
const loading = ref(false)
const problem = ref('')
const picked = ref(new Set())

const unitKey = (unit) => `${unit.serial_no || ''}|${unit.batch_no || ''}`
const subtitle = computed(() =>
  props.row?.units === 'lote'
    ? 'Cada lote imprime tantas etiquetas como piezas tiene'
    : 'Una etiqueta por pieza, con su serie',
)
const chosen = computed(() =>
  units.value.filter((unit) => picked.value.has(unitKey(unit))),
)
const addLabel = computed(() => {
  const labels = chosen.value.reduce((sum, unit) => sum + (unit.qty || 1), 0)
  return `Agregar ${labelsText(labels)}`
})

let ticket = 0
async function load() {
  if (!props.row) return
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  units.value = []
  try {
    const answer = await etiquetasApi('candidates', {
      kind: 'piezas',
      query: props.row.item_code,
    })
    if (mine !== ticket) return
    units.value = answer?.rows || []
    more.value = !!answer?.more
    picked.value = new Set(units.value.map(unitKey))
  } catch (error) {
    if (mine === ticket) problem.value = problemText(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}
watch(
  () => [props.open, props.row?.item_code],
  ([open]) => open && load(),
  { immediate: true },
)

function unitLine(unit) {
  const parts = []
  if (unit.serial_no && unit.batch_no) parts.push(`Lote ${unit.batch_no}`)
  if (unit.expiry_date) parts.push(`Caduca ${formatDate(unit.expiry_date)}`)
  if (!unit.serial_no) parts.push(`${unit.qty} pzas`)
  return parts.join(' · ')
}
function toggle(unit) {
  const next = new Set(picked.value)
  const key = unitKey(unit)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  picked.value = next
}
function toggleAll() {
  picked.value =
    picked.value.size === units.value.length
      ? new Set()
      : new Set(units.value.map(unitKey))
}
function add() {
  emit('pick', { row: props.row, units: chosen.value })
}
</script>
