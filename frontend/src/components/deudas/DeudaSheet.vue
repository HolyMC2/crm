<template>
  <!-- One debt: its name and kind, the terms from its statement (rate, tax on
       interest, minimum, cut and due day) and, only when neither the bank nor
       the books know it, what is owed today. «Ya la terminé de pagar» takes it
       out of the plan. -->
  <BottomSheet
    :open="open"
    :title="debt ? debt.title : 'Nueva deuda'"
    :subtitle="
      debt ? subtitle : 'Una tarjeta, un préstamo o un crédito de proveedor'
    "
    layer="deudas-deuda"
    :dismissible="!dirty"
    @update:open="(v) => emit('update:open', v)"
  >
    <form
      id="deuda-form"
      class="space-y-4 pb-2"
      data-deuda-form
      @submit.prevent="save"
    >
      <div class="space-y-1">
        <label for="deuda-titulo" class="block text-sm text-ink-gray-7"
          >Nombre</label
        >
        <input
          id="deuda-titulo"
          v-model="form.title"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
          placeholder="Como tú la llamas"
          required
        />
      </div>
      <div class="space-y-1">
        <p class="text-sm text-ink-gray-7">Qué es</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="k in KINDS"
            :key="k.value"
            type="button"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              form.kind === k.value
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-pressed="form.kind === k.value"
            @click="form.kind = k.value"
          >
            {{ k.label }}
          </button>
        </div>
      </div>
      <div v-if="askBalance" class="space-y-1">
        <label for="deuda-saldo" class="block text-sm text-ink-gray-7"
          >¿Cuánto debes hoy?</label
        >
        <input
          id="deuda-saldo"
          v-model="form.balance_manual"
          inputmode="decimal"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
          placeholder="0.00"
        />
        <p class="text-sm text-ink-gray-6">
          Sin banco conectado ni cuenta en tus libros, este número es el saldo.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="deuda-tasa" class="block text-sm text-ink-gray-7"
            >Tasa anual (%)</label
          >
          <input
            id="deuda-tasa"
            v-model="form.annual_rate"
            inputmode="decimal"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="0"
          />
        </div>
        <div class="space-y-1">
          <label for="deuda-impuesto" class="block text-sm text-ink-gray-7"
            >Impuesto sobre intereses (%)</label
          >
          <input
            id="deuda-impuesto"
            v-model="form.tax_on_interest"
            inputmode="decimal"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="0"
          />
        </div>
      </div>
      <p class="-mt-2 text-sm text-ink-gray-6">
        Vienen en tu estado de cuenta: la tasa como CAT o tasa anual. Con 0 %,
        los meses sin intereses.
      </p>
      <div class="space-y-1">
        <label for="deuda-minimo" class="block text-sm text-ink-gray-7"
          >Pago mínimo</label
        >
        <input
          id="deuda-minimo"
          v-model="form.minimum_payment"
          inputmode="decimal"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
          placeholder="Si lo dejas vacío, Muelle lo estima"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="deuda-corte" class="block text-sm text-ink-gray-7"
            >Día de corte</label
          >
          <input
            id="deuda-corte"
            v-model="form.cut_day"
            inputmode="numeric"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="1 a 31"
          />
        </div>
        <div class="space-y-1">
          <label for="deuda-pago" class="block text-sm text-ink-gray-7"
            >Día de pago</label
          >
          <input
            id="deuda-pago"
            v-model="form.due_day"
            inputmode="numeric"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="1 a 31"
          />
        </div>
      </div>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-deuda-problem
      >
        {{ problem }}
      </p>
      <Button
        v-if="debt && debt.active"
        class="min-h-11"
        variant="ghost"
        label="Ya la terminé de pagar"
        data-deuda-pagada
        @click="paidOff"
      />
    </form>
    <template #actions>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          @click="emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          :label="debt ? 'Guardar' : 'Agregar deuda'"
          :loading="busy"
          data-deuda-guardar
          @click="save"
        />
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import { KINDS, SOURCE_WORDS, deudasApi } from './deudas'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** A debt of the board, or null for a new one. */
  debt: { type: Object, default: null },
  company: { type: String, required: true },
  currency: { type: String, default: 'MXN' },
  /** The country's tax on interest (Mexico: 16), for a new debt. */
  taxDefault: { type: Number, default: 0 },
})
const emit = defineEmits(['update:open', 'saved'])

const FIELDS = [
  'title',
  'kind',
  'balance_manual',
  'annual_rate',
  'tax_on_interest',
  'minimum_payment',
  'cut_day',
  'due_day',
]
const form = reactive({})
const initial = ref('')
const busy = ref(false)
const problem = ref('')

const subtitle = computed(() =>
  props.debt
    ? `Debe ${money(props.debt.owed, props.currency)} · ${SOURCE_WORDS[props.debt.owed_source] || ''}`
    : '',
)
// The typed balance only matters when nothing else knows it.
const askBalance = computed(
  () =>
    !props.debt ||
    props.debt.owed_source === 'escrito' ||
    props.debt.owed_source === 'ninguno',
)
const dirty = computed(() => JSON.stringify(form) !== initial.value)

function reset() {
  const d = props.debt
  form.title = d?.title || ''
  form.kind = d?.kind || 'Credit card'
  form.balance_manual = d?.balance_manual ?? ''
  form.annual_rate = d ? d.annual_rate || '' : ''
  form.tax_on_interest = d ? d.tax_on_interest : props.taxDefault
  form.minimum_payment = d?.minimum_payment ?? ''
  form.cut_day = d?.cut_day ?? ''
  form.due_day = d?.due_day ?? ''
  problem.value = ''
  initial.value = JSON.stringify(form)
}

function values() {
  const out = {}
  for (const key of FIELDS) {
    const v = form[key]
    if (key === 'title' || key === 'kind') out[key] = v
    else
      out[key] =
        v === '' || v === null ? null : Number(String(v).replace(/,/g, ''))
  }
  if (!askBalance.value) delete out.balance_manual
  return out
}

async function send(extra = {}) {
  busy.value = true
  problem.value = ''
  try {
    const out = await deudasApi('guardar_deuda', {
      company: props.company,
      name: props.debt?.name,
      values: { ...values(), ...extra },
    })
    emit('saved', out)
    emit('update:open', false)
    return true
  } catch (e) {
    problem.value = errorText(e)
    return false
  } finally {
    busy.value = false
  }
}

async function save() {
  if (busy.value) return
  if (!String(form.title || '').trim()) {
    problem.value = 'Ponle nombre, como tú la llamas.'
    return
  }
  await send()
}

async function paidOff() {
  if (await send({ active: 0 })) toast.success('Listo, salió del plan.')
}

watch(
  () => [props.open, props.debt?.name],
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)
</script>
