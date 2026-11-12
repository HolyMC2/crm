// Mi perfil (/crm/perfil): the person's own User record, for every signed-in
// person the shell admits, with or without Ventas. The same reads and writes
// Ventas' Profile and Preferences settings make (frappe.client on User,
// crm.api.user.change_password, the timezone list), on phone-first screens.
import { call, frappeRequest } from 'frappe-ui'
import { LOCALE } from '@/utils/display'

const t = (text, replace) => __(text, replace, 'Perfil')
const capital = (text) => text.replace(/^./, (c) => c.toLocaleUpperCase(LOCALE))

export function loadProfile(user) {
  return call('frappe.client.get', { doctype: 'User', name: user })
}

export function saveProfile(user, values) {
  return call('frappe.client.set_value', {
    doctype: 'User',
    name: user,
    fieldname: values,
  })
}

/** `logoutOthers`: also sign out every other device (this one stays signed in). */
export function changePassword(oldPassword, newPassword, logoutOthers = false) {
  return call('crm.api.user.change_password', {
    old_password: oldPassword,
    new_password: newPassword,
    ...(logoutOthers ? { logout_others: 1 } : {}),
  })
}

// Seguridad: doco's two-step verification (doco.docoutils.two_step) and
// sessions (doco.docoutils.sesiones). A site without them answers an error and
// the rows stay hidden.
const TWO_STEP = 'doco.docoutils.two_step.api.'
const SESSIONS = 'doco.docoutils.sesiones.'
const read = (method) => frappeRequest({ url: method, method: 'GET' })

/** { two_step: status | null, sessions: { count, current_device, current_kind } } */
export function loadSeguridad() {
  return read(`${TWO_STEP}seguridad`)
}

/** { uri, qr, key, issuer, expires_in }: a new key for the phone app. */
export function startTwoStep() {
  return call(`${TWO_STEP}empezar`)
}

/** { codes, status }: on, with its recovery codes shown this once. */
export function confirmTwoStep(code, password) {
  return call(`${TWO_STEP}confirmar`, { code, password })
}

export function newRecoveryCodes(password, code) {
  return call(`${TWO_STEP}nuevos_codigos`, { password, code })
}

export function turnOffTwoStep(password, code) {
  return call(`${TWO_STEP}desactivar`, { password, code })
}

/** { sessions: [{ id, device, kind, current, support, last_active, started }], trusted_devices } */
export function loadSessions() {
  return read(`${SESSIONS}sesiones`)
}

/** { closed, sesiones }: every other device signs out; this one stays. */
export function closeOtherSessions() {
  return call(`${SESSIONS}cerrar_otras`)
}

/** One other device signs out (Frappe's own, by the session's id). */
export function closeSession(id) {
  return call('frappe.core.doctype.user.user.clear_session', { sid_hash: id })
}

/** What the two-step row says under its title. */
export function twoStepLine(status) {
  if (!status) return ''
  if (status.enrolled && !status.asked)
    return t(
      'Signing in is not asking for your code. Open it to set it up again.',
    )
  if (!status.on)
    return t(
      'Off. Turn it on and signing in also asks for a code from your phone.',
    )
  const left = Number(status.codes_left || 0)
  if (!left) return t('On. You have no recovery codes left: make new ones.')
  return left === 1
    ? t('On. 1 recovery code left.')
    : t('On. {0} recovery codes left.', [left])
}

/** What the sessions row says under its title. */
export function sessionsLine(summary) {
  const count = Number(summary?.count || 0)
  if (count <= 1) return t('Only this device')
  return t('{0} devices, this one included', [count])
}

/** The recovery codes as a text file a person keeps. */
export function codesText(codes, issuer) {
  return [
    issuer ? t('Recovery codes for {0}', [issuer]) : t('Your recovery codes'),
    t('Each code works once, to sign in without your phone.'),
    '',
    ...(codes || []),
    '',
  ].join('\n')
}

