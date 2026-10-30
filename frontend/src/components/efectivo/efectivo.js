import { call } from 'frappe-ui'
import { formatMoney } from '@/utils/display'

// Efectivo (Shell-S14): POS Awesome's cash custody in the shell. Reads come
// from posawesome's shell read (api/cash_custody/shell.py); every step is the
// custody command POS itself sends, with its own guards, scope and request ID.
const POSA = 'posawesome.posawesome.api'
const READ = `${POSA}.cash_custody.shell`

export const homeRead = () => call(`${READ}.home`, { history_limit: 20 })
export const bagRead = (name) => call(`${READ}.bag`, { name })

/** A request ID the custody server accepts (16–80 letters, digits, - and _). */
export function newRequestId() {
  const bytes = new Uint8Array(12)
  globalThis.crypto?.getRandomValues?.(bytes)
  const tail = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )
  return `shell-${Date.now().toString(36)}-${tail}`
}

/**
 * One instruction keeps its request ID until the server answers it: a retry
 * after a lost answer replays the committed result instead of moving the cash
 * twice. A refusal (the server said why) frees it; a dropped connection keeps it.
 */
export function oneInstruction() {
  let id = ''
  return {
    get id() {
      if (!id) id = newRequestId()
      return id
    },
    async send(fn) {
      try {
        const result = await fn(this.id)
        id = ''
        return result
      } catch (error) {
        if (answered(error)) id = ''
        throw error
      }
    },
    reset() {
      id = ''
    },
  }
}

function answered(error) {
  const status = Number(error?.status) || 0
  return Boolean(
    error?.messages?.length ||
      error?.exc_type ||
      (status >= 400 && status < 500),
  )
}

/** The safe a custody command names: a store safe by name, a register's own safe by its profile. */
function target(safe) {
  return safe.store ? { safe: safe.safe } : { pos_profile: safe.pos_profile }
}

/** `service.command`: prepare, verify, unpack, dispatch, confirm_bank, return_bank, count_safe, review, transfer_safe, fund. */
export function custody(action, safe, payload, requestId) {
  return call(`${POSA}.cash_custody.service.command`, {
    action,
    payload: JSON.stringify({
      ...target(safe),
      ...payload,
      request_id: requestId,
    }),
  })
}

export const assignRequest = (request, requestId) =>
  call(`${POSA}.cash_transfer.requests.assign`, {
    request_id: requestId,
    request: request.name,
    expected_revision: request.revision,
    source_kind: 'Safe',
  })
export const declineRequest = (request, reason, requestId) =>
  call(`${POSA}.cash_transfer.requests.decline`, {
    request_id: requestId,
    request: request.name,
    expected_revision: request.revision,
    reason,
  })

/** A safe-sourced transfer: seal what leaves the safe, then hand it over. */
export const prepareTransfer = (transfer, count, requestId) =>
  call(`${POSA}.cash_transfer.transfers.prepare`, {
    request_id: requestId,
    transfer: transfer.name,
    expected_revision: transfer.revision,
    count: JSON.stringify(minorCount(count)),
  })
export const dispatchTransfer = (transfer, count, requestId) =>
  call(`${POSA}.cash_transfer.transfers.dispatch`, {
    request_id: requestId,
    transfer: transfer.name,
    expected_revision: transfer.revision,
    count: JSON.stringify(minorCount(count)),
  })
export const cancelTransfer = (transfer, reason, requestId) =>
  call(`${POSA}.cash_transfer.transfers.cancel`, {
    request_id: requestId,
    transfer: transfer.name,
    expected_revision: transfer.revision,
    reason,
  })

/** One-hour, one-use authorization; the password goes to the server and nowhere else. */
export const authorizePosting = (row, reason, password) =>
  call(`${POSA}.cash_resources.authorize_posting`, {
    document_type: row.document_type,
    document_name: row.document_name,
    event: row.event,
    reason,
    password,
  })

/** Accounts a custodian may bring outside money from («Ingresar efectivo»). */
export const fundSources = (safe) =>
  call(`${POSA}.cash_custody.service.fund_sources`, target(safe))

/**
 * A bag's handover sheet (`slip`) or the tag that travels on it (`label`),
 * printed from a window opened on the tap so the browser does not block it.
 */
export async function printEvidence(doctype, name, layout = 'slip') {
  const popup = window.open('', '_blank')
  if (!popup)
    throw new Error(
      'Permite las ventanas emergentes de este sitio para imprimir.',
    )
  try {
    const html = await call(`${POSA}.cash_custody.printing.evidence`, {
      doctype,
      name,
      layout,
    })
    popup.opener = null
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    popup.focus()
    popup.print()
  } catch (error) {
    popup.close()
    throw error
  }
}

export const listPhotos = (doctype, name) =>
  call(`${POSA}.cash_custody.photos.list_photos`, { doctype, name })
export const uploadPhoto = (doctype, name, content) =>
  call(`${POSA}.cash_custody.photos.upload_photo`, { doctype, name, content })

// Counting ---------------------------------------------------------------

/** MXN faces in centavos, bills then coins: how a cashier counts. */
const FACES = {
  MXN: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50],
  USD: [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1],
}
export const facesFor = (currency) => FACES[currency] || FACES.MXN

