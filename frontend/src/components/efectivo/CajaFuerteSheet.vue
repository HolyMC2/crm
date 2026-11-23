<template>
  <!-- One safe's settings (posawesome safe_settings_api), one «Guardar»:
       the bags at closing (the float's pieces, the change the safe keeps,
       where the bank bills start) and the bank trip (an amount, some days,
       or both). Each switch opens its own fields in place. -->
  <BottomSheet
    :open="open"
    :title="safe?.title || 'Caja fuerte'"
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
    <div v-else class="space-y-3 pb-2">
      <section
        v-if="hasPlan"
        class="space-y-3 rounded-7 bg-[var(--muelle-surface-container-low)] p-3"
        aria-label="Bolsas al cerrar"
        data-caja-bolsas
      >
        <Switch
          v-model="plan.on"
          label="Bolsas al cerrar"
          :disabled="busy"
          data-bolsas-on
        />
        <template v-if="plan.on">
          <div class="flex items-baseline justify-between gap-3 px-1">
            <span class="text-base font-medium text-ink-gray-9">Fondo</span>
            <span
              class="num text-xl font-semibold text-ink-gray-9"
              data-bolsas-fondo
              >{{ money(fromMinor(floatTotal), currency) }}</span
            >
          </div>
          <FaceSteppers
            v-model="plan.mix"
            :faces="faces"
            :currency="currency"
            :busy="busy"
            label="Piezas del fondo"
            grid
          />
          <Field
            v-model="plan.change"
            type="money"
            :currency="currency"
            label="Cambio en la caja fuerte"
            :disabled="busy"
            :error="changeError"
            data-bolsas-cambio
          />
          <div aria-labelledby="bolsas-banco" data-bolsas-banco>
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
                :class="chipClass(plan.bankFrom === face)"
                :aria-checked="plan.bankFrom === face"
                :disabled="busy"
                :data-bank-face="face"
                @click="plan.bankFrom = face"
              >
                {{ faceLabel(face, currency) }}
              </button>
            </div>
          </div>
        </template>
      </section>

      <section
        v-if="hasTrip"
        class="space-y-3 rounded-7 bg-[var(--muelle-surface-container-low)] p-3"
        aria-label="Viaje al banco"
        data-caja-viaje
      >
        <Switch
          :model-value="trip.on"
          label="Viaje al banco"
          :disabled="busy"
          data-viaje-on
          @update:model-value="turnTrip"
        />
        <template v-if="trip.on">
          <Field
            v-model="trip.amount"
            type="money"
            :currency="currency"
            label="Al juntar"
            :disabled="busy"
            :error="amountError"
            data-viaje-importe
          />
          <div class="flex min-h-12 items-center justify-between gap-3 px-1">
            <span class="text-base text-ink-gray-9">O a los</span>
            <div
              class="inline-flex h-11 items-center rounded-full bg-[var(--muelle-surface-container-highest)]"
              role="group"
              aria-label="Días"
              data-viaje-dias
            >
              <button
                type="button"
                class="press grid size-11 place-items-center rounded-full text-ink-gray-8 disabled:opacity-40"
                aria-label="Un día menos"
                :disabled="busy || trip.days <= 0"
                @click="trip.days = Math.max(0, trip.days - 1)"
              >
                <span class="lucide-minus size-4" aria-hidden="true" />
              </button>
              <span
                class="num min-w-16 text-center text-sm font-semibold tabular-nums text-ink-gray-9"
                aria-live="polite"
                >{{
                  trip.days
                    ? trip.days === 1
                      ? '1 día'
                      : `${trip.days} días`
                    : 'Sin días'
                }}</span
              >
              <button
                type="button"
                class="press grid size-11 place-items-center rounded-full text-ink-gray-8 disabled:opacity-40"
                aria-label="Un día más"
                :disabled="busy || trip.days >= DAYS_MAX"
                @click="trip.days = Math.min(DAYS_MAX, trip.days + 1)"
              >
                <span class="lucide-plus size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </template>
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
  errorText,
  faceLabel,
  fromMinor,
  money,
  safeSettingsRead,
  safeSettingsSave,
  totalMinor,
} from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** A safe row from Efectivo's home read: {safe, title, currency}. */
  safe: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const DAYS_MAX = 60
