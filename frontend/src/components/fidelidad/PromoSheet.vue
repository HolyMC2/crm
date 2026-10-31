<template>
  <!-- «Nueva promoción»: four questions answered with taps (what, how much,
       until when, how it reaches the ticket), the sentence read back, one
       button. The register applies it from its next sale. -->
  <BottomSheet
    :open="open"
    :title="__('New promotion')"
    :dismissible="!saving"
    @update:open="(v) => !v && close()"
  >
    <div data-testid="fidelidad-promo-sheet" class="space-y-5">
      <ChipGroup
        v-model="draft.target"
        :label="__('On what?')"
        :options="targetOptions"
        :clear-value="draft.target"
        testid="promo-target"
      />
      <BuscarRegistro
        v-if="draft.target === 'item_group'"
        v-model="draft.pick"
        doctype="Item Group"
        :filters="{ is_group: 0 }"
        :label="__('Category')"
        :placeholder="__('Search a category')"
        icon="lucide-folder"
        testid="promo-categoria"
      />
      <BuscarRegistro
        v-else-if="draft.target === 'item'"
        v-model="draft.pick"
        doctype="Item"
        :filters="{ disabled: 0, is_sales_item: 1 }"
        :label="__('Product')"
        :placeholder="__('Search a product')"
        icon="lucide-package"
        :eager="false"
        testid="promo-producto"
      />
      <ChipGroup
        v-else
        v-model="draft.minimum"
        :label="__('From a ticket of')"
        :options="minimumOptions"
        :clear-value="0"
        testid="promo-minimo"
      />

      <section :aria-label="__('How much off?')">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-ink-gray-6">
            {{ __('How much off?') }}
          </p>
          <Segmented
            v-model="draft.kind"
            class="w-40"
            :label="__('Discount type')"
            :options="kindOptions"
          />
        </div>
        <ChipGroup
          v-model="draft.value"
          :options="valueOptions"
          :clear-value="0"
          testid="promo-valor"
        />
        <label class="mt-2 flex items-center gap-2 text-sm text-ink-gray-7">
          {{ __('Other') }}
          <input
            v-model.number="draft.value"
            type="number"
            inputmode="decimal"
            min="0"
            :max="draft.kind === 'percent' ? 100 : undefined"
            class="min-h-11 w-28 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base tabular-nums"
            data-testid="promo-valor-otro"
          />
          <span>{{ draft.kind === 'percent' ? '%' : currency }}</span>
        </label>
      </section>

      <ChipGroup
        v-model="draft.until"
        :label="__('Until when?')"
        :options="untilOptions"
        :clear-value="''"
        testid="promo-hasta"
      />

      <section :aria-label="__('How does it reach the ticket?')">
        <p class="mb-1.5 text-xs font-medium text-ink-gray-6">
          {{ __('How does it reach the ticket?') }}
        </p>
        <Segmented
          v-model="draft.how"
          :label="__('How does it reach the ticket?')"
          :options="howOptions"
        />
        <p class="mt-1.5 text-sm text-ink-gray-6">
          {{
            draft.how === 'coupon'
              ? __('Only customers with a coupon or the code get it.')
              : __('Every sale that qualifies gets it, no code needed.')
          }}
        </p>
      </section>

      <p
        v-if="preview"
        class="rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-9"
        data-testid="promo-preview"
      >
        {{ preview }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <p
        v-if="missing && touched"
        class="text-sm text-ink-gray-6"
        data-testid="promo-missing"
      >
        {{ missing }}
      </p>
      <button
        type="button"
        :class="BTN.filled"
        class="press"
        :disabled="saving"
        data-testid="promo-iniciar"
        @click="start"
      >
        <span
          :class="saving ? 'lucide-loader-circle animate-spin' : 'lucide-play'"
          class="size-4"
          aria-hidden="true"
        />
        {{ __('Start promotion') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, Segmented } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { formatMoney } from '@/utils/display'
import { stableRequest } from '@/utils/contactos'
import BuscarRegistro from './BuscarRegistro.vue'
import {
  AMOUNT_CHIPS,
  MINIMUM_CHIPS,
  PERCENT_CHIPS,
  fidelidadApi,
  offerMissing,
  offerPayload,
  offerPreview,
  untilChips,
} from '@/composables/fidelidad'

const props = defineProps({
  open: { type: Boolean, default: false },
  currency: { type: String, default: 'MXN' },
  company: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'created'])

const blank = () => ({
  target: 'item_group',
  pick: null,
  kind: 'percent',
  value: 10,
  minimum: 0,
  until: '',
  how: 'auto',
  title: '',
})
const draft = reactive(blank())
const saving = ref(false)
const error = ref('')
const touched = ref(false)
let pending = null

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(draft, blank())
    error.value = ''
    touched.value = false
    pending = null
  },
)
watch(
  () => draft.target,
  () => (draft.pick = null),
)
watch(
  () => draft.kind,
  (kind) => (draft.value = kind === 'percent' ? 10 : 100),
)

const targetOptions = computed(() => [
  { value: 'item_group', label: __('A category') },
  { value: 'item', label: __('A product') },
  { value: 'ticket', label: __('The whole ticket') },
])
const kindOptions = [
  { value: 'percent', label: '%' },
  { value: 'amount', label: '$' },
]
const valueOptions = computed(() =>
  draft.kind === 'percent'
    ? PERCENT_CHIPS.map((v) => ({ value: v, label: `${v} %` }))
    : AMOUNT_CHIPS.map((v) => ({
        value: v,
        label: formatMoney(v, props.currency, { decimals: 0 }),
      })),
)
const minimumOptions = computed(() =>
  MINIMUM_CHIPS.map((v) => ({
    value: v,
    label: v
      ? formatMoney(v, props.currency, { decimals: 0 })
      : __('Any amount'),
  })),
)
const untilOptions = computed(() => untilChips())
const howOptions = computed(() => [
  { value: 'auto', label: __('By itself') },
  { value: 'coupon', label: __('With a coupon') },
])
const preview = computed(() => offerPreview(draft, props.currency))
const missing = computed(() => offerMissing(draft))

function close() {
  if (!saving.value) emit('update:open', false)
}

async function start() {
  touched.value = true
  if (missing.value) return
  const payload = { ...offerPayload(draft), company: props.company }
  // The same answers retried keep their request id: the server replays them.
  pending = stableRequest(pending, payload)
  saving.value = true
  error.value = ''
  try {
    const offer = await fidelidadApi('create_offer', {
      data: payload,
      request_id: pending.id,
    })
    toast.success(__('Promotion started: {0}', [offer.title]))
    emit('created', offer)
    emit('update:open', false)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}
</script>
