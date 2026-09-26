<template>
  <section
    class="min-w-0 space-y-4 rounded border border-outline-gray-2 p-3 text-sm"
    :aria-label="__('Continue sales order')"
    :aria-busy="state.loading || state.busy"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="break-all text-lg font-semibold">{{ salesOrder }}</h3>
      <button
        class="commerce-button"
        :disabled="state.loading || state.busy"
        @click="load"
      >
        {{ __('Refresh order status') }}
      </button>
    </header>
    <p v-if="state.loading" role="status">{{ __('Loading order status…') }}</p>
    <div v-if="state.loadError" role="alert" class="space-y-2">
      <p>{{ state.loadError }}</p>
      <p>
        {{
          __(
            'Order actions are unavailable until its current status can be checked.',
          )
        }}
      </p>
    </div>
    <p v-if="state.storageError" role="alert">{{ state.storageError }}</p>
    <p v-if="state.error" role="alert">{{ state.error }}</p>
    <p v-if="state.notice" role="status">{{ state.notice }}</p>
    <div
      v-if="state.pending"
      role="alert"
      class="space-y-2 rounded border border-outline-gray-3 p-3"
    >
      <p>
        {{
          __(
            'This order action has no confirmed response. Retry the same request to recover its result. Do not start another payment.',
          )
        }}
      </p>
      <button
        class="commerce-button"
        :disabled="state.busy || blocked"
        @click="execute"
      >
        {{ __('Retry the same order action') }}
      </button>
    </div>
    <p v-if="state.context && !state.context.available">
      {{ commerceReason(state.context.reason_code) }}
    </p>
    <template v-if="order">
      <div class="space-y-2">
        <p>{{ order.customer }} · {{ order.company }}</p>
        <dl class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt class="text-ink-gray-6">{{ __('Order status') }}</dt>
            <dd>{{ __(order.status) }}</dd>
          </div>
          <div>
            <dt class="text-ink-gray-6">{{ __('Order total') }}</dt>
            <dd>{{ money(order.total) }}</dd>
          </div>
          <div>
            <dt class="text-ink-gray-6">{{ __('Applied advance') }}</dt>
            <dd>{{ money(order.advance_paid) }}</dd>
          </div>
          <div>
            <dt class="text-ink-gray-6">{{ __('Remaining order balance') }}</dt>
            <dd>{{ money(order.remaining) }}</dd>
          </div>
          <div>
            <dt class="text-ink-gray-6">{{ __('Billing') }}</dt>
            <dd>
              {{ __(order.billing.state) }} · {{ order.billing.percent }}%
            </dd>
          </div>
          <div>
            <dt class="text-ink-gray-6">{{ __('Delivery') }}</dt>
            <dd>
              {{ __(order.delivery.state) }} · {{ order.delivery.percent }}%
            </dd>
          </div>
        </dl>
        <p class="text-xs text-ink-gray-6">
          {{
            __(
              'An order, an invoice, a payment and a delivery have separate states. A payment link does not prove payment or delivery.',
            )
          }}
        </p>
        <a
          v-if="localCommerceUrl(order.sales_order_url)"
          :href="localCommerceUrl(order.sales_order_url)"
          class="commerce-link"
          >{{ __('Open sales order') }}</a
        >
      </div>
      <section class="space-y-2" :aria-label="__('Invoices')">
        <h4 class="font-semibold">{{ __('Invoices') }}</h4>
        <p v-if="!order.billing.invoices.length">
          {{ __('No linked invoices are visible with your permissions.') }}
        </p>
        <ul class="space-y-2">
          <li v-for="invoice in order.billing.invoices" :key="invoice.name">
            <a
              v-if="localCommerceUrl(invoice.invoice_url)"
              :href="localCommerceUrl(invoice.invoice_url)"
              class="commerce-link"
              >{{ invoice.name }}</a
            >
            <span v-else>{{ invoice.name }}</span>
            · {{ documentStatus(invoice.docstatus) }} · {{ __('Outstanding') }}:
            {{ invoice.outstanding_amount }} {{ invoice.currency }}
          </li>
        </ul>
      </section>
      <section
        v-if="handoff"
        class="space-y-2 rounded border border-outline-gray-2 p-3"
        :aria-label="__('Register handoff')"
      >
        <h4 class="font-semibold">
          {{ __('Register handoff') }} · {{ __(handoff.state) }}
        </h4>
        <p>{{ handoff.charge_request }} · {{ handoff.pos_profile }}</p>
        <p v-if="handoff.callback_status">
          {{ __('Order reconciliation') }}: {{ __(handoff.callback_status) }}
        </p>
        <a
          v-if="
            handoff.state === 'Open' &&
            localCommerceUrl(handoff.cashier_url, 'cashier')
          "
          :href="localCommerceUrl(handoff.cashier_url, 'cashier')"
          class="commerce-link"
          >{{ __('Continue in register') }}</a
        >
        <a
          v-if="localCommerceUrl(handoff.invoice_url)"
          :href="localCommerceUrl(handoff.invoice_url)"
          class="commerce-link"
          >{{ __('Open register invoice') }}</a
        >
      </section>
      <section class="space-y-2" :aria-label="__('Payment links')">
        <h4 class="font-semibold">{{ __('Payment links') }}</h4>
        <p v-if="!order.payment_available">
          {{ commerceReason(order.payment_reason_code) }}
        </p>
        <p v-if="!order.payments.length">
          {{ __('No payment link receipts are visible for this order.') }}
        </p>
        <ul class="space-y-3">
          <li
            v-for="payment in order.payments"
            :key="payment.name"
            class="space-y-2 rounded border border-outline-gray-2 p-3"
          >
            <p class="break-all font-medium">
              {{ payment.name }} · {{ __(payment.state) }}
            </p>
            <p>{{ payment.amount }} {{ payment.currency }}</p>
            <p
              v-if="
                [
                  'Unknown',
                  'Review',
                  'Dispatching',
                  'Queued',
                  'CancelPending',
                ].includes(payment.state)
              "
            >
              {{ paymentStateText(payment.state) }}
            </p>
            <p
              v-if="payment.fee_net_available === false"
              class="text-xs text-ink-gray-6"
            >
              {{
                __('Provider fees and net settlement are not available here.')
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <a
                v-if="paymentCheckoutUrl(payment)"
                :href="paymentCheckoutUrl(payment)"
                target="_blank"
                rel="noopener noreferrer"
                class="commerce-link"
                >{{ __('Open payment link') }}</a
              >
              <a
                v-if="payment.payment_request"
                :href="recordUrl('payment-request', payment.payment_request)"
                class="commerce-link"
                >{{ __('Open payment request') }}</a
              >
              <a
                v-if="payment.payment_entry"
                :href="recordUrl('payment-entry', payment.payment_entry)"
                class="commerce-link"
                >{{ __('Open payment entry') }}</a
              >
              <button
                class="commerce-button"
                :disabled="locked"
                @click="refreshPayment(payment)"
              >
                {{ __('Check payment status') }}
              </button>
              <button
                v-if="['Queued', 'Open'].includes(payment.state)"
                class="commerce-button"
                :disabled="locked"
                @click="cancelName = payment.name"
              >
                {{ __('Cancel payment link…') }}
              </button>
            </div>
            <div
              v-if="cancelName === payment.name"
              role="group"
              :aria-label="__('Confirm cancellation')"
              class="space-y-2"
            >
              <p>
                {{
                  __(
                    'Cancel this payment link? Cancellation must be confirmed by the payment service. It does not cancel the sales order or reverse a payment.',
                  )
                }}
              </p>
              <button
                class="commerce-button"
                :disabled="locked"
                @click="cancelPayment(payment)"
              >
                {{ __('Confirm link cancellation') }}
              </button>
              <button
                class="commerce-button"
                :disabled="locked"
                @click="cancelName = ''"
              >
                {{ __('Keep link') }}
              </button>
            </div>
          </li>
        </ul>
      </section>
      <p
        v-if="order.docstatus === 0 && !order.capabilities.can_submit"
        role="status"
      >
        {{
          __(
            'Your role cannot submit this draft order. Ask an authorized person to review and submit it before collection.',
          )
        }}
      </p>
      <p v-if="activePayment" role="status">
        {{
          __(
            'An active or unresolved payment link blocks a new collection. Check its status or complete its cancellation before starting another action.',
          )
        }}
      </p>
      <p v-else-if="handoff?.state === 'Open'" role="status">
        {{
          __(
            'Continue the existing register handoff before starting another collection.',
          )
        }}
      </p>
      <div v-if="!state.review" class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-2">
          <label class="block" :for="profileId">{{
            __('Register profile')
          }}</label>
          <select
            :id="profileId"
            v-model="state.profile"
            class="commerce-input"
            :disabled="locked || !canCheckout"
          >
            <option value="">
              {{ __('Choose an allowed register profile') }}
            </option>
            <option
              v-for="profile in order.profiles"
              :key="profile.name"
              :value="profile.name"
            >
              {{ profile.name }}
            </option>
          </select>
          <button
            class="commerce-button"
            :disabled="locked || !canCheckout || !state.profile"
            @click="preview('checkout')"
          >
            {{ __('Review register handoff') }}
          </button>
          <p v-if="!order.capabilities.can_pos_review" class="text-xs">
            {{
              __(
                'Register checkout needs an allowed profile and permission to update this order.',
              )
            }}
          </p>
        </div>
        <div class="space-y-2">
          <button
            class="commerce-button"
            :disabled="locked || !canRequestPayment"
            @click="preview('payment')"
          >
            {{ __('Review payment link') }}
          </button>
          <p class="text-xs text-ink-gray-6">
            {{
              __(
                'Creating a link does not send it to the customer. Review the amount and order submission first.',
              )
            }}
          </p>
        </div>
      </div>
      <section
        v-if="state.review"
        class="space-y-3 rounded border border-outline-gray-3 p-3"
        :aria-label="__('Review order action')"
      >
        <h4 class="font-semibold">
          {{
            state.review.kind === 'checkout'
              ? __('Review register handoff')
              : __('Review payment link')
          }}
        </h4>
        <p>
          {{ state.review.data.customer }} · {{ state.review.data.company }}
        </p>
        <p v-if="state.review.kind === 'checkout'">
          {{ __('Register profile') }}: {{ state.review.data.pos_profile }}
        </p>
        <ol class="space-y-2">
          <li
            v-for="(item, index) in state.review.data.items"
            :key="index"
            class="break-words"
          >
            {{ item.item_code }} · {{ item.description }} · {{ item.qty }} ×
            {{ item.rate }} {{ state.review.data.currency }}
          </li>
        </ol>
        <p>
          {{ __('Order total') }}: {{ state.review.data.total }}
          {{ state.review.data.currency }}
        </p>
        <p v-if="state.review.kind === 'checkout'">
          {{ __('Taxes') }}: {{ state.review.data.taxes }}
          {{ state.review.data.currency }}
        </p>
        <p>
          {{ __('Applied advance') }}: {{ state.review.data.advance_paid }}
          {{ state.review.data.currency }}
        </p>
        <p v-if="state.review.kind === 'payment'" class="font-semibold">
          {{ __('Payment link amount') }}: {{ state.review.data.amount }}
          {{ state.review.data.currency }}
        </p>
        <p v-if="state.review.data.requires_submit" role="alert">
          {{
            __(
              'Confirming this action submits the draft sales order using its reviewed terms. Submission is a separate action from payment.',
            )
          }}
        </p>
        <label class="flex min-h-11 items-start gap-2 py-2"
          ><input
            v-model="accepted"
            type="checkbox"
            class="mt-1"
            :disabled="locked"
          />{{
            __('I reviewed these terms and authorize this order action.')
          }}</label
        >
        <div class="flex flex-wrap gap-2">
          <button
            class="commerce-button"
            :disabled="locked || !accepted || !canConfirmReview"
            @click="confirmReview"
          >
            {{ confirmationLabel }}
          </button>
          <button
            class="commerce-button"
            :disabled="locked"
            @click="discardReview"
          >
            {{ __('Back to order') }}
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import {
  ACTIVE_PAYMENTS,
  commerceError,
  commerceReason,
  forgetCommand,
  knownRefusal,
  localCommerceUrl,
  paymentCheckoutUrl,
  persistCommand,
  restoreCommand,
} from './commerceState'
const props = defineProps({
  salesOrder: { type: String, required: true },
  deal: { type: String, default: '' },
  cart: { type: String, default: '' },
  state: { type: Object, required: true },
  blocked: Boolean,
})
// The owning Deal/cart keeps this state across tab changes and uncertain actions.
const state = props.state
const emit = defineEmits(['pending'])
const accepted = ref(false),
  cancelName = ref('')
const order = computed(() =>
  state.context?.selected?.name === props.salesOrder
    ? state.context.selected
    : null,
)
const handoff = computed(() => state.handoff || order.value?.pos_checkout)
const activePayment = computed(() =>
  order.value?.payments.some((payment) => ACTIVE_PAYMENTS.has(payment.state)),
)
const locked = computed(
  () =>
    props.blocked ||
    state.busy ||
    state.loading ||
    !!state.pending ||
    !!state.loadError ||
    !!state.storageError,
)
const orderReady = computed(
  () =>
    order.value &&
    order.value.docstatus !== 2 &&
    (order.value.docstatus !== 0 || order.value.capabilities.can_submit) &&
    !activePayment.value &&
    handoff.value?.state !== 'Open',
)
// Register checkout can invoice a fully advanced or free order without new tender.
// A new payment link always requires a strictly positive native remaining balance.
const canCheckout = computed(
  () =>
    orderReady.value &&
    Number(order.value.remaining) >= 0 &&
    order.value.capabilities.can_pos_review,
)
const canRequestPayment = computed(
  () =>
    orderReady.value &&
    Number(order.value.remaining) > 0 &&
    order.value.capabilities.can_payment_review &&
    order.value.payment_available,
)
const canConfirmReview = computed(() =>
  state.review?.kind === 'checkout'
    ? canCheckout.value
    : state.review?.kind === 'payment' && canRequestPayment.value,
)
const profileId = computed(() => `commerce-profile-${props.salesOrder}`)
const confirmationLabel = computed(() => {
  const submit = state.review?.data.requires_submit
  return state.review?.kind === 'checkout'
    ? submit
      ? __('Submit order and send to register')
      : __('Send reviewed order to register')
    : submit
      ? __('Submit order and request payment link')
      : __('Request reviewed payment link')
})
let epoch = 0
function scope() {
  return {
    sales_order: props.salesOrder,
    ...(props.deal ? { deal: props.deal } : {}),
    ...(props.cart ? { cart: props.cart } : {}),
  }
}
function money(value) {
  return `${value} ${order.value.currency}`
}
function recordUrl(type, name) {
  return `/app/${type}/${encodeURIComponent(name)}`
}
function documentStatus(status) {
  return status === 0
    ? __('Draft')
    : status === 1
      ? __('Submitted')
      : __('Cancelled')
}
function paymentStateText(state) {
  return (
    {
      Unknown: __(
        'The payment outcome is unknown. Check the existing request; do not create another link.',
      ),
      Review: __(
        'This payment needs review in the payment service before another collection.',
      ),
      Queued: __('The request is queued. A customer link is not ready yet.'),
      Dispatching: __(
        'The payment service is processing this request. Its outcome is not confirmed.',
      ),
      CancelPending: __(
        'Cancellation is pending. The link is not confirmed cancelled yet.',
      ),
    }[state] || ''
  )
}
function validAmount(value) {
  return (
    (typeof value === 'number' || typeof value === 'string') &&
    value !== '' &&
    Number.isFinite(Number(value))
  )
}
function validContext(result) {
  const selected = result?.selected
  return (
    typeof result?.available === 'boolean' &&
    (!result.available ||
      (selected?.name === props.salesOrder &&
        Array.isArray(selected.payments) &&
        Array.isArray(selected.profiles) &&
        Array.isArray(selected.billing?.invoices) &&
        !!selected.delivery &&
        !!selected.capabilities &&
        [selected.total, selected.advance_paid, selected.remaining].every(
          validAmount,
        )))
  )
}
async function load() {
  if (state.busy || state.loading) return
  const stamp = epoch
  state.loading = true
  state.loadError = ''
  state.review = null
  accepted.value = false
  try {
    const result = await call('crm.api.commerce.get_context', scope())
    if (stamp !== epoch) return
    if (!validContext(result))
      throw new Error(
        __('The order status is incomplete. Refresh before continuing.'),
      )
    state.context = result
    if (!state.pending) state.handoff = null
    if (
      !result.selected?.profiles.some(
        (profile) => profile.name === state.profile,
      )
    )
      state.profile = ''
  } catch (error) {
    if (stamp === epoch) state.loadError = commerceError(error)
  } finally {
    if (stamp === epoch) state.loading = false
  }
}
async function preview(kind) {
  if (locked.value) return
  if (kind === 'checkout' && (!canCheckout.value || !state.profile)) return
  if (kind === 'payment' && !canRequestPayment.value) return
  state.busy = true
  state.error = ''
  state.notice = ''
  accepted.value = false
  try {
    const result = await call(
      `crm.api.commerce.preview_${kind === 'checkout' ? 'checkout' : 'payment_link'}`,
      {
        ...scope(),
        ...(kind === 'checkout' ? { pos_profile: state.profile } : {}),
      },
    )
    if (
      result?.sales_order !== props.salesOrder ||
      !result.review_hash ||
      !result.currency ||
      ![
        result.total,
        result.advance_paid,
        kind === 'payment' ? result.amount : result.taxes,
      ].every(validAmount) ||
      !Array.isArray(result.items) ||
      typeof result.requires_submit !== 'boolean' ||
      (kind === 'checkout' && result.pos_profile !== state.profile) ||
      (kind === 'payment' &&
        !['submit_order_and_request_link', 'request_link'].includes(
          result.effect,
        ))
    )
      throw new Error(__('The review is incomplete. Review this order again.'))
    state.review = { kind, data: result }
  } catch (error) {
    state.error = commerceError(error)
  } finally {
    state.busy = false
  }
}
function discardReview() {
  state.review = null
  accepted.value = false
}
async function confirmReview() {
  if (
    locked.value ||
    !accepted.value ||
    !canConfirmReview.value ||
    !state.review
  )
    return
  const review = state.review
  const params = {
    ...scope(),
    review_hash: review.data.review_hash,
    ...(review.kind === 'checkout'
      ? { pos_profile: review.data.pos_profile }
      : { request_id: crypto.randomUUID() }),
  }
  await begin({
    action:
      review.kind === 'checkout' ? 'queue_checkout' : 'request_payment_link',
    params,
  })
}
async function begin(command) {
  try {
    persistCommand(state.actor, command)
    state.pending = Object.freeze({
      action: command.action,
      params: Object.freeze(command.params),
    })
    await execute()
  } catch (error) {
    state.error = commerceError(error)
  }
}
function applyPayment(result) {
  if (
    !result?.name ||
    result.sales_order !== props.salesOrder ||
    typeof result.state !== 'string'
  )
    throw new Error(
      __('The payment response is incomplete. Check the existing request.'),
    )
  const payments = order.value?.payments
  if (payments) {
    const index = payments.findIndex((payment) => payment.name === result.name)
    if (index < 0) payments.unshift(result)
    else payments.splice(index, 1, result)
  }
}
async function execute() {
  if (state.busy || props.blocked || !state.pending) return
  const command = state.pending
  state.busy = true
  state.error = ''
  try {
    const result = await call(
      `crm.api.commerce.${command.action}`,
      command.params,
    )
    if (command.action === 'queue_checkout') {
      if (
        result?.sales_order !== props.salesOrder ||
        !result.charge_request ||
        !result.state
      )
        throw new Error(
          __('The register response is incomplete. Retry the same request.'),
        )
      state.handoff = result
    } else applyPayment(result)
    forgetCommand(state.actor, props.salesOrder)
    state.pending = null
    discardReview()
    cancelName.value = ''
    state.notice = __(
      'The order action was recorded. Check its current status below.',
    )
  } catch (error) {
    state.error = commerceError(error)
    if (knownRefusal(error)) {
      try {
        forgetCommand(state.actor, props.salesOrder)
        state.pending = null
        discardReview()
      } catch {
        state.error = __(
          'The saved action could not be cleared. Check its canonical order before continuing.',
        )
      }
    }
  } finally {
    state.busy = false
  }
  if (!state.pending) await load()
}
async function refreshPayment(payment) {
  if (locked.value) return
  state.busy = true
  state.error = ''
  try {
    applyPayment(
      await call('crm.api.commerce.refresh_payment', {
        ...scope(),
        name: payment.name,
      }),
    )
  } catch (error) {
    state.error = commerceError(error)
  } finally {
    state.busy = false
  }
  await load()
}
async function cancelPayment(payment) {
  if (locked.value || cancelName.value !== payment.name) return
  await begin({
    action: 'cancel_payment',
    params: { ...scope(), name: payment.name },
  })
}
watch(
  () => [props.salesOrder, props.deal, props.cart],
  () => {
    epoch++
    state.context = null
    state.loadError = ''
    state.storageError = ''
    state.handoff = null
    state.review = null
    state.loading = false
    try {
      state.pending = restoreCommand(state.actor, props.salesOrder)
    } catch {
      state.storageError = __(
        'A saved order action could not be read. Check its canonical order before starting another payment.',
      )
      return
    }
    load()
  },
  { immediate: true },
)
watch(
  () => state.busy || !!state.pending,
  (value) => emit('pending', value),
  { immediate: true, flush: 'sync' },
)
onUnmounted(() => {
  epoch++
})
</script>
<style scoped>
.commerce-button {
  @apply min-h-11 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-left text-sm text-ink-gray-8 focus-visible:ring-2 disabled:opacity-50;
}
.commerce-input {
  @apply min-h-11 w-full min-w-0 rounded border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 focus-visible:ring-2 disabled:opacity-50;
}
.commerce-link {
  @apply inline-flex min-h-11 items-center break-all px-1 underline focus-visible:ring-2;
}
</style>
