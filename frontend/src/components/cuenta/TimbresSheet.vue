<template>
  <!-- One CFDI stamp package change, or turning CFDI on: the packages Boat's
       catalog sells (stamps a month, monthly price, price per stamp, the one
       held marked), Boat's quote for the one chosen read back (today's charge
       and on which invoice, the monthly price from then, when the stamps
       change), what a stamp beyond the package costs and the rules, the
       consent the button gives, and one button named after what it does. -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="timbres-cambio">
      <p
        v-if="loading"
        class="text-base text-ink-gray-6"
        role="status"
        data-testid="timbres-cargando"
      >
        {{ __('Checking your stamps…', null, 'Cuenta') }}
      </p>
      <template v-else-if="answer">
        <p
          v-if="answer.state !== 'off' && answer.package_qty"
          class="text-base text-ink-gray-8"
          data-testid="timbres-uso"
        >
          {{
            __(
              '{0} of {1} stamps this month',
              [stamps(answer.used), stamps(answer.included)],
              'Cuenta',
            )
          }}
        </p>
        <fieldset class="space-y-2" data-testid="timbres-paquetes">
          <legend class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ __('Stamps a month', null, 'Cuenta') }}
          </legend>
          <!-- A package that cannot be chosen reads muted and dashed, with
               Boat's reason below. Name, then the prices on their own line,
               so every row reads the same at 305 px. -->
          <label
            v-for="row in rows"
            :key="row.qty"
            class="flex min-h-12 items-start gap-3 rounded-7 border px-3 py-2.5"
            :class="[
              row.qty === target
                ? 'border-outline-gray-4 bg-surface-gray-2'
                : 'border-outline-gray-2',
              selectable(row) ? 'press' : 'border-dashed',
            ]"
            :data-qty="row.qty"
            :aria-disabled="selectable(row) ? undefined : 'true'"
          >
            <input
              type="radio"
              name="cuenta-timbres-paquete"
              class="mt-1 size-4 flex-none"
              :value="row.qty"
              :checked="row.qty === target"
              :disabled="!selectable(row) || busy"
              @change="choose(row.qty)"
            />
            <span class="min-w-0 flex-1">
              <span
                class="block text-base font-medium"
                :class="selectable(row) ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                >{{ row.label }}</span
              >
              <span
                v-if="row.price"
                class="num block text-sm font-medium"
                :class="selectable(row) ? 'text-ink-gray-8' : 'text-ink-gray-5'"
                data-testid="timbres-precio"
                >{{ row.price }}</span
              >
              <span
                v-if="row.perStamp"
                class="num block text-sm"
                :class="selectable(row) ? 'text-ink-gray-6' : 'text-ink-gray-5'"
                data-testid="timbres-por-timbre"
                >{{ row.perStamp }}</span
              >
              <span
                v-if="row.current"
                class="block text-sm text-ink-gray-6"
                data-testid="timbres-actual"
                >{{ __('Your package', null, 'Cuenta') }}</span
              >
              <span
                v-else-if="!row.available && row.note"
                class="block text-sm text-ink-gray-8"
                >{{ row.note }}</span
              >
            </span>
          </label>
        </fieldset>

        <!-- Boat's answer to the package chosen sits under the packages: the
             charge, a refusal, or a call that did not go through. -->
        <div ref="outcome" class="space-y-4" data-testid="timbres-resultado">
          <div role="status" aria-live="polite" class="space-y-1">
            <p v-if="quoting" class="text-base text-ink-gray-6">
              {{ __('Working out the amount…', null, 'Cuenta') }}
            </p>
            <template v-else-if="view && view.changed">
              <template v-if="view.amount">
                <p
                  class="num title-face text-3xl font-semibold text-ink-gray-9"
                  data-testid="timbres-monto"
                >
                  {{ view.amount }}
                </p>
                <p class="text-sm text-ink-gray-6">{{ view.per }}</p>
              </template>
              <p
                v-else-if="view.nothingToday"
                class="text-base font-medium text-ink-gray-9"
              >
                {{ __('Nothing is charged today.', null, 'Cuenta') }}
              </p>
              <p
                v-for="line in view.lines"
                :key="line"
                class="pt-1 text-base text-ink-gray-8"
                data-testid="timbres-linea"
              >
                {{ line }}
              </p>
              <p v-if="view.message" class="pt-1 text-base text-ink-gray-8">
                {{ view.message }}
              </p>
            </template>
            <p
              v-else-if="view && view.message"
              class="text-base text-ink-gray-8"
            >
              {{ view.message }}
            </p>
          </div>
          <div
            v-if="!quoting && refusal"
            role="alert"
            class="space-y-2"
            data-testid="timbres-negado"
          >
            <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
            <Button
              v-if="refusal.next"
              class="min-h-11"
              :label="refusal.next.label"
              @click="$emit('act', refusal.next.act)"
            />
          </div>
          <div v-if="!quoting && failure" role="alert" class="space-y-2">
            <p class="text-sm text-ink-red-7">{{ failure }}</p>
            <!-- A lost read asks again; a lost confirm goes again with its key. -->
            <Button
              v-if="!quote"
              class="min-h-11"
              :label="__('Try again', null, 'Cuenta')"
              @click="answer ? ask() : load()"
            />
          </div>
        </div>

        <div v-if="terms.extra || terms.rules.length" class="space-y-2">
          <h3 class="text-sm font-semibold text-ink-gray-7">
            {{ __('How stamps are counted', null, 'Cuenta') }}
          </h3>
          <p
            v-if="terms.extra"
            class="text-sm text-ink-gray-8"
            data-testid="timbres-extra"
          >
            {{ terms.extra }}
          </p>
          <ul
            class="space-y-1 text-sm text-ink-gray-7"
            data-testid="timbres-reglas"
          >
            <li v-for="rule in terms.rules" :key="rule" class="flex gap-2">
              <span
                class="lucide-check mt-0.5 size-4 flex-none text-ink-gray-5"
                aria-hidden="true"
              />
              <span class="min-w-0">{{ rule }}</span>
            </li>
          </ul>
        </div>
        <p
          v-if="view && view.consent"
          class="text-sm text-ink-gray-7"
          data-testid="timbres-consentimiento"
        >
          {{ view.consent }}
        </p>
      </template>

      <!-- The packages could not be read: why, and «Volver a intentar». -->
      <template v-if="!answer && !loading">
        <div
          v-if="refusal"
          role="alert"
          class="space-y-2"
          data-testid="timbres-negado"
        >
          <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
          <Button
            v-if="refusal.next"
            class="min-h-11"
            :label="refusal.next.label"
            @click="$emit('act', refusal.next.act)"
          />
        </div>
        <div v-if="failure" role="alert" class="space-y-2">
          <p class="text-sm text-ink-red-7">{{ failure }}</p>
          <Button
            class="min-h-11"
            :label="__('Try again', null, 'Cuenta')"
            @click="load()"
          />
        </div>
      </template>
      <p
        v-if="held"
        id="timbres-cambio-motivo"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        @click="$emit('close')"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="confirmLabel"
        :loading="busy"
        :disabled="!canConfirm"
        aria-describedby="timbres-cambio-motivo"
        data-testid="timbres-confirmar"
        @click="confirm"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { scrollParent } from '@/utils/scrollWithin'
