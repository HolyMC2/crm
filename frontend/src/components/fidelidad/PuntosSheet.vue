<template>
  <!-- «Ajustar puntos» (Encargado): the customer, add or take away with a
       tap, why with a tap, save. Clientes frecuentes books the entry; the
       customer's history keeps the reason. -->
  <BottomSheet
    :open="open"
    :title="__('Adjust points')"
    :dismissible="!saving"
    @update:open="(v) => !v && close()"
  >
    <div data-testid="fidelidad-puntos-sheet" class="space-y-5">
      <BuscarRegistro
        v-model="picked"
        doctype="Customer"
        :filters="memberFilter"
        :label="__('Member')"
        :placeholder="__('Search a member')"
        icon="lucide-user-round"
        :locked="!!customer"
        :eager="false"
        testid="puntos-cliente"
      />
      <p
        v-if="balance !== null"
        class="text-sm text-ink-gray-6"
        data-testid="puntos-saldo"
      >
        {{ __('Has {0} points now.', [balance]) }}
      </p>
      <section :aria-label="__('Points')">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-ink-gray-6">{{ __('Points') }}</p>
          <Segmented
            v-model="sign"
            class="w-48"
            :label="__('Add or take away')"
            :options="signOptions"
          />
        </div>
        <ChipGroup
          v-model="amount"
          :options="amountOptions"
          :clear-value="0"
          testid="puntos-cantidad"
        />
        <label class="mt-2 flex items-center gap-2 text-sm text-ink-gray-7">
          {{ __('Other') }}
          <input
            v-model.number="amount"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            class="min-h-11 w-28 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base tabular-nums"
            data-testid="puntos-otro"
          />
        </label>
      </section>
      <ChipGroup
        v-model="reason"
        :label="__('Why?')"
        :options="reasonOptions"
        :clear-value="''"
        testid="puntos-motivo"
      />
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <p v-if="missing && touched" class="text-sm text-ink-gray-6">
        {{ missing }}
      </p>
      <button
        type="button"
        :class="BTN.filled"
        class="press"
        :disabled="saving"
        data-testid="puntos-guardar"
        @click="save"
      >
        <span
          :class="saving ? 'lucide-loader-circle animate-spin' : 'lucide-coins'"
          class="size-4"
          aria-hidden="true"
        />
        {{
          sign === 'add'
            ? __('Add {0} points', [Number(amount) || 0])
            : __('Take away {0} points', [Number(amount) || 0])
        }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { call, toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, Segmented } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { stableRequest } from '@/utils/contactos'
import BuscarRegistro from './BuscarRegistro.vue'
import {
  ADJUST_POINTS,
  POINT_CHIPS,
  REASON_CHIPS,
} from '@/composables/fidelidad'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** `{ name, title, points? }`: the member it is for; locks the field. */
  customer: { type: Object, default: null },
  company: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'adjusted'])

const picked = ref(null)
const sign = ref('add')
const amount = ref(0)
const reason = ref('')
const saving = ref(false)
const error = ref('')
const touched = ref(false)
let pending = null

const memberFilter = { disabled: 0, loyalty_program: ['is', 'set'] }
const signOptions = computed(() => [
  { value: 'add', label: __('Add') },
  { value: 'take', label: __('Take away') },
])
const amountOptions = POINT_CHIPS.map((v) => ({ value: v, label: String(v) }))
const reasonOptions = computed(() =>
  REASON_CHIPS.map((r) => ({ value: __(r), label: __(r) })),
)
const balance = computed(() =>
  picked.value && typeof picked.value.points === 'number'
    ? picked.value.points
    : null,
)
const missing = computed(() => {
  if (!picked.value) return __('Choose the member.')
  if (!(Number(amount.value) > 0)) return __('Choose how many points.')
  if (
    sign.value === 'take' &&
    balance.value !== null &&
    amount.value > balance.value
  )
    return __('They have {0} points; you can take away at most that many.', [
      balance.value,
    ])
  if (!reason.value) return __('Choose why.')
  return ''
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    picked.value = props.customer
    sign.value = 'add'
    amount.value = 0
    reason.value = ''
    error.value = ''
    touched.value = false
    pending = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:open', false)
}

async function save() {
  touched.value = true
  if (missing.value) return
  const points = (sign.value === 'take' ? -1 : 1) * Math.round(amount.value)
  const payload = {
    customer: picked.value.name,
    company: props.company || undefined,
    points,
    reason: reason.value,
  }
  pending = stableRequest(pending, payload)
  saving.value = true
  error.value = ''
  try {
    const out = await call(ADJUST_POINTS, {
      ...payload,
      request_id: pending.id,
    })
    toast.success(
      points > 0
        ? __('{0} points added to {1}', [points, picked.value.title])
        : __('{0} points taken from {1}', [-points, picked.value.title]),
    )
    emit('adjusted', { customer: picked.value.name, loyalty: out?.loyalty })
    emit('update:open', false)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}
</script>
