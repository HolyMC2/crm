// «Agregar tarjeta» (capability «card_setup»): Stripe.js loads from
// js.stripe.com only when the sheet opens, the card goes from Stripe's own
// field (an iframe) to Stripe, and Muelle receives the confirmed SetupIntent's
// id alone (confirm_card_setup): never the card, never the client secret.
// start_card_setup answers the publishable key and the client secret Elements
// mounts with.
//
// A bank that asks for 3-D Secure gets Stripe's challenge window, which Stripe
// adds to document.body. The kit sheet is a modal dialog (body pointer-events
// off, focus held inside it), so the challenge would take no tap or typing
// while it is open: the sheet confirms with handleActions false, closes while
// Stripe runs the challenge, and opens again for the result.
//
// /crm sends no Content-Security-Policy today (2026-11-11: crm/www/crm.py sets
// none, nor does the tenant nginx). One added later must allow script-src and
// frame-src https://js.stripe.com, frame-src https://hooks.stripe.com (3-D
// Secure) and connect-src https://api.stripe.com, or this sheet stops loading.
const t = (text, replace) => __(text, replace, 'Cuenta')

export const STRIPE_JS = 'https://js.stripe.com/v3/'
export const STRIPE_LOCALE = 'es-419'
const LOADING = new WeakMap()

/** Stripe's constructor, from the page or from js.stripe.com once; a failure can retry. */
export function loadStripe({
  doc = document,
  win = window,
  timeoutMs = 20000,
} = {}) {
  if (typeof win.Stripe === 'function') return Promise.resolve(win.Stripe)
  if (LOADING.has(win)) return LOADING.get(win)
  const pending = new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = STRIPE_JS
    script.async = true
    const fail = () => {
      clearTimeout(timer)
      script.remove()
      LOADING.delete(win)
      reject(new Error('stripe-js'))
    }
    const timer = setTimeout(fail, timeoutMs)
    script.addEventListener('load', () => {
      clearTimeout(timer)
      if (typeof win.Stripe === 'function') resolve(win.Stripe)
      else fail()
    })
    script.addEventListener('error', fail)
    doc.head.appendChild(script)
  })
  LOADING.set(win, pending)
  return pending
}

/** What start_card_setup let through, when it is enough to mount the field. */
export function setupReady(answer) {
  return (
    answer?.ok !== false &&
    typeof answer?.client_secret === 'string' &&
    answer.client_secret.startsWith('seti_') &&
    typeof answer?.publishable_key === 'string' &&
    answer.publishable_key.startsWith('pk_')
  )
}

/** Why the field cannot open, in Boat's words or ours. */
export function setupRefusal(answer) {
  const said =
    (typeof answer?.message === 'string' && answer.message.trim()) ||
    (typeof answer?.error === 'string' && answer.error.trim())
  return (
    said ||
    t(
      'Adding a card is not available right now. Ask support and we will help you.',
    )
  )
}

/** The SetupIntent id of a confirmed setup; '' when Stripe returned none. */
export function setupIntentId(result) {
  const id = result?.setupIntent?.id
  return typeof id === 'string' && /^seti_[A-Za-z0-9]+$/.test(id) ? id : ''
}

// How long Stripe may take to answer a confirm before the sheet lets go of
// «Guardando», and the most a bank's challenge (3-D Secure) may stay open.
export const CONFIRM_MS = 45000
export const CHALLENGE_MS = 600000

/**
 * Resolves once `el` has left the page (the sheet's closing animation is over
 * and with it the modal's hold on the page), or after `ms` at the latest.
 */
export function whenGone(el, ms = 1000, step = 50) {
  const until = Date.now() + ms
  return new Promise((resolve) => {
    const check = () => {
      if (!el?.isConnected || Date.now() >= until) resolve()
      else setTimeout(check, step)
    }
    check()
  })
}

/** `promise`, or {timedOut: true} once `ms` pass. */
export function withTimeout(promise, ms, timers = {}) {
  const set = timers.set || setTimeout
  const clear = timers.clear || clearTimeout
  let timer = 0
  const late = new Promise((resolve) => {
    timer = set(() => resolve({ timedOut: true }), ms)
  })
  return Promise.race([Promise.resolve(promise), late]).finally(() =>
    clear(timer),
  )
}

/**
 * What one of Stripe's confirmCardSetup answers means for the sheet:
 * `confirmed` with the SetupIntent id (Boat checks it again at Stripe),
 * `challenge` when the bank asks for 3-D Secure, `error` with Stripe's own
 * words, `timeout`, or `unconfirmed`. A setup already confirmed by an
 * earlier, late answer arrives as an error that carries it: it is confirmed.
 */
export function setupOutcome(result) {
  if (result?.timedOut) return { kind: 'timeout' }
  const intent = result?.setupIntent || result?.error?.setup_intent || null
  const id = setupIntentId({ setupIntent: intent })
  if (id && intent.status === 'succeeded') return { kind: 'confirmed', id }
  if (result?.error)
    return {
      kind: 'error',
      message:
        typeof result.error.message === 'string' ? result.error.message : '',
    }
  if (intent?.status === 'requires_action') return { kind: 'challenge' }
  if (id && intent.status !== 'requires_payment_method')
    return { kind: 'confirmed', id }
  return { kind: 'unconfirmed' }
}

/**
 * The card field's colours from the sheet's own tokens, light or dark: the
 * text of `el`, the placeholder and icon of `muted`, the error of `danger`.
 */
export function cardStyle({ el, muted, danger } = {}, win = window) {
  if (!el || typeof win.getComputedStyle !== 'function') return {}
  const css = win.getComputedStyle(el)
  const soft = muted ? win.getComputedStyle(muted).color : css.color
  const bad = danger ? win.getComputedStyle(danger).color : css.color
  return {
    base: {
      color: css.color,
      fontFamily: css.fontFamily,
      fontSize: '16px',
      iconColor: soft,
      '::placeholder': { color: soft },
    },
    invalid: { color: bad, iconColor: bad },
  }
}

export const LOAD_ERROR = () =>
  t(
    'We could not load the secure card form. Check your connection or an ad blocker and try again.',
  )
export const NETWORK_ERROR = () =>
  t('The connection dropped while we checked your card. Try again.')
export const BANK_ERROR = () =>
  t('The bank did not accept the card. Check it or try another one.')
export const CHALLENGE_ERROR = () =>
  t(
    'Your bank’s check did not finish. Try again, and keep its window open until it closes by itself.',
  )
