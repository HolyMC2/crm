<template>
  <!-- Bags at closing for one safe (posawesome bag_plan_api): with it on, the
       POS tells the cashier which bills go to the bank, which make the next
       float and which stay in the safe as change. The owner sets the float's
       pieces, the change the safe keeps and where the bank bills start. -->
  <BottomSheet
    :open="open"
    title="Bolsas al cerrar"
    :subtitle="safe?.title || ''"
    :dismissible="!busy"
    data-efectivo-bolsas
    @update:open="(v) => !busy && $emit('update:open', v)"
  >
    <div
      v-if="state === 'loading'"
      role="status"
      aria-label="Cargando…"
      class="space-y-3 pb-2"
    >
      <div
        v-for="n in 3"
        :key="n"
        class="h-12 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <div
      v-else-if="state === 'error'"
      role="alert"
      class="space-y-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      <p>{{ error }}</p>
      <Button label="Reintentar" @click="load" />
    </div>
    <div v-else class="space-y-4 pb-2">
      <Switch
        v-model="form.on"
        label="Muelle arma las bolsas al cerrar"
        :disabled="busy"
        data-bolsas-on
      />

      <section
        class="space-y-2 rounded-7 bg-[var(--muelle-surface-container-low)] p-3"
        aria-label="Fondo del siguiente turno"
        data-bolsas-fondo-card
      >
        <div class="flex items-baseline justify-between gap-3 px-1">
          <span class="text-base font-medium text-ink-gray-9">Fondo</span>
          <span
            class="num text-xl font-semibold text-ink-gray-9"
            data-bolsas-fondo
            >{{ money(fromMinor(floatTotal), currency) }}</span
          >
        </div>
        <FaceSteppers
          v-model="form.mix"
          :faces="faces"
          :currency="currency"
          :busy="busy"
          label="Piezas del fondo"
          grid
        />
      </section>

      <Field
        v-model="form.change"
        type="money"
        :currency="currency"
        label="Cambio en la caja fuerte"
        :disabled="busy"
        :error="changeError"
        data-bolsas-cambio
      />

      <section aria-labelledby="bolsas-banco" data-bolsas-banco>
        <span
          id="bolsas-banco"
          class="block px-1 text-sm font-medium text-[var(--muelle-on-surface-variant)]"
          >Al banco desde</span
        >
        <div
          role="radiogroup"
          aria-labelledby="bolsas-banco"
          class="flex flex-wrap gap-x-2"
        >
          <button
            v-for="face in bills"
            :key="face"
            type="button"
            role="radio"
            :class="chipClass(form.bankFrom === face)"
            :aria-checked="form.bankFrom === face"
            :disabled="busy"
            :data-bank-face="face"
            @click="form.bankFrom = face"
          >
            {{ faceLabel(face, currency) }}
          </button>
        </div>
      </section>
    </div>

    <template #actions>
      <p
        v-if="saveError"
        role="alert"
        class="mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ saveError }}
      </p>
      <div class="flex items-center justify-end gap-2">
        <span
          v-if="missing"
          role="status"
          class="mr-auto min-w-0 text-sm text-ink-gray-7"
          data-bolsas-falta
          >{{ missing }}</span
        >
        <Button
          variant="ghost"
          size="lg"
          label="Cancelar"
          :disabled="busy"
          @click="$emit('update:open', false)"
        />
        <Button
          variant="solid"
          size="lg"
          label="Guardar"
          :loading="busy"
          :disabled="state !== 'ready' || !!missing"
          data-bolsas-guardar
          @click="save"
        />
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { BottomSheet, Button, Field, Switch, chipClass } from '@/components/ui'
import FaceSteppers from './FaceSteppers.vue'
import {
  bagPlanRead,
  bagPlanSave,
  errorText,
  faceLabel,
  fromMinor,
  money,
  totalMinor,
} from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** A safe row from Efectivo's home read: {safe, title, currency}. */
  safe: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const state = ref('idle')
const error = ref('')
const saveError = ref('')
const busy = ref(false)
const faces = ref([])
const currency = ref('')
const form = reactive({ on: false, mix: {}, change: '', bankFrom: 0 })

const minor = (major) => Math.round((Number(major) || 0) * 100)
const floatTotal = computed(() => totalMinor(form.mix))
const bills = computed(() => faces.value.filter((face) => face >= 100))
const changeValid = computed(() =>
  /^\d+(\.\d{1,2})?$/.test(String(form.change).trim()),
)
const changeError = computed(() =>
  state.value === 'ready' && !changeValid.value
    ? 'Escribe el cambio con números, por ejemplo 1500.'
    : '',
)
const missing = computed(() => {
  if (state.value !== 'ready') return ''
  if (!changeValid.value) return 'Falta el cambio'
  if (form.on && floatTotal.value <= 0)
    return 'Pon al menos un billete o moneda en el fondo.'
  return ''
})

async function load() {
  if (!props.safe) return
  state.value = 'loading'
  error.value = ''
  saveError.value = ''
  try {
    const view = await bagPlanRead(props.safe.safe)
    currency.value = view.currency || props.safe.currency || ''
    faces.value = (view.faces || []).map(minor)
    form.on = Boolean(view.on)
    form.mix = Object.fromEntries(
      (view.float_mix || []).map((row) => [minor(row.value), row.quantity]),
    )
    form.change = String(view.change_target ?? '')
    form.bankFrom = minor(view.bank_from)
    state.value = 'ready'
  } catch (exception) {
    error.value = errorText(exception)
    state.value = 'error'
  }
}

watch(
  () => [props.open, props.safe?.safe],
  ([open]) => {
    if (open) load()
  },
  { immediate: true },
)

async function save() {
  if (busy.value || missing.value) return
  busy.value = true
  saveError.value = ''
  try {
    const view = await bagPlanSave(props.safe.safe, {
      on: form.on,
      floatMix: Object.entries(form.mix)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([face, quantity]) => ({
          value: Number(face) / 100,
          quantity: Number(quantity),
        }))
        .sort((a, b) => b.value - a.value),
      changeTarget: String(form.change).trim(),
      bankFrom: form.bankFrom / 100,
    })
    emit('saved', {
      view,
      toast: view.on
        ? 'Listo: el POS arma las bolsas al cerrar'
        : 'Listo: las bolsas se arman a mano',
    })
    emit('update:open', false)
  } catch (exception) {
    saveError.value = errorText(exception)
  } finally {
    busy.value = false
  }
}
</script>