/** rows: {face (centavos): quantity} → total in centavos (integers only). */
export function totalMinor(rows) {
  let total = 0
  for (const [face, quantity] of Object.entries(rows || {})) {
    const q = Number(quantity)
    if (Number.isInteger(q) && q > 0) total += Number(face) * q
  }
  return total
}

/** The custody count (`model.count`): faces in major units. */
export function custodyCount(rows) {
  return {
    source: 'denominations',
    denominations: Object.entries(rows || {})
      .filter(([, q]) => Number(q) > 0)
      .map(([face, quantity]) => ({
        value: Number(face) / 100,
        quantity: Number(quantity),
      })),
  }
}

/** The transfer count (`cash_transfer`): faces in minor units, as strings. */
export function minorCount(rows) {
  return {
    source: 'denominations',
    denominations: Object.entries(rows || {})
      .filter(([, q]) => Number(q) > 0)
      .map(([face, quantity]) => ({
        value_minor: String(face),
        quantity: Number(quantity),
      })),
  }
}

export const fromMinor = (minor) => (Number(minor) || 0) / 100

export function money(amount, currency = 'MXN') {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount) || 0
  const text = formatMoney(Math.abs(n), currency)
  return n < 0 ? `−${text}` : text
}

/** «$500» for a face, «50¢» under a peso. */
export function faceLabel(face) {
  return face >= 100 ? `$${(face / 100).toLocaleString('es-MX')}` : `${face}¢`
}

// Words ------------------------------------------------------------------

export const BAG_STATES = {
  Unverified: { label: 'Sellada, falta verificar', tone: 'warning' },
  Available: { label: 'Sellada y verificada', tone: 'neutral' },
  Disputed: { label: 'Con diferencia', tone: 'danger' },
  'In Transit': { label: 'En camino al banco', tone: 'info' },
  Deposited: { label: 'Depositada', tone: 'neutral' },
  Issued: { label: 'Entregada a una caja', tone: 'neutral' },
  Unpacked: { label: 'Regresó a la caja fuerte', tone: 'neutral' },
  Transferred: { label: 'Salió completa', tone: 'neutral' },
}
export const bagState = (state) =>
  BAG_STATES[state] || { label: state || '', tone: 'neutral' }

export const PURPOSE = { Float: 'Fondo para una caja', Takings: 'Recaudación' }

/** First name of a person, never an email. */
export function who(user, people = {}) {
  if (!user) return ''
  return people[user] || String(user).split('@')[0]
}

/** «La tiene Karla, rumbo al banco»: who answers for the cash right now. */
export function holderText(bag, people = {}) {
  const h = bag?.holder || {}
  const name = who(h.user, people)
  switch (h.kind) {
    case 'safe':
      return name ? `En la caja fuerte · responde ${name}` : 'En la caja fuerte'
    case 'carrier':
      return name ? `La lleva ${name} al banco` : 'Rumbo al banco'
    case 'bank':
      return bag.deposit_reference
        ? `En el banco · ficha ${bag.deposit_reference}`
        : 'En el banco'
    case 'drawer':
      return name ? `En la caja de ${name}` : 'En una caja'
    case 'loose':
      return 'Suelta en la caja fuerte'
    case 'offsite':
      return name
        ? `Fuera de la tienda · la envió ${name}`
        : 'Fuera de la tienda'
    default:
      return ''
  }
}

/** The next step of a bag for this worker: {action, label} or a guard {reason}. */
export function bagStep(bag, safe, me) {
  const can = safe?.can || {}
  switch (bag?.state) {
    case 'Unverified':
      if (!can.verify)
        return { reason: 'La verifica quien cuida la caja fuerte.' }
      if (bag.prepared_by === me)
        return {
          reason:
            'Tú la sellaste: otra persona la cuenta y la verifica. Pídeselo a quien cuida la caja fuerte contigo.',
        }
      return { action: 'verify', label: 'Contar y verificar' }
    case 'Available':
      if (can.dispatch) return { action: 'dispatch', label: 'Llevar al banco' }
      if (bag.purpose === 'Float')
        return {
          reason: 'El fondo espera a que su caja lo reciba en el POS.',
        }
      return { reason: 'La lleva al banco quien tiene ese encargo.' }
    case 'In Transit':
      if (can.confirm_bank)
        return { action: 'confirm_bank', label: 'Registrar el depósito' }
      return {
        reason:
          'El depósito lo registra quien revisa las cuentas, con la ficha del banco.',
      }
    case 'Disputed':
      if (!can.review)
        return {
          reason: 'La diferencia la resuelve quien revisa las cuentas.',
        }
      return { action: 'review', label: 'Resolver la diferencia' }
    default:
      return null
  }
}

/** The worker's sentence for a failed call: the server's own message, never a traceback. */
export function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  if (!message || /Traceback|Error \d{3}|^[A-Z][a-zA-Z]+Error/.test(message))
    return 'Revisa tu conexión e inténtalo de nuevo. Si ya contaste el efectivo, no lo vuelvas a mover: reintenta y el sistema no lo registra dos veces.'
  return message
}

export const WAITING_LABELS = {
  verify: 'Contar y verificar',
  dispatch: 'Llevar al banco',
  confirm_bank: 'Registrar el depósito',
  review: 'Resolver la diferencia',
  assign: 'Cambio que pide una caja',
  prepare: 'Preparar traslado',
  dispatch_transfer: 'Entregar traslado',
}
