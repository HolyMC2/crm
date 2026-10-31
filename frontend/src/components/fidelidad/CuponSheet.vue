<template>
  <!-- «Regalar cupón»: for one customer (a one-use coupon in their name) or
       for everyone (a public code for a post or a flyer). Pick the promotion
       with a tap, press once, then copy or share the code. -->
  <BottomSheet
    :open="open"
    :title="done ? __('Coupon ready') : __('Give a coupon')"
    :dismissible="!saving"
    @update:open="(v) => !v && close()"
  >
    <div v-if="done" class="space-y-4" data-testid="cupon-listo">
      <div class="rounded-7 bg-surface-gray-2 p-4 text-center">
        <p class="text-sm text-ink-gray-6">{{ done.offer }}</p>
        <p
          class="num mt-1 select-all break-all text-3xl font-semibold tracking-wide text-ink-gray-9"
          data-testid="cupon-codigo"
        >
          {{ done.coupon.code }}
        </p>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{
            done.coupon.personal
              ? __('One use, only for {0}', [done.coupon.customer_name])
              : couponUses(done.coupon)
          }}<template v-if="done.coupon.valid_upto">
            · {{ __('until {0}', [formatDate(done.coupon.valid_upto)]) }}</template
          >
        </p>
      </div>
    </div>
    <div
      v-else-if="denied"
      class="py-4 text-base text-ink-gray-7"
      role="note"
      data-testid="cupon-denied"
    >
      {{ denied }}
    </div>
    <div v-else-if="loading" class="space-y-3" role="status">
      <div
        v-for="n in 3"
        :key="n"
        class="h-12 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <div v-else class="space-y-5" data-testid="fidelidad-cupon-sheet">
      <Segmented
        v-if="!customer"
        v-model="mode"
        :label="__('Who gets it')"
        :options="modeOptions"
      />
      <BuscarRegistro
        v-if="mode === 'customer'"
        v-model="pickedCustomer"
        doctype="Customer"
        :filters="{ disabled: 0 }"
        :label="__('Customer')"
        :placeholder="__('Search a customer')"
        icon="lucide-user-round"
        :locked="!!customer"
        :eager="false"
        testid="cupon-cliente"
      />
      <section v-if="offers.length" :aria-label="__('Promotion')">
        <ChipGroup
          v-model="offer"
          :label="__('Promotion')"
          :options="offerOptions"
          :clear-value="offer"
          :max="6"
          testid="cupon-promo"
        />
      </section>
      <div
        v-else
        class="rounded-6 bg-surface-gray-2 p-4 text-sm text-ink-gray-7"
        data-testid="cupon-sin-promos"
      >
        <p>{{ __('No promotion with coupons is running.') }}</p>
        <button
          v-if="canCreate"
          type="button"
          class="press mt-2 font-medium text-ink-gray-9 underline"
          @click="emit('new-promo')"
        >
          {{ __('Start one with a coupon') }}
        </button>
      </div>
      <template v-if="mode === 'public' && offer">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-ink-gray-6">{{
            __('Code')
          }}</span>
          <input
            v-model="code"
            autocapitalize="characters"
            autocomplete="off"
            maxlength="20"
            class="num min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-lg uppercase tracking-wide"
            data-testid="cupon-codigo-input"
          />
        </label>
        <ChipGroup
          v-model="uses"
          :label="__('How many times can it be used?')"
          :options="useOptions"
          :clear-value="0"
          testid="cupon-usos"
        />
      </template>
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <template v-if="done">
        <button
          v-if="canShare"
          type="button"
          :class="BTN.tonal"
          class="press"
          data-testid="cupon-compartir"
          @click="share"
        >
          <span class="lucide-share-2 size-4" aria-hidden="true" />
          {{ __('Share') }}
        </button>
        <button
          type="button"
          :class="BTN.filled"
          class="press"
          data-testid="cupon-copiar"
          @click="copy"
        >
          <span class="lucide-copy size-4" aria-hidden="true" />
          {{ __('Copy code') }}
        </button>
      </template>
      <template v-else-if="!denied && !loading && offers.length">
        <p v-if="missing && touched" class="text-sm text-ink-gray-6">
          {{ missing }}
        </p>
        <button
          type="button"
          :class="BTN.filled"
          class="press"
          :disabled="saving"
          data-testid="cupon-dar"
          @click="give"
        >
          <span
            :class="saving ? 'lucide-loader-circle animate-spin' : 'lucide-ticket'"
            class="size-4"
            aria-hidden="true"
          />
          {{ mode === 'public' ? __('Create code') : __('Give coupon') }}
        </button>
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, Segmented } from '@/components/ui'
import { BTN, copyText } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { formatDate } from '@/utils/display'
import { stableRequest } from '@/utils/contactos'
import BuscarRegistro from './BuscarRegistro.vue'
import {
  couponMessage,
  couponUses,
  fidelidadApi,
  offerSummary,
  suggestCode,
} from '@/composables/fidelidad'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** `{ name, title }`: the customer it is for (from their deal); locks the field. */
  customer: { type: Object, default: null },
  /** The promotion to preselect. */
  offerName: { type: String, default: '' },
  /** The board, when the caller already has it (Fidelidad); else read here. */
  board: { type: Object, default: null },
  company: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'given', 'new-promo'])

