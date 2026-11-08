import { call } from 'frappe-ui'
import { formatTime, parseServerDate, relativeTime } from '@/utils/display'

// Bancos conectados: the bank, card and SAT logins syncfy_connector keeps
// (Syncfy Connection) shown inside Bancos. Reads are crm.api.bancos
// (`conexiones`, `conexion`); every action is the connector's own endpoint,
// which checks the manager roles and the company again.
const CONNECT = 'syncfy_connector.api.connect'
const CONNECTIONS = 'syncfy_connector.api.connections'

// What changes a login's state, its accounts or the movements that wait.
export const LIVE_CONEXIONES = Object.freeze([
  'Syncfy Connection',
  'Syncfy Account',
  'Syncfy Transaction',
])

function connector(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = value
  }
  return call(method, params)
}

export const syncfy = {
  context: (company) => connector(`${CONNECT}.context`, { company }),
  widgetSession: (company) =>
    connector(`${CONNECT}.widget_session`, { company }),
  register: (company, idCredential, idJob) =>
    connector(`${CONNECT}.register`, {
      company,
      id_credential: idCredential,
      id_job: idJob,
    }),
  syncNow: (name) => connector(`${CONNECTIONS}.sync_now`, { name }),
  pull: (name) => connector(`${CONNECTIONS}.pull`, { name }),
  disconnect: (name) => connector(`${CONNECTIONS}.disconnect`, { name }),
  linkFiscal: (name, replace = 0) =>
    connector(`${CONNECTIONS}.link_fiscal`, { name, replace }),
  accountContext: (name) =>
    connector(`${CONNECTIONS}.account_context`, { name }),
  suggestImportFrom: (bankAccount) =>
    connector(`${CONNECTIONS}.suggest_import_from`, {
      bank_account: bankAccount,
    }),
  linkAccount: (name, args) =>
    connector(`${CONNECTIONS}.link_account`, { name, ...args }),
  retryMovement: (name) => connector(`${CONNECTIONS}.retry_movement`, { name }),
  skipMovement: (name, reason) =>
    connector(`${CONNECTIONS}.skip_movement`, { name, reason }),
}

/** The one filled button of a login, by the step the server named. */
export function stepLabel(conexion) {
  switch (conexion?.step) {
    case 'sync':
      return conexion.status === 'Error'
        ? 'Intentar de nuevo'
        : 'Sincronizar ahora'
    case 'code':
      return conexion.status === 'Waiting for code'
        ? 'Escribir el código'
        : 'Sincronizar con código'
    case 'reconnect':
      return 'Reconectar'
    case 'connect':
      return 'Conectar de nuevo'
    case 'disconnect':
      return 'Desconectar'
    default:
      return ''
  }
}

// What someone without the manager role reads where the button would be, by step.
const ASK = {
  sync: 'Quien administra Bancos puede sincronizarla.',
  code: 'Quien administra Bancos puede sincronizarla con el código.',
  reconnect: 'Pide a quien administra Bancos que la reconecte.',
  connect: 'Quien administra Bancos puede conectarla de nuevo.',
  disconnect: 'Pide a quien administra Bancos que la desconecte.',
}
export function askText(conexion) {
  if (!conexion?.step) return ''
  if (conexion.step === 'sync' && conexion.tone === 'needs')
    return 'Pide a quien administra Bancos que la revise.'
  return ASK[conexion.step] || ''
}

// Literal classes per tone, kept here rather than in a shared status module:
// a shared import re-chunks routes past the bundle budget.
const TONE_INK = {
  needs: 'text-ink-amber-8',
  busy: 'text-ink-gray-6',
  wait: 'text-ink-gray-6',
  ok: 'text-ink-gray-6',
  off: 'text-ink-gray-5',
}
export function toneInk(tone) {
  return TONE_INK[tone] || TONE_INK.ok
}

/** Syncfy's cool-down after a sync: «Syncfy deja sincronizar otra vez a las 14:05.», or ''. */
export function readyText(conexion, now = new Date()) {
  // The cool-down holds back a sync; disconnecting or connecting again is no sync.
  if (conexion?.step === 'disconnect' || conexion?.step === 'connect') return ''
  const at = parseServerDate(conexion?.ready_at)
  if (!at || at <= now) return ''
  return `Syncfy deja sincronizar otra vez a las ${formatTime(at)}.`
}

/**
 * An account under its login's header: the connector writes «Acme Bank ·
 * ACME Checking · ••0001»; the header already names the bank, so the row
 * reads «ACME Checking ••0001».
 */
export function syncfyAccountTitle(account, conexion) {
  const parts = String(account?.label || '')
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean)
  const bank = conexionBank(conexion)
  if (parts.length > 1 && bank && parts[0] === bank) parts.shift()
  let text = parts.join(' ')
  if (account?.last4 && !text.includes(`••${account.last4}`))
    text = `${text} ••${account.last4}`
  return text.trim() || 'Cuenta'
}

/**
 * The bank a login is at: the server's `bank`, or «Acme Bank» from the
 * connector's title «Acme Bank · t**t».
 */
export function conexionBank(conexion) {
  if (conexion?.bank) return conexion.bank
  return String(conexion?.title || '')
    .split(' · ')[0]
    .trim()
}

/** A login in full, where it must not be mistaken: «Acme Bank, usuario t**t». */
export function conexionFullName(conexion) {
  const bank = conexionBank(conexion) || 'Conexión'
  return conexion?.user ? `${bank}, ${conexion.user}` : bank
}

