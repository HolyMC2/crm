<template>
  <!-- One challenge, new or edited: what counts (purchases, a stamp card, or
       what they spend), the goal, from and until when, and what completing it
       gives (a coupon of one of the shop's coupon promotions, or bonus points).
       An existing one also shows its state and the three things done to it.
       «Cancelar» and one filled «Guardar reto». -->
  <BottomSheet
    :open="open"
    :title="
      draft.name
        ? row?.title || __('Challenge', null, CTX)
        : __('New challenge', null, CTX)
    "
    :subtitle="draft.name ? subtitle : ''"
    :dismissible="!saving && !dirty"
    @update:open="(v) => !v && close()"
  >
    <div data-testid="reto-sheet" class="space-y-5">
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
            data-testid="reto-reanudar"
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
            data-testid="reto-pausar"
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
            data-testid="reto-terminar"
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
            data-testid="reto-visible"
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
        <p v-if="awarded" class="text-sm text-ink-gray-6">{{ awarded }}</p>
      </section>

      <p v-if="!canEdit" class="text-sm text-ink-gray-6" role="note">
        {{ __('A sales manager can change challenges.', null, CTX) }}
      </p>

      <fieldset :disabled="!canEdit || saving" class="space-y-5">
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('Name your customers read', null, CTX)
          }}</span>
          <input
            v-model="draft.title"
            type="text"
            maxlength="140"
            :placeholder="
              __('For example, Your third case is on us', null, CTX)
            "
            class="min-h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:min-h-10"
            data-testid="reto-titulo"
          />
        </label>

        <section :aria-label="__('What counts?', null, CTX)">
          <p class="mb-1.5 text-sm text-ink-gray-7">
            {{ __('What counts?', null, CTX) }}
          </p>
          <Segmented
            v-model="draft.kind"
            :label="__('What counts?', null, CTX)"
            :options="kindOptions"
          />
          <p class="mt-1.5 text-sm text-ink-gray-6">
            {{
              draft.kind === 'spend'
                ? __('What they spend adds up toward the goal.', null, CTX)
                : __('Each purchase is a stamp on their card.', null, CTX)
            }}
          </p>
        </section>

        <section :aria-label="__('Goal', null, CTX)">
          <ChipGroup
            v-model="draft.target"
            :label="__('Goal', null, CTX)"
            :options="targetOptions"
            :clear-value="draft.target"
            testid="reto-meta"
          />
          <label class="mt-2 flex items-center gap-2 text-sm text-ink-gray-7">
            {{ __('Other', null, CTX) }}
            <input
              v-model.number="draft.target"
              type="number"
              :inputmode="draft.kind === 'spend' ? 'decimal' : 'numeric'"
              min="1"
              :step="draft.kind === 'spend' ? 'any' : '1'"
              class="min-h-11 w-28 rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9"
              data-testid="reto-meta-otra"
            />
            <span>{{
              draft.kind === 'spend' ? currency : __('purchases', null, CTX)
            }}</span>
          </label>
        </section>

        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('A ticket counts from (optional)', null, CTX)
          }}</span>
          <input
            v-model.number="draft.min_ticket"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            class="min-h-11 w-40 rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9"
            data-testid="reto-minimo"
          />
        </label>
        <BuscarRegistro
          v-model="draft.item_group"
          doctype="Item Group"
          :filters="{}"
          :label="__('Only in this category (optional)', null, CTX)"
          :placeholder="__('Search a category', null, CTX)"
          icon="lucide-folder"
          testid="reto-categoria"
        />

        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('Purchases count from', null, CTX)
          }}</span>
          <input
            v-model="draft.valid_from"
            type="date"
            class="min-h-11 w-48 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="reto-desde"
          />
        </label>
        <ChipGroup
          v-model="draft.valid_upto"
          :label="__('Until when?', null, CTX)"
          :options="untilOptions"
          :clear-value="''"
          testid="reto-hasta"
        />

        <section :aria-label="__('What do they win?', null, CTX)">
          <p class="mb-1.5 text-sm text-ink-gray-7">
            {{ __('What do they win?', null, CTX) }}
          </p>
          <Segmented
            v-model="draft.reward_kind"
            :label="__('What do they win?', null, CTX)"
            :options="rewardOptions"
          />
          <div v-if="draft.reward_kind === 'coupon'" class="mt-3 space-y-2">
            <ChipGroup
              v-if="offerOptions.length"
              v-model="draft.reward_offer"
              :label="__('Coupon promotion', null, CTX)"
              :options="offerOptions"
              :clear-value="''"
              testid="reto-promocion"
            />
            <div
              v-else
              class="rounded-6 bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
              role="note"
            >
              <p>
                {{
                  __(
                    'You have no promotion that works with a coupon yet.',
                    null,
                    CTX,
                  )
                }}
              </p>
              <button
                type="button"
                class="press mt-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink-gray-9 underline underline-offset-2"
                data-testid="reto-nueva-promo"
                @click="emit('new-promo')"
              >
                {{ __('Create a coupon promotion', null, CTX) }}
              </button>
            </div>
            <label class="flex items-center gap-2 text-sm text-ink-gray-7">
              {{ __('The coupon lasts', null, CTX) }}
              <input
                v-model.number="draft.coupon_valid_days"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                class="min-h-11 w-20 rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9"
              />
              {{ __('days', null, CTX) }}
            </label>
          </div>
          <div v-else class="mt-3">
            <ChipGroup
              v-model="draft.reward_points"
              :label="__('Bonus points', null, CTX)"
              :options="bonusOptions"
              :clear-value="draft.reward_points"
              testid="reto-puntos"
            />
          </div>
        </section>
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('What they win, in their words (optional)', null, CTX)
          }}</span>
          <input
            v-model="draft.reward_text"
            type="text"
            maxlength="140"
            :placeholder="__('For example, A free coffee', null, CTX)"
            class="min-h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:min-h-10"
          />
        </label>
        <div v-if="!draft.name" class="flex min-h-12 items-center gap-3">
          <label for="reto-activo" class="flex-1 text-base text-ink-gray-9">{{
            __('Purchases count from now on', null, CTX)
          }}</label>
          <AjustesSwitch
            id="reto-activo"
            v-model="draft.enabled"
            :label="__('Purchases count from now on', null, CTX)"
          />
        </div>
      </fieldset>

      <p
        v-if="preview"
        class="rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-9"
        data-testid="reto-preview"
      >
        {{ preview }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Customers with an account in your app take part. Their purchases at the register and online count by themselves; completing it gives the reward once.',
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
        data-testid="reto-falta"
      >
        {{ missing }}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :class="BTN.tonal"
          class="press flex-1"
          :disabled="saving"
          data-testid="reto-cancelar"
          @click="cancel"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="button"
          :class="BTN.filled"
          class="press flex-1"
          :disabled="saving"
          data-testid="reto-guardar"
          @click="save"
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Save challenge', null, CTX) }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, Segmented, StatusChip } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import BuscarRegistro from '@/components/fidelidad/BuscarRegistro.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { formatDate, formatMoney } from '@/utils/display'
import { stableRequest } from '@/utils/contactos'
import {
  BONUS_CHIPS,
  CTX,
  PURCHASE_CHIPS,
  SPEND_CHIPS,
  awardedLine,
  challengeDraft,
  challengeMissing,
  challengePayload,
  challengePreview,
  endChips,
  premiosApi,
  stateChip,
  whenLine,
} from '@/components/fidelidad/premios/view'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The board's row (null: a new challenge). */
  challenge: { type: Object, default: null },
  /** The company's coupon promotions a challenge can give ({name, title}). */
  offers: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  company: { type: String, default: '' },
  canEdit: { type: Boolean, default: false },
  /** Opening again after «Create a coupon promotion»: the answers stay. */
  resume: { type: Boolean, default: false },
  /** The coupon promotion just made for it, chosen on that reopening ('' = none). */
  pickOffer: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'saved', 'changed', 'new-promo'])

