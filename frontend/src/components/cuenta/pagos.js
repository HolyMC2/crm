// Mi cuenta's payment door: every hold, lock, poll and continuation of Mi plan
// (doco/public/js/miplan/App.vue), in one module that every Cuenta tab and sheet
// shares instead of deriving its own. Boat decides; this only keeps the click
// guard and says why a door is shut. Reads and payments go through the existing
// doco.docoutils.miplan relays (`read`, `mutate`); nothing is stored in the
// browser, so a reload always asks Boat again.
import { computed, ref } from 'vue'
import { errorText } from '@/utils/errorText'

export const POLL_MS = 5000
// One page of wallet movements (miplan.wallet_txns); Mi plan reads 20 at a time.
export const TXN_PAGE = 20
const PENDING = ['captured_unsettled', 'in_flight']
const t = (text, replace) => __(text, replace, 'Cuenta')

/** A checkout URL Boat handed back, only when it is plain https. */
export function checkoutUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : ''
  } catch {
    return ''
  }
}

/** The same payment session to continue, only when Boat says it is safe. */
export function safeContinuation(state) {
  const session = state?.checkout_session
  return state?.authoritative === true &&
    state.status === 'checkout' &&
    state.next_action === 'continue_checkout' &&
    session?.capture_safe === true &&
    session.status === 'open' &&
    session.payment_status === 'unpaid'
    ? checkoutUrl(state.checkout_url)
    : ''
}

/** Mi plan's store.js bound check, before the roundtrip; the server decides. */
export function validateTopup(amount, lo, hi, money = String) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0)
    return { ok: false, error: t('Enter a valid amount.') }
  if (lo && n < lo)
    return { ok: false, error: t('The minimum amount is {0}.', [money(lo)]) }
  if (hi && n > hi)
    return { ok: false, error: t('The maximum amount is {0}.', [money(hi)]) }
  return { ok: true, error: '' }
}

// doco's support form (support_workflow.js) takes a prepared description.
function defaultSupport(description = '') {
  if (window.docoSupport?.openReport)
    window.docoSupport.openReport(description ? { description } : undefined)
  else if (window.docoOpenAyuda) window.docoOpenAyuda()
  else return false
  return true
}

/**
 * @param {object} io
 * @param {(fn: string, params?: object) => Promise<any>} io.read   miplan read relay
 * @param {(fn: string, params?: object) => Promise<any>} io.mutate miplan POST relay
 * @param {(url: string) => void} [io.navigate] leaves for the processor's page
 * @param {(description?: string) => boolean} [io.openSupport] opens a support
 *   report, prefilled when given a description; false when none
 * @param {string} [io.panel] where the processor returns the owner (miplan.RETURN_PATHS)
 * @param {() => string} [io.tab] the section the owner pays from (miplan.RETURN_TABS)
 */
