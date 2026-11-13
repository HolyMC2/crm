// What every self-service block of Mi cuenta shares (apps, users and cajas,
// plan change, Datos fiscales, «Agregar tarjeta», receipts, cancel): Boat names
// what it has switched on for this site in bootstrap's `capabilities`, and a
// block shows only when its name is there; an older Boat sends none, so the
// page stays as it was. Boat refuses in one shape, {ok: false, reason,
// message, next}: the block says Boat's sentence and offers the next step.
// Pure.
import { LOCALE, formatMoney, parseServerDate } from '@/utils/display'
import { errorText } from '@/utils/errorText'

const t = (text, replace) => __(text, replace, 'Cuenta')

/** Whether Boat has `name` on for this site (bootstrap.capabilities). */
export function capable(data, name) {
  return Array.isArray(data?.capabilities) && data.capabilities.includes(name)
}

/** An amount Boat quoted, as the owner reads it: «$99.00». */
export const money = (value) => formatMoney(Number(value) || 0, 'MXN')

/** «30 de noviembre», with the year when it is not this one; '' when unknown. */
export function longDate(value, now = new Date()) {
  const date = parseServerDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date)
}

// The next steps Boat names (`next`), as the page's acts: each opens a tab, a
// sheet or support. One Boat may add later shows the sentence alone.
const NEXT = {
  pay_invoice: () => ['pay', t('See invoices')],
  activate_plan: () => ['activate', t('Activate your plan')],
  support: () => ['support', t('Ask support for help')],
  plan_change: () => ['plans', t('See plans')],
  plans: () => ['plans', t('See plans')],
  request_plan: () => ['request', t('Request the change')],
  resume_subscription: () => ['resume', t('Go to your subscription')],
  seats: () => ['seats', t('See users and registers')],
  // «Primero activa tu tienda en línea en Complementos» (the shop's address).
  addons: () => ['addons', t('See add-ons')],
  // «Desactiva 2 para bajar a 3»: no screen of the panel turns a login or a
  // caja off yet (Equipo invites and sets puestos only), so support does it.
  deactivate: () => ['support', t('Ask support for help')],
}

/** {act, label} for Boat's next step, or null when this panel has none for it. */
export function nextStep(next) {
  const step = Object.hasOwn(NEXT, next) ? NEXT[next]() : null
  return step ? { act: step[0], label: step[1] } : null
}

/**
 * What a refused answer tells the owner: Boat's sentence and its next step.
 * null only for an answer Boat marked ok; anything else (a refusal, an empty
 * or unexpected answer) says why it did not go through.
 */
export function refusalView(answer, fallback = '') {
  if (answer?.ok === true) return null
  const text =
    (typeof answer?.message === 'string' && answer.message.trim()) ||
    fallback ||
    t('The platform did not accept the change. Try again in a moment.')
  return {
    reason: answer?.reason || '',
    text,
    next: nextStep(answer?.next),
  }
}

/** A refusal that only means the seam is off at Boat: the block hides. */
export function seamOff(answer) {
  return answer?.ok === false && answer.reason === 'disabled'
}

/** What a failed call (Boat or doco unreachable, a ValidationError) tells the owner. */
export function failureText(error) {
  return errorText(
    error,
    t('We could not reach the platform. Check your connection and try again.'),
  )
}

/**
 * The key one confirm sends, so a double tap or a retry after a lost answer
 * is one change at Boat (it answers a replay with the first answer).
 */
export function clientKey(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