const draft = reactive(challengeDraft(null))
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
  () => [props.open, props.challenge?.name],
  ([open]) => {
    if (!open) return
    if (props.resume) {
      if (props.pickOffer) {
        draft.reward_kind = 'coupon'
        draft.reward_offer = props.pickOffer
      }
      return
    }
    row.value = props.challenge
    Object.assign(draft, challengeDraft(props.challenge))
    initial = JSON.stringify(draft)
    error.value = ''
    touched.value = false
    confirmEnd.value = false
    pending = null
  },
  { immediate: true },
)
// a new kind starts from its usual goal
watch(
  () => draft.kind,
  (kind, before) => {
    if (!before || kind === before || draft.name) return
    draft.target = kind === 'spend' ? SPEND_CHIPS[1] : PURCHASE_CHIPS[0]
  },
)

const dirty = computed(() => JSON.stringify(draft) !== initial)
const chip = computed(() => stateChip(row.value))
const subtitle = computed(() => (row.value ? whenLine(row.value) : ''))
const awarded = computed(() => (row.value ? awardedLine(row.value) : ''))
const kindOptions = computed(() => [
  { value: 'purchases', label: __('Purchases', null, CTX) },
  { value: 'spend', label: __('What they spend', null, CTX) },
])
const rewardOptions = computed(() => [
  { value: 'coupon', label: __('A coupon', null, CTX) },
  { value: 'points', label: __('Bonus points', null, CTX) },
])
const targetOptions = computed(() =>
  draft.kind === 'spend'
    ? SPEND_CHIPS.map((value) => ({
        value,
        label: formatMoney(value, props.currency, { decimals: 0 }),
      }))
    : PURCHASE_CHIPS.map((value) => ({
        value,
        label: __('{0} purchases', [value], CTX),
      })),
)
const bonusOptions = computed(() =>
  BONUS_CHIPS.map((value) => ({
    value,
    label: __('+{0} points', [value], CTX),
  })),
)
const offerOptions = computed(() =>
  props.offers.map((o) => ({ value: o.name, label: o.title || o.name })),
)
const untilOptions = computed(() => {
  const chips = endChips()
  if (draft.valid_upto && !chips.some((c) => c.value === draft.valid_upto))
    chips.push({
      value: draft.valid_upto,
      label: formatDate(draft.valid_upto, { relative: false }),
    })
  return chips
})
const preview = computed(() =>
  challengePreview(draft, props.currency, props.offers),
)
const missing = computed(() => challengeMissing(draft))

function close() {
  if (!saving.value) emit('update:open', false)
}
function cancel() {
  Object.assign(draft, challengeDraft(props.challenge))
  close()
}

async function save() {
  touched.value = true
  if (missing.value) return
  const payload = challengePayload(draft, props.company)
  pending = stableRequest(pending, payload)
  saving.value = true
  error.value = ''
  try {
    const saved = await premiosApi('save_challenge', {
      data: payload,
      request_id: draft.name ? undefined : pending.id,
    })
    toast.success(
      draft.name
        ? __('Challenge saved: {0}', [saved.title], CTX)
        : __('Challenge ready: {0}', [saved.title], CTX),
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
    row.value = await premiosApi('change_challenge', {
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
