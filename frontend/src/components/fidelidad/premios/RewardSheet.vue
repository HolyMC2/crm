<template>
  <!-- One reward, new or edited: the product customers take, what it costs in
       points, how often one customer may take it and until when. An existing
       one also shows its state and the three things done to it (pause or
       resume, end today, show or hide from customers). «Cancelar» and one
       filled «Guardar premio». -->
  <BottomSheet
    :open="open"
    :title="
      draft.name
        ? row?.title || __('Reward', null, CTX)
        : __('New reward', null, CTX)
    "
    :subtitle="draft.name ? subtitle : ''"
    :dismissible="!saving && !dirty"
    @update:open="(v) => !v && close()"
  >
    <div data-testid="premio-sheet" class="space-y-5">
      <section
        v-if="row && draft.name"
        class="space-y-3"
        :aria-label="__('State', null, CTX)"
      >
        <div class="flex flex-wrap items-center gap-2">
          <StatusChip :label="chip.label" :tone="chip.tone" />
          <span v-if="!row.show_to_customers" class="text-sm text-ink-gray-6">{{
            __('Hidden from customers', null, CTX)
          }}</span>
        </div>
        <div v-if="canEdit" class="grid grid-cols-2 gap-2">
          <button
            v-if="row.state === 'paused'"
            type="button"
            :class="BTN.tonal"
            class="press"
            :disabled="busy"
            data-testid="premio-reanudar"
            @click="act('resume')"
          >
            <span class="lucide-play size-4" aria-hidden="true" />
            {{ __('Resume', null, CTX) }}
          </button>
          <button
            v-else-if="row.state !== 'ended'"
            type="button"
            :class="BTN.tonal"
            class="press"
            :disabled="busy"
            data-testid="premio-pausar"
            @click="act('pause')"
          >
            <span class="lucide-pause size-4" aria-hidden="true" />
            {{ __('Pause', null, CTX) }}
          </button>
          <button
            v-if="row.state !== 'ended'"
            type="button"
            :class="confirmEnd ? BTN.danger : BTN.tonal"
            class="press"
            :disabled="busy"
            data-testid="premio-terminar"
            @click="endToday"
          >
            <span class="lucide-square size-4" aria-hidden="true" />
            {{
              confirmEnd
                ? __('Yes, end it', null, CTX)
                : __('End today', null, CTX)
            }}
          </button>
          <button
            type="button"
            :class="BTN.tonal"
            class="press col-span-2"
            :disabled="busy"
            data-testid="premio-visible"
            @click="act(row.show_to_customers ? 'hide' : 'show')"
          >
            <span
              :class="row.show_to_customers ? 'lucide-eye-off' : 'lucide-eye'"
              class="size-4"
              aria-hidden="true"
            />
            {{
              row.show_to_customers
                ? __('Hide from customers', null, CTX)
                : __('Show to customers', null, CTX)
            }}
          </button>
        </div>
        <p v-if="redeemed" class="text-sm text-ink-gray-6">{{ redeemed }}</p>
      </section>

      <p v-if="!canEdit" class="text-sm text-ink-gray-6" role="note">
        {{ __('A sales manager can change rewards.', null, CTX) }}
      </p>

      <fieldset :disabled="!canEdit || saving" class="space-y-5">
        <BuscarRegistro
          v-model="draft.item"
          doctype="Item"
          :filters="{ disabled: 0, is_sales_item: 1 }"
          :label="__('Product they take', null, CTX)"
          :placeholder="__('Search a product', null, CTX)"
          icon="lucide-package"
          :eager="false"
          testid="premio-producto"
        />
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('Name your customers read', null, CTX)
          }}</span>
          <input
            v-model="draft.title"
            type="text"
            maxlength="140"
            :placeholder="
              draft.item?.title || __('For example, Clear case', null, CTX)
            "
            class="min-h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:min-h-10"
            data-testid="premio-titulo"
          />
        </label>

        <section :aria-label="__('Points it costs', null, CTX)">
          <ChipGroup
            v-model="draft.points_cost"
            :label="__('Points it costs', null, CTX)"
            :options="pointOptions"
            :clear-value="draft.points_cost"
            testid="premio-puntos"
          />
          <label class="mt-2 flex items-center gap-2 text-sm text-ink-gray-7">
            {{ __('Other', null, CTX) }}
            <input
              v-model.number="draft.points_cost"
              type="number"
              inputmode="numeric"
              min="1"
              step="1"
              class="min-h-11 w-28 rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9"
              data-testid="premio-puntos-otro"
            />
            <span>{{ __('points', null, CTX) }}</span>
          </label>
          <p v-if="worth" class="mt-1.5 text-sm text-ink-gray-6">{{ worth }}</p>
        </section>

        <ChipGroup
          v-model="draft.max_per_customer"
          :label="__('How often one customer may take it', null, CTX)"
          :options="caps"
          :clear-value="0"
          testid="premio-limite"
        />
        <ChipGroup
          v-model="draft.valid_upto"
          :label="__('Until when?', null, CTX)"
          :options="untilOptions"
          :clear-value="''"
          testid="premio-hasta"
        />
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('A short line under it (optional)', null, CTX)
          }}</span>
          <input
            v-model="draft.stock_note"
            type="text"
            maxlength="140"
            :placeholder="__('For example, While stocks last', null, CTX)"
            class="min-h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:min-h-10"
          />
        </label>
        <div v-if="!draft.name" class="flex min-h-12 items-center gap-3">
          <label for="premio-activo" class="flex-1 text-base text-ink-gray-9">{{
            __('Customers can redeem it now', null, CTX)
          }}</label>
          <AjustesSwitch
            id="premio-activo"
            v-model="draft.enabled"
            :label="__('Customers can redeem it now', null, CTX)"
          />
        </div>
      </fieldset>

      <p
        v-if="preview"
        class="rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-9"
        data-testid="premio-preview"
      >
        {{ preview }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Redeeming gives the customer a code for the register. The points come off when they take the product.',
            null,
            CTX,
          )
        }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template v-if="canEdit" #actions>
      <p
        v-if="missing && touched"
        class="text-sm text-ink-gray-6"
        data-testid="premio-falta"
      >
        {{ missing }}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :class="BTN.tonal"
          class="press flex-1"
          :disabled="saving"
          data-testid="premio-cancelar"
          @click="cancel"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="button"
          :class="BTN.filled"
          class="press flex-1"
          :disabled="saving"
          data-testid="premio-guardar"
          @click="save"
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Save reward', null, CTX) }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, StatusChip } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import BuscarRegistro from '@/components/fidelidad/BuscarRegistro.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { formatDate, formatMoney } from '@/utils/display'
import { stableRequest } from '@/utils/contactos'
import {
  CTX,
  POINT_CHIPS,
  capChips,
  endChips,
  premiosApi,
  redeemedLine,
  rewardDraft,
  rewardMissing,
  rewardPayload,
  rewardPreview,
  pointsText,
  stateChip,
  whenLine,
} from './view'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The board's row (null: a new reward). */
  reward: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
  company: { type: String, default: '' },
  /** What one point is worth (the program's conversion), for «valen $50». */
  pointValue: { type: Number, default: 0 },
  canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'saved', 'changed'])