/**
 * A login's name in a list: its bank, and who logs in only when another
 * login in `all` is at the same bank.
 */
export function conexionName(conexion, all = []) {
  const bank = conexionBank(conexion)
  const twin = all.some(
    (c) => c.name !== conexion?.name && conexionBank(c) === bank,
  )
  return twin ? conexionFullName(conexion) : bank || 'Conexión'
}

/**
 * Two names of one account read as the same: «ACME Checking» and «ACME
 * Checking ••0001», whatever the accents, case or punctuation.
 */
export function sameAccountName(a, b) {
  const plain = (s) =>
    String(s || '')
      .replace(/••\s*\d+/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  return !!plain(a) && plain(a) === plain(b)
}

/**
 * The chip on Bancos' total for the logins that need the person: one names
 * its bank and state («Acme Bank: hay que reconectar»), several are counted.
 */
export function needsChipText(logins) {
  const list = logins || []
  if (list.length > 1) return `${list.length} conexiones necesitan atención`
  const [c] = list
  if (!c) return ''
  const word = c.word || 'Necesita atención'
  const bank = conexionBank(c)
  return bank
    ? `${bank}: ${word.charAt(0).toLowerCase()}${word.slice(1)}`
    : word
}

/** A Bank Account as a person names it: «BBVA Oro ••9775», not «BBVA Oro - BBVA Mexico». */
export function bankAccountLabel(b) {
  let text = String(b?.name || '')
  const suffix = b?.bank ? ` - ${b.bank}` : ''
  if (suffix && text.endsWith(suffix)) text = text.slice(0, -suffix.length)
  const last4 = String(b?.bank_account_no || '')
    .replace(/\D/g, '')
    .slice(-4)
  if (last4.length === 4 && !text.includes(last4)) text = `${text} ••${last4}`
  return text.trim() || String(b?.name || '')
}

/** The quiet second line of a login that works: when the bank last answered. */
export function refreshedText(conexion, now = new Date()) {
  const at = parseServerDate(conexion?.refreshed_at)
  return at ? `Actualizada ${relativeTime(at, { now })}` : ''
}

/** The row's second line: the state word, or for a login that works, its freshness. */
export function conexionLine(conexion, now = new Date()) {
  if (conexion?.tone !== 'ok') return conexion?.word || ''
  const line = refreshedText(conexion, now) || conexion.word || ''
  // Two logins at one bank read apart: the one that asks a code says so
  // first, where a narrow row still shows it.
  if (!conexion.asks_code) return line
  return line
    ? `Pide código, ${line.charAt(0).toLowerCase()}${line.slice(1)}`
    : 'Pide código'
}

/**
 * A login's line in the Bancos list. One that needs the person already shows
 * its state in the amber chip beside it, so the line gives the reason instead.
 */
export function conexionListLine(conexion, now = new Date()) {
  if (conexion?.tone !== 'needs') return conexionLine(conexion, now)
  return conexion.detail || refreshedText(conexion, now) || ''
}

/** Movements that wait for the person on one account or a whole login. */
export function waitingOf(conexion) {
  const out = { revisar: 0, sin_enlazar: 0 }
  const add = (w) => {
    out.revisar += Number(w?.revisar) || 0
    out.sin_enlazar += Number(w?.sin_enlazar) || 0
  }
  if (conexion?.waiting) add(conexion.waiting)
  for (const account of conexion?.accounts || []) add(account.waiting)
  return out
}

/** A count in es-MX digits: «7,562». */
export function countText(n) {
  return Number(n || 0).toLocaleString('es-MX')
}

export function waitingText({ revisar = 0, sin_enlazar = 0 } = {}) {
  const parts = []
  if (revisar) parts.push(`${countText(revisar)} por revisar`)
  if (sin_enlazar)
    parts.push(
      sin_enlazar === 1
        ? '1 espera una cuenta'
        : `${countText(sin_enlazar)} esperan una cuenta`,
    )
  return parts.join(', ')
}

/** What an unlinked account holds back: «234 movimientos esperan». */
export function movementsWaiting(n) {
  return n === 1 ? '1 movimiento espera' : `${countText(n)} movimientos esperan`
}

/** «Cuentas sin enlazar» first: an account that feeds nothing holds its movements. */
export function unlinkedAccounts(conexion) {
  return (conexion?.accounts || []).filter((a) => !a.linked && a.type !== 'Tax')
}

/** The job id the widget reports in `credential.status` («…/jobs/<id>/status»). */
export function jobOf(credential) {
  const found = /jobs\/([a-f0-9]{24})\/status/.exec(credential?.status || '')
  return found ? found[1] : null
}

/** «BBVA Debito - GD» → «BBVA Debito»: ledger names without the company suffix. */
export function ledgerLabel(name) {
  return String(name || '').replace(/ - [A-Z0-9_]{1,8}$/, '')
}

// Syncfy organization types per «what do you connect» chip.
export const QUE_CONECTAS = Object.freeze([
  { value: 'banco', label: 'Banco o tarjeta', types: ['Bank'] },
  { value: 'sat', label: 'SAT (facturas)', types: ['Government'] },
  { value: 'monedero', label: 'Monedero', types: ['Digital Wallet'] },
  { value: 'todo', label: 'Otra institución', types: [] },
])