/** Copy text; false when the browser refuses (no clipboard on plain http). */
export async function copyText(
  text,
  clipboard = globalThis.navigator?.clipboard,
) {
  if (!text || typeof clipboard?.writeText !== 'function') return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The app's six digits or a recovery code, the way the person typed it. */
export function cleanCode(value) {
  return String(value || '').trim()
}

export async function loadLanguages() {
  const rows = await call('frappe.client.get_list', {
    doctype: 'Language',
    fields: ['name', 'language_name'],
    filters: { enabled: 1 },
    order_by: 'language_name asc',
    limit_page_length: 0,
  })
  return (rows || []).map((row) => ({
    value: row.name,
    label: row.language_name || row.name,
  }))
}

/** The time zones the server accepts (IANA ids, never shown as they are). */
export async function loadTimezones() {
  const out = await call('frappe.core.doctype.user.user.get_timezones')
  return (out?.timezones || []).filter((zone) => typeof zone === 'string')
}

function genericName(zone, now) {
  try {
    return (
      new Intl.DateTimeFormat(LOCALE, {
        timeZone: zone,
        timeZoneName: 'longGeneric',
      })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')?.value || ''
    )
  } catch {
    return ''
  }
}

// The tz database spells its cities in English without accents; the ones in
// Mexico read as their people write them.
const CITIES_ES = {
  'America/Mexico_City': 'Ciudad de México',
  'America/Mazatlan': 'Mazatlán',
  'America/Merida': 'Mérida',
  'America/Cancun': 'Cancún',
  'America/Ciudad_Juarez': 'Ciudad Juárez',
  'America/Bahia_Banderas': 'Bahía de Banderas',
}

/** «Hora del Pacífico de México (Mazatlán)» for America/Mazatlan; '' for none. */
export function zoneLabel(zone, now = new Date()) {
  if (!zone) return ''
  const city =
    (LOCALE.startsWith('es') && CITIES_ES[zone]) ||
    String(zone).split('/').pop().replace(/_/g, ' ')
  const name = genericName(zone, now)
  return name && name !== city ? `${capital(name)} (${city})` : city
}

/**
 * The zones as the person reads them: the shop's own zone, the zones on the
 * same clock and the person's current one first, then every other by name.
 */
export function timezoneGroups(zones, { shop = '', mine = '', now } = {}) {
  const at = now || new Date()
  const rows = [...new Set(zones || [])].map((zone) => ({
    value: zone,
    label: zoneLabel(zone, at),
    clock: genericName(zone, at),
  }))
  const shopClock = shop ? genericName(shop, at) : ''
  const near = (row) =>
    row.value === shop ||
    row.value === mine ||
    (Boolean(shopClock) && row.clock === shopClock)
  const byLabel = (a, b) => a.label.localeCompare(b.label, LOCALE)
  const strip = ({ value, label }) => ({ value, label })
  return {
    suggested: rows.filter(near).sort(byLabel).map(strip),
    rest: rows
      .filter((row) => !near(row))
      .sort(byLabel)
      .map(strip),
  }
}

/** «Español (México)» for es-MX; the person's words, never the code. */
export function languageLabel(code) {
  if (!code) return ''
  try {
    const name = new Intl.DisplayNames(LOCALE, { type: 'language' }).of(code)
    if (name && name !== code) return capital(name)
  } catch {
    // an id Intl does not know
  }
  return t('Your current language')
}

/** A picture for the User's own photo, filed against the User. */
export async function uploadPhoto(user, file) {
  const body = new FormData()
  body.append('file', file, file.name)
  body.append('is_private', '0')
  body.append('doctype', 'User')
  body.append('docname', user)
  body.append('fieldname', 'user_image')
  const headers = { Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers,
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.message?.file_url)
    throw new Error(t('The photo did not upload. Try another picture.'))
  return data.message.file_url
}

/** The name as the person typed it, never a login. */
export function nameOf(doc) {
  const name = [doc?.first_name, doc?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || String(doc?.full_name || '').trim()
}

/**
 * What stops a new password, in the order the person fixes it (Ventas'
 * ChangePasswordModal rules); '' when it can be sent. The server decides.
 */
export function passwordProblem(current, next, confirm) {
  if (!current) return t('Type your current password.')
  if (!next) return t('Type the new password.')
  if (current === next)
    return t('The new password must be different from the current one.')
  if (next.length < 8) return t('The new password needs at least 8 characters.')
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,}$/.test(next))
    return t('Mix lowercase, uppercase, a number and a symbol.')
  if (next !== confirm) return t('The two new passwords do not match.')
  return ''
}
