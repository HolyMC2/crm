<template>
  <!-- The bank trip, one surface for leaving and for the slip: the steps,
       the money (or how many bags), where it goes, every bag checked (a tap
       leaves one behind), who carries it, and the one filled action. The same
       card registers the slip, or the trip that came back undeposited. -->
  <section
    class="rounded-7 bg-[var(--muelle-surface-container-low)] p-4"
    :aria-label="stage === 'salir' ? 'Viaje al banco' : 'Ficha del banco'"
    :data-viaje="stage"
  >
    <div class="flex flex-wrap items-center gap-2">
      <ol class="flex items-center gap-1.5 text-sm" aria-label="Pasos">
        <li
          v-for="(label, i) in ['Salir', 'Ficha']"
          :key="label"
          class="inline-flex items-center gap-1.5"
          :aria-current="i === (stage === 'salir' ? 0 : 1) ? 'step' : undefined"
        >
          <span
            class="grid size-6 place-items-center rounded-full text-xs font-semibold"
            :class="
              i === (stage === 'salir' ? 0 : 1)
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : i === 0
                  ? 'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
                  : 'border-2 border-[var(--muelle-outline)] text-ink-gray-6'
            "
            aria-hidden="true"
          >
            <span
              v-if="i === 0 && stage !== 'salir'"
              class="lucide-check size-3.5"
            />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span
            :class="
              i === (stage === 'salir' ? 0 : 1)
                ? 'font-semibold text-ink-gray-9'
                : 'text-ink-gray-6'
            "
            >{{ label }}</span
          >
        </li>
      </ol>
      <span
        v-if="chip"
        class="ml-auto inline-flex h-7 items-center gap-1 rounded-full bg-[var(--muelle-secondary-container)] px-3 text-sm font-medium text-[var(--muelle-on-secondary-container)]"
        data-viaje-razon
      >
        <span :class="[chip.icon, 'size-4']" aria-hidden="true" />
        {{ chip.label }}
      </span>
    </div>

    <p class="num mt-3 text-3xl font-semibold text-ink-gray-9" data-viaje-monto>
      {{ figure }}
    </p>
    <p class="text-sm text-ink-gray-7" data-viaje-ruta>
      <template v-if="stage === 'salir'"
        >{{ safe.title }}
        <span
          class="lucide-arrow-right mx-0.5 inline-block size-3.5 align-[-2px]"
          aria-hidden="true"
        />
        {{ bankName }}</template
      >
      <template v-else
        >{{ carrierName }}
        <span
          class="lucide-arrow-right mx-0.5 inline-block size-3.5 align-[-2px]"
          aria-hidden="true"
        />
        {{ bankName }}</template
      >
    </p>

    <ul
      class="mt-3 flex flex-col gap-0.5 overflow-hidden rounded-6"
      aria-label="Bolsas"
    >
      <li v-for="bag in bags" :key="bag.name">
        <button
          type="button"
          role="checkbox"
          class="state-layer flex min-h-12 w-full items-center gap-3 bg-[var(--muelle-surface-container-high)] px-3 text-left disabled:cursor-default"
          :aria-checked="checked.has(bag.name)"
          :disabled="
            busy ||
            stage !== 'salir' ||
            (checked.has(bag.name) && checked.size === 1)
          "
          :data-viaje-bolsa="bag.name"
          @click="toggle(bag.name)"
        >
          <span
            class="grid size-5 flex-none place-items-center rounded-4 border-2"
            :class="
              checked.has(bag.name)
                ? 'border-transparent bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border-[var(--muelle-outline)]'
            "
            aria-hidden="true"
          >
            <span v-if="checked.has(bag.name)" class="lucide-check size-3.5" />
          </span>
          <span
            class="num min-w-0 flex-1 truncate text-base"
            :class="
              checked.has(bag.name)
                ? 'text-ink-gray-9'
                : 'text-ink-gray-5 line-through'
            "
            >{{ bag.seal }}</span
          >
          <span
            v-if="showsMoney"
            class="num flex-none text-sm text-ink-gray-7"
            >{{ money(bag.amount, safe.currency) }}</span
          >
        </button>
      </li>
    </ul>

    <div class="mt-3 space-y-3">
      <template v-if="stage === 'salir'">
        <button
          v-if="!naming"
          type="button"
          :class="chipClass(false)"
          :disabled="busy"
          data-viaje-lleva
          @click="naming = true"
        >
          <span class="lucide-user size-4" aria-hidden="true" />
          Lleva {{ meName }}
        </button>
        <Field
          v-else
          v-model="carrier"
          label="Quién las lleva"
          :disabled="busy"
          data-viaje-quien
        />
      </template>
      <template v-else-if="!returning">
        <Field
          v-model="reference"
          label="Folio de la ficha"
          :disabled="busy"
          :error="referenceError"
          data-viaje-folio
        />
      </template>
      <Field
        v-else
        v-model="why"
        label="Por qué"
        type="textarea"
        :rows="2"
        :disabled="busy"
        data-viaje-porque
      />

      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7"
        data-viaje-problema
      >
        {{ problem }}
      </p>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <Button
          v-if="stage !== 'salir' && canConfirm"
          variant="ghost"
          size="lg"
          :label="returning ? 'Registrar la ficha' : 'Regresó sin depositar'"
          :disabled="busy"
          data-viaje-regreso
          @click="returning = !returning"
        />
        <Button
          v-if="stage === 'salir' || canConfirm"
          variant="solid"
          size="lg"
          :label="mainLabel"
          :loading="busy"
          :disabled="!ready"
          data-viaje-accion
          @click="go"
        />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Field, chipClass } from '@/components/ui'
