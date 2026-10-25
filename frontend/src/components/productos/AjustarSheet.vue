<template>
  <!-- «Ajustar existencia» (Shell D4, picture design/refs/wave-d/kardex/
       ext-shopify-ajuste-inventario.jpg): one store, a big stepper on what
       there is, «Original: N», the Motivo, then what is available after it.
       It saves a draft Stock Reconciliation through the documentos engine;
       the stock changes only when the ajuste is confirmed. -->
  <BottomSheet
    v-model:open="open"
    title="Ajustar existencia"
    :subtitle="subtitle"
    :dismissible="!saving"
  >
    <div class="space-y-5 pt-2" data-ajustar-sheet>
      <section class="flex flex-col items-center gap-2">
        <h3 :id="qtyId" class="text-base-medium text-ink-gray-8">
          En existencia
        </h3>
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="flex size-14 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
            aria-label="Uno menos"
            :disabled="saving || counted <= 0"
            data-ajustar-menos
            @click="step(-1)"
          >
            <span class="lucide-minus size-6" aria-hidden="true" />
          </button>
          <input
            v-model="typed"
            type="text"
            inputmode="decimal"
            :aria-labelledby="qtyId"
            class="h-20 w-36 rounded-full border border-outline-gray-2 bg-surface-base text-center text-4xl font-semibold tabular-nums text-ink-gray-9 focus:border-outline-gray-4 focus:outline-none"
            :disabled="saving"
            data-ajustar-qty
            @focus="$event.target.select()"
          />
          <button
            type="button"
            class="flex size-14 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
            aria-label="Uno más"
            :disabled="saving"
            data-ajustar-mas
            @click="step(1)"
          >
            <span class="lucide-plus size-6" aria-hidden="true" />
          </button>
        </div>
        <p class="text-sm text-ink-gray-6" data-ajustar-original>
          Original: {{ amount(original) }}
          <span
            v-if="valid && difference"
            class="ml-1 font-medium tabular-nums"
            :class="difference > 0 ? 'text-ink-green-7' : 'text-ink-red-7'"
            data-ajustar-diferencia
            >· {{ difference > 0 ? '+' : '−'
            }}{{ amount(Math.abs(difference)) }}</span
          >
        </p>
        <p v-if="!valid" role="alert" class="text-sm text-ink-red-7">
          Escribe una cantidad de 0 en adelante.
        </p>
      </section>

      <section class="overflow-hidden rounded-xl border border-outline-gray-1">
        <button
          type="button"
          class="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-surface-gray-1"
          :aria-expanded="String(choosing)"
          data-ajustar-motivo
          @click="choosing = !choosing"
        >
          <span class="text-base text-ink-gray-9">Motivo</span>
          <span
            class="min-w-0 flex-1 truncate text-right text-base text-ink-gray-6"
            >{{ reasonLabel }}</span
          >
          <span
            class="size-5 flex-none text-ink-gray-5"
            :class="choosing ? 'lucide-chevron-up' : 'lucide-chevron-down'"
            aria-hidden="true"
          />
        </button>
        <ul
          v-if="choosing"
          role="radiogroup"
          aria-label="Motivo"
          class="border-t border-outline-gray-1"
        >
          <li v-for="option in REASONS" :key="option.key">
            <ListRow
              role="radio"
              :aria-checked="reason === option.key ? 'true' : 'false'"
              :title="option.label"
              :subtitle="option.hint"
              :selected="reason === option.key"
              @click="pick(option.key)"
            >
              <template #leading>
                <RadioDot :on="reason === option.key" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div
          v-if="reason === 'otro' || note"
          class="border-t border-outline-gray-1 px-4 py-3"
        >
          <FormControl
            v-model="note"
            type="text"
            :label="reason === 'otro' ? 'Cuál' : 'Nota (opcional)'"
            :placeholder="reason === 'otro' ? 'Escribe el motivo' : ''"
            maxlength="200"
            class="[&_input]:min-h-12"
            data-ajustar-nota
          />
        </div>
      </section>

      <dl
        class="divide-y divide-outline-gray-1 rounded-xl border border-outline-gray-1 text-base"
        data-ajustar-resumen
      >
        <div class="flex items-center justify-between px-4 py-3">
          <dt class="text-ink-gray-8">Disponible</dt>
          <dd class="tabular-nums text-ink-gray-9">
            {{ valid ? amount(counted - reserved) : '—' }}
          </dd>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <dt class="text-ink-gray-8">Reservado</dt>
          <dd class="tabular-nums text-ink-gray-9">{{ amount(reserved) }}</dd>
        </div>
        <div class="flex items-center justify-between px-4 py-3 font-semibold">
          <dt class="text-ink-gray-9">En existencia</dt>
          <dd class="tabular-nums text-ink-gray-9">
            {{ valid ? amount(counted) : '—' }}
          </dd>
        </div>
      </dl>
      <p
        v-if="valid && reserved > counted"
        class="text-sm text-ink-amber-7"
        data-ajustar-reservado
      >
        Quedarían menos piezas de las reservadas: revisa los pedidos de esta
        tienda.
      </p>

      <p class="text-sm text-ink-gray-6">
        Se guarda como borrador de ajuste. La existencia cambia cuando lo
        confirmas.
      </p>
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-12 w-full"
        variant="solid"
        :label="unchanged ? 'Sin cambios' : 'Guardar borrador'"
        :disabled="!ready"
        :loading="saving"
        data-ajustar-guardar
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import RadioDot from '@/components/documentos/RadioDot.vue'
import { docApi, errorText } from '@/documentos/api'
import { ajusteComment, AJUSTE_REASONS, parseQty } from './ajustar'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  item: { type: String, required: true },
  itemName: { type: String, default: '' },
  // The Producto store row: { warehouse, label, actual_qty, reserved_qty }.
  row: { type: Object, default: null },
})
const emit = defineEmits(['saved'])

