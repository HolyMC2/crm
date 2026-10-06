import { inject, onBeforeUnmount, reactive } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

export const ACTIVE_PAYMENTS = new Set([
  'Queued',
  'Dispatching',
  'Unknown',
  'Open',
  'CancelPending',
  'Review',
])
const ACTIONS = new Set([
  'queue_checkout',
  'request_payment_link',
  'cancel_payment',
])
export function createCommerceState(actor = '') {
  return reactive({
    actor,
    selected: '',
    context: null,
    loading: false,
    busy: false,
    loadError: '',
    storageError: '',
    error: '',
    notice: '',
    profile: '',
    review: null,
    pending: null,
    handoff: null,
    epoch: 0,
  })
}
export function useCommerceState() {
  const session = inject('session', null)
  const state = createCommerceState(session?.user || '')
  const mayLeave = () => !state.busy && !state.pending
  function beforeUnload(event) {
    if (mayLeave()) return
    event.preventDefault()
    event.returnValue = ''
  }
  window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() =>
    window.removeEventListener('beforeunload', beforeUnload),
  )
  onBeforeRouteLeave(mayLeave)
  onBeforeRouteUpdate(
    (to, from) => to.params.dealId === from.params.dealId || mayLeave(),
  )
  return state
}
function storageKey(actor, salesOrder) {
  return `crm-commerce-command:${encodeURIComponent(actor)}:${encodeURIComponent(salesOrder)}`
}
export function persistCommand(
  actor,
  command,
  storage = window.sessionStorage,
) {
  if (!actor)
    throw new Error(
      __(
        'Cannot preserve the reviewed action. Reload your CRM session before continuing.',
      ),
    )
  const checked = checkedCommand(command, command?.params?.sales_order)
  storage.setItem(
    storageKey(actor, checked.params.sales_order),
    JSON.stringify(checked),
  )
}
export function restoreCommand(
  actor,
  salesOrder,
  storage = window.sessionStorage,
) {
  const raw = storage.getItem(storageKey(actor, salesOrder))
  if (!raw) return null
  return checkedCommand(JSON.parse(raw), salesOrder)
}
function checkedCommand(command, salesOrder) {
  const allowed = new Set([
    'sales_order',
    'deal',
    'cart',
    ...(command?.action === 'cancel_payment'
      ? ['name']
      : [
          'review_hash',
          ...(command?.action === 'queue_checkout'
            ? ['pos_profile']
            : ['request_id']),
        ]),
  ])
  const params = command?.params
  const valid = (value) =>
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  if (
    !ACTIONS.has(command?.action) ||
    !params ||
    !valid(salesOrder) ||
    params.sales_order !== salesOrder ||
    Object.keys(params).some(
      (key) => !allowed.has(key) || !valid(params[key]),
    ) ||
    (command.action === 'cancel_payment'
      ? !valid(params.name)
      : !valid(params.review_hash)) ||
    (command.action === 'queue_checkout' && !valid(params.pos_profile)) ||
    (command.action === 'request_payment_link' &&
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        params.request_id || '',
      ))
  )
    throw new Error(
      __(
        'A saved order action needs review. Check the order before continuing.',
      ),
    )
  return Object.freeze({
    action: command.action,
    params: Object.freeze({ ...params }),
  })
}
export function forgetCommand(
  actor,
  salesOrder,
  storage = window.sessionStorage,
) {
  storage.removeItem(storageKey(actor, salesOrder))
}
export function localCommerceUrl(value, kind = 'record') {
  if (
    typeof value !== 'string' ||
    /[\\\r\n]/.test(value) ||
    value.startsWith('//')
  )
    return ''
  if (kind === 'cashier')
    return /^\/posapp\?charge_request=[^#&\s]+$/.test(value) ? value : ''
  return /^\/(?:app|desk)\/(?:sales-order|sales-invoice|pos-invoice|payment-request|payment-entry)\/[^/?#\s]+$/.test(
    value,
  )
    ? value
    : ''
}
export function paymentCheckoutUrl(payment) {
  if (payment?.state !== 'Open') return ''
  try {
    const url = new URL(payment.checkout_url)
    return url.protocol === 'https:' &&
      url.hostname === 'www.mercadopago.com.mx' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      url.pathname === '/checkout/v1/redirect' &&
      [...url.searchParams.keys()].length === 1 &&
      /^[A-Za-z0-9_-]{1,128}$/.test(url.searchParams.get('order_id') || '')
      ? url.href
      : ''
  } catch {
    return ''
  }
}
export function commerceError(error) {
  const type = error?.exc_type || error?.responseJSON?.exc_type
  if (type === 'PermissionError')
    return __(
      'You do not have permission for this order action. Check your session or ask your manager for access.',
    )
  return (
    error?.messages?.[0] ||
    error?.message ||
    __('Orders cannot be reached right now. Try again or check the order.')
  )
}
export function knownRefusal(error) {
  return ['ValidationError', 'TimestampMismatchError'].includes(
    error?.exc_type || error?.responseJSON?.exc_type,
  )
}
export function commerceReason(reason) {
  return (
    {
      erp_checkout_unavailable: __(
        'Order checkout is not installed on this site.',
      ),
      payment_adapter_unavailable: __(
        'Payment links are not installed on this site.',
      ),
      payment_permission_required: __(
        'Your role cannot request payment links for this order.',
      ),
      payment_configuration_required: __(
        'Payment links need configuration before they can be requested.',
      ),
    }[reason] ||
    __(
      'This action is unavailable. Check the order configuration or contact your manager.',
    )
  )
}