import { formatDateTime } from '@/utils/display'
import {
  bagsWord,
  custodyBatch,
  errorText,
  money,
  oneInstruction,
  who,
} from './efectivo'

const props = defineProps({
  // 'salir' (leave for the bank) or 'ficha' (the slip, or the trip that came back)
  stage: { type: String, default: 'salir' },
  // [{name, seal, amount?}]: the trip's bags; amounts only for who sees them
  bags: { type: Array, required: true },
  // the safe entry from Efectivo's read: {safe, title, currency, store?, pos_profile?}
  safe: { type: Object, required: true },
  bank: { type: String, default: '' },
  // the trip's reason chip in step 1: {reason, days, over}
  reason: { type: Object, default: null },
  // step 2: who left with it and when
  by: { type: String, default: '' },
  at: { type: String, default: '' },
  people: { type: Object, default: () => ({}) },
  me: { type: String, default: '' },
  showsMoney: { type: Boolean, default: false },
  canConfirm: { type: Boolean, default: true },
  // opened from «Regresó sin depositar»
  startReturning: { type: Boolean, default: false },
})
const emit = defineEmits(['done'])

const checked = ref(new Set(props.bags.map((bag) => bag.name)))
const naming = ref(false)
const carrier = ref('')
const reference = ref('')
const why = ref('')
const returning = ref(props.startReturning)
const busy = ref(false)
const problem = ref('')
// One request ID per instruction: a retry after a lost answer reuses it.
const instructions = {
  dispatch: oneInstruction(),
  confirm_bank: oneInstruction(),
  return_bank: oneInstruction(),
}

watch(
  () => props.bags.map((bag) => bag.name).join(','),
  () => (checked.value = new Set(props.bags.map((bag) => bag.name))),
)

const picked = computed(() =>
  props.bags.filter((bag) => checked.value.has(bag.name)),
)
const figure = computed(() =>
  props.showsMoney
    ? money(
        picked.value.reduce((sum, bag) => sum + (Number(bag.amount) || 0), 0),
        props.safe.currency,
      )
    : bagsWord(picked.value.length),
)
const bankName = computed(() => props.bank || 'el banco')
const meName = computed(() => who(props.me, props.people).split(' ')[0] || 'tú')
const carrierName = computed(() => who(props.by, props.people) || 'Quien salió')
const chip = computed(() => {
  if (props.stage === 'salir' && props.reason) {
    const { reason: why, days, over } = props.reason
    if ((why === 'amount' || why === 'both') && over && props.showsMoney)
      return {
        icon: 'lucide-landmark',
        label: `Más de ${money(over, props.safe.currency)}`,
      }
    if (days)
      return {
        icon: 'lucide-hourglass',
        label: days === 1 ? '1 día' : `${days} días`,
      }
    return null
  }
  if (props.stage !== 'salir' && props.at)
    return { icon: 'lucide-clock', label: formatDateTime(props.at) }
  return null
})
const referenceError = computed(() =>
  reference.value.trim().length > 140 ? 'Hasta 140 caracteres' : '',
)
const ready = computed(() => {
  if (busy.value || !picked.value.length) return false
  if (props.stage === 'salir') return true
  if (returning.value) return why.value.trim().length >= 8
  const folio = reference.value.trim()
  return folio.length >= 1 && folio.length <= 140
})
const mainLabel = computed(() =>
  props.stage === 'salir'
    ? 'Salgo al banco'
    : returning.value
      ? 'Regresa a la caja fuerte'
      : 'Registrar depósito',
)

function toggle(name) {
  const next = new Set(checked.value)
  if (next.has(name)) {
    if (next.size === 1) return
    next.delete(name)
  } else next.add(name)
  checked.value = next
}

async function go() {
  if (!ready.value) return
  const bags = picked.value.map((bag) => bag.name)
  const [action, payload, toast] =
    props.stage === 'salir'
      ? [
          'dispatch',
          {
            bags,
            carrier: naming.value
              ? carrier.value.trim() || undefined
              : undefined,
          },
          `${bagsWord(bags.length)} en camino al banco`,
        ]
      : returning.value
        ? [
            'return_bank',
            { bags, note: why.value.trim() },
            'De vuelta en la caja fuerte',
          ]
        : [
            'confirm_bank',
            { bags, reference: reference.value.trim() },
            'Depósito registrado',
          ]
  busy.value = true
  problem.value = ''
  try {
    const result = await instructions[action].send((id) =>
      custodyBatch(action, props.safe, payload, id),
    )
    emit('done', { ...result, toast })
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = false
  }
}
</script>