// The first switch-on of the bank trip proposes this many days (SPEC DECISIONS).
const FIRST_DAYS = 3
const state = ref('idle')
const error = ref('')
const saveError = ref('')
const busy = ref(false)
const faces = ref([])
const currency = ref('')
const hasPlan = ref(false)
const hasTrip = ref(false)
const plan = reactive({ on: false, mix: {}, change: '', bankFrom: 0 })
const trip = reactive({ on: false, amount: '', days: 0 })

const minor = (major) => Math.round((Number(major) || 0) * 100)
const floatTotal = computed(() => totalMinor(plan.mix))
const bills = computed(() => faces.value.filter((face) => face >= 100))
const amountPattern = /^\d+(\.\d{1,2})?$/
const changeValid = computed(() =>
  amountPattern.test(String(plan.change).trim()),
)
const changeError = computed(() =>
  state.value === 'ready' && plan.on && !changeValid.value
    ? 'Escribe el cambio con números, por ejemplo 1500.'
    : '',
)
const amountValid = computed(() => {
  const text = String(trip.amount ?? '').trim()
  return !text || amountPattern.test(text)
})
const amountError = computed(() =>
  amountValid.value ? '' : 'Escribe el importe con números, por ejemplo 15000.',
)
const missing = computed(() => {
  if (state.value !== 'ready') return ''
  if (hasPlan.value && plan.on) {
    if (!changeValid.value) return 'Falta el cambio'
    if (floatTotal.value <= 0)
      return 'Pon al menos un billete o moneda en el fondo.'
  }
  if (hasTrip.value && trip.on) {
    if (!amountValid.value) return 'Revisa el importe'
    if (!(Number(trip.amount) > 0) && !(trip.days > 0))
      return 'Di cuándo va al banco: un importe, unos días o los dos.'
  }
  return ''
})

function turnTrip(on) {
  trip.on = on
  // First time on: three days, the amount blank (the shop says its own).
  if (on && !trip.days && !(Number(trip.amount) > 0)) trip.days = FIRST_DAYS
}

async function load() {
  if (!props.safe) return
  state.value = 'loading'
  error.value = ''
  saveError.value = ''
  try {
    const view = await safeSettingsRead(props.safe.safe)
    currency.value = view.currency || props.safe.currency || ''
    const bp = view.bag_plan
    hasPlan.value = Boolean(bp)
    if (bp) {
      faces.value = (bp.faces || []).map(minor)
      plan.on = Boolean(bp.on)
      plan.mix = Object.fromEntries(
        (bp.float_mix || []).map((row) => [minor(row.value), row.quantity]),
      )
      plan.change = String(bp.change_target ?? '')
      plan.bankFrom = minor(bp.bank_from)
    }
    const bt = view.bank_trip
    hasTrip.value = Boolean(bt)
    if (bt) {
      trip.on = Boolean(bt.on)
      trip.amount = bt.amount ? String(bt.amount) : ''
      trip.days = Number(bt.days) || 0
    }
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
    const view = await safeSettingsSave(props.safe.safe, {
      plan: hasPlan.value
        ? {
            on: plan.on,
            floatMix: Object.entries(plan.mix)
              .filter(([, quantity]) => Number(quantity) > 0)
              .map(([face, quantity]) => ({
                value: Number(face) / 100,
                quantity: Number(quantity),
              }))
              .sort((a, b) => b.value - a.value),
            changeTarget: String(plan.change).trim(),
            bankFrom: plan.bankFrom / 100,
          }
        : null,
      trip: hasTrip.value
        ? {
            on: trip.on,
            amount: Number(String(trip.amount || '').trim()) || 0,
            days: trip.days,
          }
        : null,
    })
    emit('saved', { view, toast: 'Caja fuerte guardada' })
    emit('update:open', false)
  } catch (exception) {
    saveError.value = errorText(exception)
  } finally {
    busy.value = false
  }
}
</script>