import { mutate, seam } from './api'
import { clientKey, failureText, refusalView, seamOff } from './autoservicio'
import {
  STAMPS_ADDON,
  hasStamps,
  ladderRows,
  quoteFor,
  stamps,
  stampsAction,
  stampsQuoteView,
  stampsTerms,
  stampsTitle,
  startingPackage,
} from './timbres'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
  /** The package to open on (stamps a month), else the one held. */
  wanted: { type: Number, default: null },
  debounceMs: { type: Number, default: 300 },
})
const emit = defineEmits(['close', 'done', 'act', 'off'])

const answer = ref(null)
const loading = ref(false)
const target = ref(null)
const quote = ref(null)
const quoting = ref(false)
const busy = ref(false)
const refusal = ref(null)
const failure = ref('')
const outcome = ref(null)
let key = ''
let turn = 0
let wait = null

const rows = computed(() => ladderRows(answer.value))
const terms = computed(() => stampsTerms(answer.value))
const title = computed(() =>
  answer.value ? stampsTitle(answer.value) : __('CFDI', null, 'Cuenta'),
)
const view = computed(() => stampsQuoteView(quote.value))
// Boat's quote for this very package: one still answering an earlier tap
// never confirms the one on screen.
const action = computed(() =>
  quoteFor(quote.value, target.value) ? stampsAction(quote.value) : null,
)
const held = computed(() => props.door.paymentActionsBlocked() && !busy.value)
const canConfirm = computed(
  () =>
    Boolean(view.value?.changed) &&
    Boolean(action.value) &&
    !quoting.value &&
    !busy.value &&
    !refusal.value &&
    !props.door.paymentActionsBlocked(),
)