export function createPagos({
  read,
  mutate,
  navigate = (url) => window.location.assign(url),
  openSupport = defaultSupport,
  // Wrapped: a browser's setTimeout called as `timers.set()` throws «Illegal invocation».
  timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
  panel = 'cuenta',
  tab = () => '',
} = {}) {
  const loading = ref(true)
  const error = ref('')
  const boot = ref(null)
  const busy = ref('')
  const paymentState = ref(null)
  const paymentReading = ref(false)
  const activationOpen = ref(false)
  const activationMethod = ref('hosted')
  const activationMessage = ref('')
  const activationLocked = ref(true)
  const activationCheckoutUrl = ref('')
  const topupOpen = ref(false)
  const topupAmount = ref('')
  const topupError = ref('')
  const invoiceErrors = ref({})
  const cards = ref([])
  const cardError = ref('')
  const supportError = ref('')
  const quote = ref(null)
  const quoteLoading = ref(false)
  const txns = ref([])
  const txnsDone = ref(false)
  const txnsLoaded = ref(false)
  const txnsBusy = ref(false)
  const txnsError = ref('')
  const checkingState = () =>
    t(
      'We are checking the payment status. Wait for it to finish or choose Check status.',
    )
  const paymentBlockReason = ref(checkingState())
  let poll = null
  let readPromise = null
  let disposed = false

  const isProvisioning = computed(
    () => paymentState.value?.status === 'provisioning',
  )
  const invalidPaymentState = computed(
    () => paymentState.value?.reason === 'invalid_payment_state',
  )
  // Contract uncertainty blocks every payment door; valid invoice capture
  // states stay invoice-specific and do not decide wallet eligibility.
  const paymentHold = computed(
    () => isProvisioning.value || invalidPaymentState.value,
  )
  const provisioningBroken = computed(
    () => paymentState.value?.site_status === 'Broken',
  )
  const provisioningMessage = computed(() =>
    provisioningBroken.value
      ? t(
          'Preparing your site needs help from support. Open a report to continue and check the status afterwards.',
        )
      : t(
          "We are preparing your shop's server. Check the status in a few minutes to continue.",
        ),
  )
  const paymentActionReason = computed(() =>
    busy.value
      ? t(
          'A request is in progress. Wait for it to finish before you continue.',
        )
      : paymentBlockReason.value,
  )
  const topupActionReason = computed(() =>
    paymentReading.value
      ? t(
          'We are checking the payment status. Wait for it to finish and choose Continue to open your top-up.',
        )
      : busy.value
        ? paymentActionReason.value
        : t('Choose Continue to open the secure top-up payment.'),
  )

  // Where the processor sends the owner back: this panel and, when known, its
  // section. A top-up names the panel only: Boat appends its own query to it.
  function returnTo() {
    const section = tab()
    return section ? { panel, tab: section } : { panel }
  }

  /** Leaves for the processor when a reply carries a plain https checkout_url. */
  function followCheckout(out) {
    const url = checkoutUrl(out?.checkout_url)
    if (url) navigate(url)
    return Boolean(url)
  }

  function paymentReason(state) {
    if (state?.status === 'provisioning') return provisioningMessage.value
    if (state?.status === 'captured_unsettled')
      return t('Payment received, confirming…')
    return t(
      '{0} Choose Check status or ask support for help before paying again.',
      [state?.message || t('We cannot confirm the payment status yet.')],
    )
  }

  const invoiceState = (inv) => paymentState.value?.invoices?.[inv?.name]

  function paymentActionsBlocked() {
    return !!busy.value || loading.value || paymentHold.value
  }

  function invoiceBlocked(inv) {
    const state = invoiceState(inv)
    return (
      paymentActionsBlocked() ||
      paymentReading.value ||
      state?.authoritative !== true ||
      !(state.status === 'ready' || safeContinuation(state))
    )
  }

  function invoicePaymentReason(inv) {
    if (busy.value || paymentHold.value) return paymentActionReason.value
    return invoiceErrors.value[inv.name] || paymentReason(invoiceState(inv))
  }

  function stopPoll() {
    if (poll != null) timers.clear(poll)
    poll = null
  }

  function schedulePoll() {
    stopPoll()
    const pending = [
      paymentState.value,
      ...Object.values(paymentState.value?.invoices || {}),
    ].some((state) => PENDING.includes(state?.status))
    if (!disposed && pending)
      poll = timers.set(async () => {
        poll = null
        await refreshPaymentState()
      }, POLL_MS)
  }

  function setActivationLock(value) {
    // Only an in-memory click guard. Reload always asks Boat; browser storage
    // is never evidence of a pending charge or a reason to block checkout.
    activationLocked.value = value
    if (!value) paymentBlockReason.value = ''
  }

  function resolvePaymentState(state) {
    // An uncertain read cannot replace a known delivery or contract hold.
    if (
      paymentHold.value &&
      state?.status !== 'provisioning' &&
      state?.authoritative !== true
    )
      state = paymentState.value
    paymentState.value = state || null
    if (paymentHold.value) {
      activationOpen.value = false
      topupOpen.value = false
      topupAmount.value = ''
      topupError.value = ''
    }
    activationCheckoutUrl.value = safeContinuation(state)
    const status = state?.status
    if (
      state?.authoritative === true &&
      ['ready', 'active', 'paid'].includes(status)
    ) {
      setActivationLock(false)
      activationMessage.value = ''
    } else {
      setActivationLock(true)
      paymentBlockReason.value = activationCheckoutUrl.value
        ? t(
            '{0} Continue the same payment with the confirmed link or choose Check status.',
            [state.message || t('Your payment is not complete yet.')],
          )
        : paymentReason(state)
      activationMessage.value = paymentBlockReason.value
    }
    invoiceErrors.value = {}
    schedulePoll()
  }

  async function refreshPaymentState({ duringMutation = false } = {}) {
    if (
      disposed ||
      paymentReading.value ||
      loading.value ||
      (busy.value && !duringMutation)
    ) {
      schedulePoll()
      return
    }
    paymentReading.value = true
    try {
      const state = await (readPromise = read('payment_state'))
      if (disposed) return
      resolvePaymentState(state)
      if (boot.value) {
        boot.value.payment_state = state
        if (state?.authoritative === true) {
          if (typeof state.is_trial === 'boolean') {
            if (boot.value.site) boot.value.site.is_trial = state.is_trial
            if (boot.value.meters?.billing)
              boot.value.meters.billing.is_trial = state.is_trial
          }
          for (const inv of boot.value.invoices || []) {
            const fresh = state.invoices?.[inv.name]
            if (fresh?.authoritative === true && fresh.invoice_status)
              inv.status = fresh.invoice_status
          }
        }
      }
    } catch {
      if (disposed) return
      // Keep known payment and delivery holds visible during a failed read.
      const held =
        paymentHold.value || paymentState.value?.status === 'captured_unsettled'
      if (!held) resolvePaymentState({ status: 'unconfirmed' })
      schedulePoll()
    } finally {
      paymentReading.value = false
      readPromise = null
    }
  }

  async function load() {
    // A read must never release the click guard while a mutation is in flight.
    if (busy.value || (loading.value && boot.value)) return
    if (readPromise) await readPromise.catch(() => {})
    if (busy.value || (loading.value && boot.value)) return
    stopPoll()
    const previousState = paymentState.value
    const held =
      paymentHold.value || previousState?.status === 'captured_unsettled'
    if (!held) paymentState.value = null
    loading.value = true
    error.value = ''
    setActivationLock(true)
    activationCheckoutUrl.value = ''
    if (!held) paymentBlockReason.value = checkingState()
    try {
      const out = await read('bootstrap', { require_fresh: 1 })
      if (out?.stale) throw new Error('stale')
      boot.value = out
      resolvePaymentState(out?.payment_state)
    } catch {
      error.value = t(
        'We could not check the current state of the plan. Choose Check status or open a report in Help.',
      )
      if (held) resolvePaymentState(previousState)
      else
        resolvePaymentState({
          status: 'unconfirmed',
          message: t('We could not confirm the payment with the platform.'),
        })
    } finally {
      loading.value = false
      schedulePoll()
    }
  }

  /** Opens a support report, with `description` written in when given. */
  function contactSupport(description = '') {
    supportError.value = ''
    if (openSupport(description)) return
    const url = checkoutUrl(paymentState.value?.support_url)
    if (url) navigate(url)
    else
      supportError.value = t(
        "Open Help and choose Report a problem. Tell us this site's name and what you need.",
      )
  }

  async function loadCards() {
    cardError.value = ''
    try {
      const out = await read('payment_methods')
      if (out?.ok === false) throw new Error(out.error || out.message || '')
      cards.value = out?.cards || []
    } catch (e) {
      cards.value = []
      cardError.value = errorText(e, t('We could not check your cards.'))
    }
  }

  // The amount «Activar» charges, IVA included (miplan.activation_quote). A Boat
  // without it, or any refusal, leaves the plan price on screen instead.
  async function loadQuote() {
    quoteLoading.value = true
    try {
      const out = await read('activation_quote')
      quote.value = out?.ok === true ? out : null
    } catch {
      quote.value = null
    } finally {
      quoteLoading.value = false
    }
  }

  async function openActivation() {
    if (paymentActionsBlocked()) return false
    // A fresh quote every time: the sheet says it is working the amount out
    // instead of flashing an older figure or the plan price first.
    quote.value = null
    quoteLoading.value = true
    activationOpen.value = true
    activationMethod.value = 'hosted'
    activationMessage.value = activationLocked.value
      ? paymentBlockReason.value
      : ''
    await Promise.all([loadCards(), loadQuote()])
    return true
  }

  function closeActivation() {
    activationOpen.value = false
  }

  function chooseMethod(value) {
    if (value === 'saved' || value === 'hosted') activationMethod.value = value
  }

  function resumeActivation() {
    if (
      paymentActionsBlocked() ||
      paymentReading.value ||
      !activationCheckoutUrl.value
    )
      return
    navigate(activationCheckoutUrl.value)
  }

  function resumeActivationAfterResponse() {
    // A new checkout returned by this exact mutation may open immediately.
    // An in_flight continuation always requires an explicit click.
    if (loading.value || paymentHold.value) return
    if (activationCheckoutUrl.value) navigate(activationCheckoutUrl.value)
  }

  async function activatePlan() {
    if (
      paymentActionsBlocked() ||
      paymentReading.value ||
      activationLocked.value
    )
      return
    busy.value = 'activate'
    activationMessage.value = ''
    activationCheckoutUrl.value = ''
    setActivationLock(true)
    paymentBlockReason.value = t(
      'We are sending the activation. Wait for it to finish before you continue.',
    )
    let refresh = false
    try {
      const out = await mutate('activate_plan', {
        use_saved_card: activationMethod.value === 'saved' ? 1 : 0,
        ...returnTo(),
      })
      const code = out?.code || out?.reason || out?.status
      if (out?.card_declined || ['card_declined', 'declined'].includes(code)) {
        setActivationLock(false)
        activationMessage.value = t(
          '{0} Ask your bank or try another payment method on the payment page.',
          [out.message || out.error || t('The card was declined.')],
        )
      } else if (['captured_unsettled', 'indeterminate'].includes(code)) {
        resolvePaymentState({ status: code, message: out.message || out.error })
      } else if (out?.in_flight || code === 'in_flight') {
        // Legacy conversion may include a newly minted URL after a capture.
        // Only Boat's fresh invoice/session verdict can permit continuation.
        resolvePaymentState({
          status: 'in_flight',
          message: out.message || out.error,
        })
        await refreshPaymentState({ duringMutation: true })
      } else if (out?.checkout_url) {
        resolvePaymentState({
          status: 'unconfirmed',
          message: t('The payment page is ready.'),
        })
        activationCheckoutUrl.value = checkoutUrl(out.checkout_url)
        resumeActivationAfterResponse()
      } else if (out?.ok === false) {
        if (['validation_error', 'invalid_request'].includes(code)) {
          setActivationLock(false)
          activationMessage.value = t(
            '{0} Correct the details and try again; if you need help, open a report with support.',
            [out.message || out.error || t('Check the request details.')],
          )
        } else
          resolvePaymentState({
            status: 'unconfirmed',
            message: out.message || out.error,
          })
      } else {
        refresh = true
      }
    } catch {
      resolvePaymentState({
        status: 'indeterminate',
        message: t('The connection was lost while sending the payment.'),
      })
    } finally {
      busy.value = ''
    }
    if (refresh) await load()
  }

  async function payInvoice(inv) {
    if (invoiceBlocked(inv) || ['Paid', 'Cancelled'].includes(inv.status))
      return
    const continuation = safeContinuation(invoiceState(inv))
    if (continuation) {
      navigate(continuation)
      return
    }
    busy.value = 'pay:' + inv.name
    const previousStates = { ...paymentState.value?.invoices }
    invoiceErrors.value[inv.name] = ''
    try {
      const out = await mutate('pay_invoice', { invoice: inv.name })
      const code = out?.code || out?.status
      if (
        ['captured_unsettled', 'indeterminate', 'in_flight'].includes(code) ||
        out?.in_flight
      ) {
        const state = {
          status: code || 'in_flight',
          message: out.message || out.error,
        }
        resolvePaymentState({
          ...state,
          invoices: { ...previousStates, [inv.name]: state },
        })
        await refreshPaymentState({ duringMutation: true })
        return
      }
      const url = checkoutUrl(out?.checkout_url)
      if (out?.ok === false || !url) throw new Error('checkout unavailable')
      const state = {
        status: 'unconfirmed',
        message: t('The payment page is ready.'),
      }
      resolvePaymentState({
        ...state,
        invoices: { ...previousStates, [inv.name]: state },
      })
      navigate(url)
    } catch {
      const state = {
        status: 'unconfirmed',
        message: t('We could not confirm the payment request.'),
      }
      resolvePaymentState({
        ...state,
        invoices: { ...previousStates, [inv.name]: state },
      })
      invoiceErrors.value[inv.name] = t(
        'We could not open the payment for this invoice. Choose Check status and confirm whether it went through; if it is still pending, ask support before paying again.',
      )
    } finally {
      busy.value = ''
    }
  }

  function setTopupAmount(value) {
    topupAmount.value = String(value ?? '')
  }

  function closeTopup() {
    topupOpen.value = false
  }

  function openTopup() {
    if (paymentActionsBlocked()) return false
    topupAmount.value = ''
    topupError.value = ''
    topupOpen.value = true
    return true
  }

  async function topup({ min, max, money } = {}) {
    if (paymentActionsBlocked() || paymentReading.value) return
    const v = validateTopup(topupAmount.value, min, max, money)
    topupError.value = v.error
      ? t('{0} Correct the amount and try again.', [v.error])
      : ''
    if (!v.ok) return
    busy.value = 'topup'
    try {
      // The relay returns the processor's checkout; payment happens there.
      const out = await mutate('topup_checkout', {
        amount: Number(topupAmount.value),
        panel,
      })
      if (followCheckout(out)) return
      // Boat refused before minting anything (portal_store._topup_payment_state:
      // the site or the wallet's service is not delivered yet): its words.
      if (typeof out?.message === 'string' && out.message.trim())
        topupError.value = t('{0} Check the status later or ask support.', [
          out.message.trim(),
        ])
      else throw new Error('checkout unavailable')
    } catch (e) {
      // A refusal Boat answered (an amount out of bounds, a shop that does not
      // pay through the platform) is said as Boat said it; anything else may
      // have reached the processor, so the movements come first.
      topupError.value =
        e?.exc_type === 'ValidationError'
          ? errorText(e, t('The platform refused the top-up.'))
          : t(
              'We could not open the top-up payment. Check the wallet movements before trying again or ask support.',
            )
    } finally {
      busy.value = ''
    }
  }

  // ── Facturación: wallet movements and saved cards ───────────────────────

  /** One page of wallet movements; `reset` starts again from the newest. */
  async function loadTxns({ reset = false } = {}) {
    if (txnsBusy.value) return
    if (reset) {
      txns.value = []
      txnsDone.value = false
    }
    txnsBusy.value = true
    txnsError.value = ''
    try {
      const page = await read('wallet_txns', {
        limit: TXN_PAGE,
        start: txns.value.length,
      })
      const rows = Array.isArray(page) ? page : []
      txns.value = [...txns.value, ...rows]
      if (rows.length < TXN_PAGE) txnsDone.value = true
      txnsLoaded.value = true
    } catch (e) {
      txnsError.value = errorText(
        e,
        t('We could not read the wallet movements. Try again in a moment.'),
      )
    } finally {
      txnsBusy.value = false
    }
  }

  /** Mi plan's removeCard: one card, then the list again; Boat may refuse. */
  async function removeCard(card) {
    if (paymentActionsBlocked() || !card?.id) return false
    busy.value = 'card'
    cardError.value = ''
    try {
      const out = await mutate('remove_payment_method', { source_id: card.id })
      if (out?.ok === false) throw new Error(out.error || out.message || '')
      await loadCards()
      return true
    } catch (e) {
      cardError.value = errorText(e, t('We could not remove the card.'))
      return false
    } finally {
      busy.value = ''
    }
  }

  // ── Tienda: add-ons and plan requests ────────────────────────────────────

  /**
   * Mi plan's toggleAddon: Boat records the change; the account is read again.
   * @returns {Promise<{ok: boolean, note?: string, error?: string}>}
   */
  async function toggleAddon(addon, action) {
    if (paymentActionsBlocked() || !addon?.service_key) return { ok: false }
    if (!['activate', 'cancel'].includes(action)) return { ok: false }
    busy.value = 'addon:' + addon.service_key
    try {
      const out = await mutate('toggle_addon', {
        service_key: addon.service_key,
        action,
      })
      if (followCheckout(out)) return { ok: true }
      busy.value = ''
      await load()
      return { ok: true, note: typeof out?.note === 'string' ? out.note : '' }
    } catch (e) {
      return {
        ok: false,
        error: errorText(e, t('We could not change the add-on. Try again.')),
      }
    } finally {
      busy.value = ''
    }
  }

  /**
   * Mi plan's requestPlan: a request an operator confirms, never a switch.
   * @returns {Promise<{ok: boolean, note?: string, error?: string}>}
   */
  async function requestPlan(target) {
    if (paymentActionsBlocked() || !target) return { ok: false }
    busy.value = 'plan'
    try {
      const out = await mutate('request_plan', { target_plan: target })
      if (followCheckout(out)) return { ok: true }
      busy.value = ''
      await load()
      return { ok: true, note: typeof out?.note === 'string' ? out.note : '' }
    } catch (e) {
      return {
        ok: false,
        error: errorText(e, t('We could not send the request. Try again.')),
      }
    } finally {
      busy.value = ''
    }
  }

  function dispose() {
    disposed = true
    stopPoll()
  }

  return {
    loading,
    error,
    boot,
    busy,
    paymentState,
    paymentReading,
    paymentBlockReason,
    activationOpen,
    activationMethod,
    activationMessage,
    activationLocked,
    activationCheckoutUrl,
    topupOpen,
    topupAmount,
    topupError,
    invoiceErrors,
    cards,
    cardError,
    supportError,
    quote,
    quoteLoading,
    txns,
    txnsDone,
    txnsLoaded,
    txnsBusy,
    txnsError,
    isProvisioning,
    invalidPaymentState,
    paymentHold,
    provisioningBroken,
    provisioningMessage,
    paymentActionReason,
    topupActionReason,
    paymentReason,
    invoiceState,
    paymentActionsBlocked,
    invoiceBlocked,
    invoicePaymentReason,
    resolvePaymentState,
    refreshPaymentState,
    load,
    contactSupport,
    loadCards,
    loadQuote,
    openActivation,
    closeActivation,
    chooseMethod,
    resumeActivation,
    activatePlan,
    payInvoice,
    openTopup,
    setTopupAmount,
    closeTopup,
    topup,
    followCheckout,
    loadTxns,
    removeCard,
    toggleAddon,
    requestPlan,
    dispose,
  }
}
