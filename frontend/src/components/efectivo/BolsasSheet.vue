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
    <div v-else class="space-y-5 pb-2">
      <button
        type="button"
        role="switch"
        class="press flex min-h-11 w-full items-center gap-3 text-left"
        :aria-checked="form.on"
        data-bolsas-on
        :disabled="busy"
        @click="form.on = !form.on"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base text-ink-gray-9"
            >Muelle arma las bolsas al cerrar</span
          >
          <span class="block text-xs text-ink-gray-6"
            >La caja se cuenta una vez y el POS dice qué billetes van al banco,
            cuáles al fondo y cuáles se quedan de cambio.</span
          >
        </span>
        <span
          class="relative h-7 w-12 flex-none rounded-full transition-colors"
          :class="form.on ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
            :class="form.on ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </span>
      </button>

      <section class="space-y-2" aria-label="Fondo del siguiente turno">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-base font-medium text-ink-gray-9">
            Fondo del siguiente turno
          </h3>
          <span
            class="num text-xl font-semibold text-ink-gray-9"
            data-bolsas-fondo
            >{{ money(fromMinor(floatTotal), currency) }}</span
          >
        </div>
        <p class="text-xs text-ink-gray-6">
          Cuántas piezas de cada billete y moneda lleva, para dar cambio.
        </p>
        <FaceSteppers
          v-model="form.mix"
          :faces="shownFaces"
          :currency="currency"
          :busy="busy"
          label="Piezas del fondo"
        />
        <button
          v-if="hiddenFaces"
          type="button"
          class="min-h-11 text-sm font-medium text-ink-gray-7 underline underline-offset-2"
          @click="allFaces = true"
        >
          Agregar billetes grandes al fondo
        </button>
      </section>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7"
          >Cambio que guarda la caja fuerte</span
        >
        <input
          v-model="form.change"
          inputmode="decimal"
          class="num h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy"
          data-bolsas-cambio
        />
        <span class="block text-xs text-ink-gray-6"
          >Monedas y billetes chicos para los siguientes fondos. Lo que pase de
          aquí se va al banco; con 0, todo va al banco.</span
        >
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7"
          >Al banco van billetes desde</span
        >
        <select
          v-model.number="form.bankFrom"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy"
          data-bolsas-banco
        >
          <option v-for="face in bills" :key="face" :value="face">
            {{ faceLabel(face) }}
          </option>
        </select>
        <span class="block text-xs text-ink-gray-6"
          >Ese billete y los más grandes nunca van al fondo ni al cambio, salvo
          que falte dinero chico.</span
        >
      </label>
    </div>

    <template #actions>
      <p
        v-if="saveError"
        role="alert"
        class="mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ saveError }}
      </p>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          :disabled="busy"
          @click="$emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          label="Guardar"
          :loading="busy"
          :disabled="state !== 'ready' || !!missing"
          data-bolsas-guardar
          @click="save"
        />
      </div>
      <p v-if="missing" class="mt-2 text-center text-sm text-ink-gray-6">
        {{ missing }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
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
const allFaces = ref(false)
const faces = ref([])
const currency = computed(() => props.safe?.currency || 'MXN')
const form = reactive({ on: false, mix: {}, change: '', bankFrom: 0 })

const minor = (major) => Math.round((Number(major) || 0) * 100)
const floatTotal = computed(() => totalMinor(form.mix))
const bills = computed(() => faces.value.filter((face) => face >= 100))
const smallFaces = computed(() =>
  faces.value.filter(
    (face) => face < form.bankFrom || Number(form.mix[face]) > 0,
  ),
)
const shownFaces = computed(() =>
  allFaces.value ? faces.value : smallFaces.value,
)
const hiddenFaces = computed(
  () => !allFaces.value && smallFaces.value.length < faces.value.length,
)
const changeValid = computed(() =>
  /^\d+(\.\d{1,2})?$/.test(String(form.change).trim()),
)
const missing = computed(() => {
  if (state.value !== 'ready') return ''
  if (!changeValid.value)
    return 'Escribe el cambio con números, por ejemplo 1500.'
  if (form.on && floatTotal.value <= 0)
    return 'Pon al menos un billete o moneda en el fondo.'
  return ''
})

async function load() {
  if (!props.safe) return
  state.value = 'loading'
  error.value = ''
  saveError.value = ''
  allFaces.value = false
  try {
    const view = await bagPlanRead(props.safe.safe)
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