const own = ref(null)
const loading = ref(false)
const mode = ref('customer')
const pickedCustomer = ref(null)
const offer = ref('')
const code = ref('')
const uses = ref(0)
const saving = ref(false)
const error = ref('')
const touched = ref(false)
const done = ref(null)
let pending = null

const data = computed(() => props.board || own.value)
const caps = computed(() => data.value?.capabilities || {})
const denied = computed(() =>
  data.value && !caps.value.issue_coupon
    ? caps.value.denied?.issue_coupon || __('You cannot give coupons.')
    : '',
)
const canCreate = computed(() => !!caps.value.create_offer)
const offers = computed(() =>
  (data.value?.offers || []).filter(
    (o) => o.coupon_based && (o.state === 'live' || o.state === 'scheduled'),
  ),
)
const currency = computed(() => data.value?.currency || 'MXN')
const offerOptions = computed(() =>
  offers.value.map((o) => ({
    value: o.name,
    label: o.title,
    title: offerSummary(o, currency.value),
  })),
)
const chosen = computed(() => offers.value.find((o) => o.name === offer.value))
const modeOptions = computed(() => [
  { value: 'customer', label: __('One customer') },
  { value: 'public', label: __('Everyone') },
])
const useOptions = computed(() => [
  { value: 0, label: __('No limit') },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
])
const missing = computed(() => {
  if (mode.value === 'customer' && !pickedCustomer.value)
    return __('Choose the customer.')
  if (!offer.value) return __('Choose the promotion.')
  if (mode.value === 'public' && code.value.replace(/[^a-z0-9]/gi, '').length < 4)
    return __('Write a code of at least 4 letters or numbers.')
  return ''
})
const canShare = typeof navigator !== 'undefined' && !!navigator.share

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    done.value = null
    error.value = ''
    touched.value = false
    pending = null
    mode.value = 'customer'
    pickedCustomer.value = props.customer
    offer.value = props.offerName
    uses.value = 0
    if (!props.board) await load()
    if (!offer.value && offers.value.length === 1)
      offer.value = offers.value[0].name
  },
  { immediate: true },
)
watch([offer, mode], () => {
  if (mode.value === 'public') code.value = suggestCode(chosen.value?.title)
})

async function load() {
  loading.value = true
  try {
    own.value = await fidelidadApi('get_board', { company: props.company })
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    loading.value = false
  }
}

function close() {
  if (!saving.value) emit('update:open', false)
}

async function give() {
  touched.value = true
  if (missing.value) return
  const isPublic = mode.value === 'public'
  const payload = isPublic
    ? { offer: offer.value, code: code.value, maximum_use: uses.value }
    : { offer: offer.value, customer: pickedCustomer.value.name }
  pending = stableRequest(pending, { isPublic, ...payload })
  saving.value = true
  error.value = ''
  try {
    done.value = await fidelidadApi(isPublic ? 'create_code' : 'issue_coupon', {
      data: payload,
      request_id: pending.id,
    })
    emit('given', done.value)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}

async function copy() {
  const text = done.value?.coupon?.code
  if (text && (await copyText(text))) toast.success(__('Copied: {0}', [text]))
}

async function share() {
  const text = couponMessage(done.value?.coupon, done.value?.offer)
  try {
    await navigator.share({ text })
  } catch {
    // dismissed: the code is still on screen to copy
  }
}
</script>
