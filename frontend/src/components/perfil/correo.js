// Mi perfil › Seguridad › «Correo»: changing the address the person signs in
// with (doco's cambio_correo, site_config doco_email_change_enabled). doco's
// Seguridad read carries `email_change`: null where the change is not offered,
// and then there is no row, as before.
//
// The flow: the new address and the password («Enviar código»), the six
// digits mailed to the new address («Cambiar correo»), then doco renames the
// account in the background. The rename ends every session of the person,
// this one too, so the browser follows it with a token through doco's guest
// `progreso` and ends on «Entrar» with the new address.
import { call, frappeRequest } from 'frappe-ui'

const API = 'doco.docoutils.cambio_correo.api.'
const t = (text, replace) => __(text, replace, 'Perfil')

/** Where the browser keeps the token of a change under way (sessionStorage). */
export const PROGRESS_KEY = 'muelle:cambio-correo'
// Every 2 seconds for the first half minute, then every 10: a long rename
// stays inside doco's progreso limit (120 reads in 10 minutes per address).
export const POLL_MS = 2000
export const POLL_SLOW_MS = 10000
export const POLL_FAST_FOR_MS = 30000
const CODE_LENGTH = 6
// The address shape doco takes (cambio_correo/rules.py clean_email).
const ADDRESS =
  /^[a-z0-9._+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** {offered, email, code_minutes, pending, changing, billing} */
export function readChange() {
  return frappeRequest({ url: `${API}estado`, method: 'GET' })
}

/** {ok, sent, email, expires_in, code_minutes} or {ok: false, reason, message}. */
export function askCode(email, password) {
  return call(`${API}pedir_codigo`, { email, password })
}

export function resendCode() {
  return call(`${API}reenviar_codigo`)
}

/** {ok, state: 'changing', cambio, email} or {ok: false, reason, message}. */
export function confirmCode(code) {
  return call(`${API}confirmar`, { code })
}

/** How long to wait before the next progress read, `elapsed` ms after the first. */
export function pollDelay(elapsed) {
  return Number(elapsed) < POLL_FAST_FOR_MS ? POLL_MS : POLL_SLOW_MS
}

/**
 * {state: changing | done | failed | unknown, slow?, billing?}. A plain GET
 * with no cookie: the rename ends this browser's session, and doco answers it
 * as a guest. Sending the session would resume it under the old name while
 * the rename runs.
 */
export async function readProgress(token, fetcher = globalThis.fetch) {
  const url = `/api/method/${API}progreso?cambio=${encodeURIComponent(token)}`
  const response = await fetcher(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok)
    throw new Error(t('We could not read how the change is going.'))
  const data = await response.json()
  return data?.message || { state: 'unknown' }
}

/** Frappe's «Forgot password» for the person's own account (the login page's). */
export function sendPasswordLink(user) {
  return call('frappe.core.doctype.user.user.reset_password', { user })
}

const clean = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

/** What stops «Enviar código», in the order the person fixes it; '' when ready. */
export function formGap(email, password, current) {
  const address = clean(email)
  if (!address) return t('Type the new email.')
  if (address.length > 140 || !ADDRESS.test(address) || address.includes('..'))
    return t('Type a valid email, for example nombre@negocio.mx.')
  if (address === clean(current))
    return t('That is already the email you sign in with.')
  if (!password) return t('Type your password.')
  return ''
}

/** Only the digits, at most six. */
export function codeDigits(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH)
}

export function codeGap(code) {
  return codeDigits(code).length === CODE_LENGTH
    ? ''
    : t('Type the 6 digits of the code.')
}

/** The line under the code: how long the code sent still lives (`expires_in` seconds). */
export function sentLine(email, expiresIn) {
  const seconds = Number(expiresIn)
  if (!(seconds > 0))
    return t('The code we sent to {0} expired. Ask for another.', [email])
  if (seconds <= 60)
    return t('We sent a code to {0}. It expires in less than a minute.', [
      email,
    ])
  return t('We sent a code to {0}. It expires in {1} minutes.', [
    email,
    Math.ceil(seconds / 60),
  ])
}

/** «n•••@dominio.mx»: what a screen shows of an address that is no longer the person's. */
export function maskEmail(email) {
  const text = String(email || '').trim()
  const at = text.lastIndexOf('@')
  if (at < 0) return '•••'
  return `${text.slice(0, Math.min(1, at))}•••${text.slice(at)}`
}

/**
 * The «Correo» row's line under its title (two lines at most, a 305 px phone
 * included): the address, then what waits. The sheet says the rest (the
 * address a code went to, the masked old address Muelle still writes to).
 */
export function rowLine(change) {
  if (!change) return ''
  if (change.changing) return t('Changing your email…')
  const lines = [change.email || '']
  if (change.pending?.email) lines.push(t('Your code still needs typing'))
  else if (change.billing?.state === 'kept')
    lines.push(t('Muelle still uses your old email'))
  return lines.filter(Boolean).join('. ')
}

/** What the person reads about Muelle's own mail once the change is done. */
export function billingLine(billing, oldEmail) {
  if (billing === 'synced')
    return t('Muelle’s invoices and notices will reach it too.')
  if (billing === 'kept')
    return t(
      'Muelle’s invoices and notices still go to {0}. Sign in and report it from your profile so we move them.',
      [maskEmail(oldEmail)],
    )
  return ''
}

/** How many tries a wrong code leaves (doco's tries_left); '' when doco did not say. */
export function triesLine(left) {
  const count = Number(left)
  if (!Number.isInteger(count) || count <= 0) return ''
  return count === 1 ? t('1 try left.') : t('{0} tries left.', [count])
}

/** A refusal doco answered ({ok: false, reason, message}), in its words, with the tries a wrong code leaves. */
export function refusalText(out, fallback) {
  const said = (typeof out?.message === 'string' && out.message) || fallback
  const tries = out?.reason === 'wrong_code' ? triesLine(out.tries_left) : ''
  return tries ? `${said} ${tries}` : said
}

export function rememberChange(token, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(PROGRESS_KEY, token)
  } catch {
    // storage unavailable: the sheet keeps the token while it is open
  }
}

export function recallChange(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem(PROGRESS_KEY) || ''
  } catch {
    return ''
  }
}

export function forgetChange(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(PROGRESS_KEY)
  } catch {
    // nothing kept
  }
}

/** Sign in again, back to Mi perfil. */
export const SIGN_IN_URL = `/login?redirect-to=${encodeURIComponent('/crm/perfil')}`

/** doco's support form (support_workflow.js) with the sentence already written. */
export function reportProblem(description) {
  if (window.docoSupport?.openReport) {
    window.docoSupport.openReport({ description })
    return true
  }
  if (window.docoOpenAyuda) {
    window.docoOpenAyuda()
    return true
  }
  return false
}