const draft = reactive(rewardDraft(null))
const row = ref(null)
const saving = ref(false)
const busy = ref(false)
const error = ref('')
const touched = ref(false)
const confirmEnd = ref(false)
let initial = ''
let pending = null
let confirmTimer = 0

watch(
  () => [props.open, props.reward?.name],
  ([open]) => {
    if (!open) return
    row.value = props.reward
    Object.assign(draft, rewardDraft(props.reward))
    initial = JSON.stringify(draft)
    error.value = ''
    touched.value = false
    confirmEnd.value = false
    pending = null
  },
  { immediate: true },
)

const dirty = computed(() => JSON.stringify(draft) !== initial)
const chip = computed(() => stateChip(row.value))
const subtitle = computed(() => (row.value ? whenLine(row.value) : ''))
const redeemed = computed(() => (row.value ? redeemedLine(row.value) : ''))
const pointOptions = computed(() =>
  POINT_CHIPS.map((value) => ({ value, label: pointsText(value) })),
)
const caps = computed(() => capChips())
const untilOptions = computed(() => {
  const chips = endChips()
  if (draft.valid_upto && !chips.some((c) => c.value === draft.valid_upto))
    chips.push({
      value: draft.valid_upto,
      label: formatDate(draft.valid_upto, { relative: false }),
    })
  return chips
})
const worth = computed(() => {
  const value = Number(props.pointValue) * Number(draft.points_cost)
  return value > 0
    ? __(
        'They are worth {0} at the register.',
        [formatMoney(value, props.currency)],
        CTX,
      )
    : ''
})
const preview = computed(() =>
  rewardPreview(draft, props.currency, props.pointValue),
)
const missing = computed(() => rewardMissing(draft))

function close() {
  if (!saving.value) emit('update:open', false)
}
function cancel() {
  Object.assign(draft, rewardDraft(props.reward))
  close()
}

async function save() {
  touched.value = true
  if (missing.value) return
  const payload = rewardPayload(draft, props.company)
  // the same answers retried keep their request id: the server replays them
  pending = stableRequest(pending, payload)
  saving.value = true
  error.value = ''
  try {
    const saved = await premiosApi('save_reward', {
      data: payload,
      request_id: draft.name ? undefined : pending.id,
    })
    toast.success(
      draft.name
        ? __('Reward saved: {0}', [saved.title], CTX)
        : __('Reward ready: {0}', [saved.title], CTX),
    )
    initial = JSON.stringify(draft)
    emit('saved', saved)
    emit('update:open', false)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}

async function act(action) {
  busy.value = true
  error.value = ''
  try {
    row.value = await premiosApi('change_reward', {
      name: row.value.name,
      action,
    })
    emit('changed', row.value)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
    confirmEnd.value = false
  }
}

function endToday() {
  if (!confirmEnd.value) {
    confirmEnd.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmEnd.value = false), 4000)
    return
  }
  act('end')
}
</script>