// The button names what it does; with nothing to confirm it says what to do
// (the package held, one already scheduled or one Boat refused is on screen,
// and the sentence why sits under the packages, out of a phone's view).
const confirmLabel = computed(() => {
  if (action.value) return action.value.label
  if (loading.value || quoting.value || busy.value)
    return __('Confirm', null, 'Cuenta')
  if (answer.value && target.value === null)
    return __('Choose a package', null, 'Cuenta')
  if (refusal.value || (view.value && !view.value.changed))
    return __('Choose another package', null, 'Cuenta')
  return __('Confirm', null, 'Cuenta')
})

// The one held stays choosable (to cancel a scheduled change or resume it).
const selectable = (row) => row.available || row.current

// A tap or a confirm is answered where the owner can read it: Boat's charge, a
// refusal or a call that did not go through comes into the sheet's view when
// it sits outside it (four packages fill a phone's sheet, and the button
// already names the change). After a tap the answer's first lines rise to the
// sheet's foot, so the package tapped stays in sight; after a confirm, its
// alert does. Only the sheet's own box scrolls, and nothing moves when they
// already show.
const OUTCOME_LINES_PX = 140
async function showOutcome({ alert = false } = {}) {
  await nextTick()
  const el = alert
    ? outcome.value?.querySelector('[role="alert"]')
    : outcome.value
  const box = el ? scrollParent(el) : null
  if (!box) return
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top
  const height = el.offsetHeight || 0
  const bottom = top + (alert ? height : Math.min(height, OUTCOME_LINES_PX))
  if (top >= 0 && bottom <= box.clientHeight) return
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  box.scrollTo({
    top: Math.max(0, box.scrollTop + bottom - box.clientHeight + 16),
    behavior: still ? 'auto' : 'smooth',
  })
}

async function load() {
  const mine = ++turn
  loading.value = true
  refusal.value = null
  failure.value = ''
  quote.value = null
  let out
  try {
    out = await seam('stamp_package_quote', {})
  } catch (error) {
    if (mine !== turn) return
    loading.value = false
    failure.value = failureText(error)
    return
  }
  if (mine !== turn) return
  loading.value = false
  if (hasStamps(out)) {
    answer.value = out
    target.value = startingPackage(out, props.wanted)
    if (target.value !== null) ask()
  } else if (seamOff(out)) emit('off')
  else
    refusal.value = refusalView(
      out,
      __('We could not read your stamps.', null, 'Cuenta'),
    )
}

async function ask({ reveal = false } = {}) {
  const mine = ++turn
  quoting.value = true
  refusal.value = null
  failure.value = ''
  try {
    const out = await seam('stamp_package_quote', {
      package_qty: target.value,
    })
    if (mine !== turn) return
    // A new quote is a new request: its confirm gets its own key.
    key = clientKey()
    quote.value = out?.ok === true ? out : null
    refusal.value = refusalView(out)
  } catch (error) {
    if (mine !== turn) return
    quote.value = null
    failure.value = failureText(error)
  } finally {
    if (mine === turn) quoting.value = false
  }
  if (reveal && mine === turn) showOutcome()
}

function choose(qty) {
  if (busy.value || qty === target.value) return
  target.value = qty
  clearTimeout(wait)
  // A quote already on its way answers the old package: it is dropped.
  turn++
  quoting.value = true
  wait = setTimeout(() => ask({ reveal: true }), props.debounceMs)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    answer.value = null
    load()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(wait))

async function confirm() {
  if (!canConfirm.value) return
  busy.value = true
  failure.value = ''
  try {
    const out = await mutate('toggle_addon', {
      service_key: STAMPS_ADDON,
      action: 'activate',
      package_qty: target.value,
      idempotency_key: key,
    })
    if (out?.ok === false) refusal.value = refusalView(out)
    // The toast repeats the button's verb.
    else emit('done', out, action.value?.done || '')
  } catch (error) {
    // The same key goes again on a retry: Boat answers the first change once.
    failure.value = failureText(error)
  } finally {
    busy.value = false
  }
  if (refusal.value || failure.value) showOutcome({ alert: true })
}
</script>