const REASONS = AJUSTE_REASONS
const qtyId = `ajustar-qty-${Math.random().toString(36).slice(2, 8)}`
const typed = ref('')
const reason = ref('correccion')
const note = ref('')
const choosing = ref(false)
const saving = ref(false)
const error = ref('')

const original = computed(() => Number(props.row?.actual_qty) || 0)
const reserved = computed(() => Number(props.row?.reserved_qty) || 0)
const counted = computed(() => parseQty(typed.value))
const valid = computed(() => counted.value !== null)
const difference = computed(() =>
  valid.value ? round(counted.value - original.value) : 0,
)
const unchanged = computed(() => valid.value && !difference.value)
const ready = computed(
  () =>
    valid.value &&
    !unchanged.value &&
    !saving.value &&
    !!props.row?.warehouse &&
    (reason.value !== 'otro' || !!note.value.trim()),
)
const reasonLabel = computed(
  () => REASONS.find((r) => r.key === reason.value)?.label || '',
)
const subtitle = computed(() =>
  [props.itemName || props.item, props.row?.label].filter(Boolean).join(' · '),
)

watch(
  open,
  (now) => {
    if (!now) return
    typed.value = amount(original.value)
    reason.value = 'correccion'
    note.value = ''
    choosing.value = false
    error.value = ''
  },
  { immediate: true },
)

function round(n) {
  return Math.round(n * 1000) / 1000
}

function amount(n) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(
    Number(n) || 0,
  )
}

function step(delta) {
  const base = valid.value ? counted.value : original.value
  typed.value = amount(Math.max(0, round(base + delta)))
}

function pick(key) {
  reason.value = key
  choosing.value = false
}

async function save() {
  if (!ready.value) return
  saving.value = true
  error.value = ''
  try {
    const made = await docApi('save', {
      doctype: 'Stock Reconciliation',
      values: {
        purpose: 'Stock Reconciliation',
        set_warehouse: props.row.warehouse,
        items: [
          {
            item_code: props.item,
            warehouse: props.row.warehouse,
            qty: counted.value,
          },
        ],
      },
      comment: ajusteComment(reason.value, note.value),
    })
    open.value = false
    emit('saved', { name: made?.name, difference: difference.value })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>
