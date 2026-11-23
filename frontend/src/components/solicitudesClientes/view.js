// «Solicitudes de clientes» (/negocio/solicitudes-clientes): what customers ask
// the shop from their app, as staff read it (doco.docoutils.storefront_support_staff).
// The cell owns the queues, the states, the due dates and which steps are
// possible; this module words them, builds the rows and the sheet's facts and
// buttons, and says what a step sends. Pure: no Vue, no calls.
import { documentRoute } from '@/documentos/registry'
import { money } from '@/components/appClientes/view'
import {
  dayDiff,
  formatDate,
  formatTime,
  parseServerDate,
} from '@/utils/display'

export const CTX = 'SolicitudesClientes'
export const ALL = 'todas'
export const QUEUES = Object.freeze([
  'devoluciones',
  'garantias',
  'datos',
  'bajas',
  'pagos',
])
/** Steps the customer hears about in their app (rules.TOLD). */
const TOLD = Object.freeze({
  return: ['aceptar', 'programar', 'rechazar', 'resolver'],
  arco: ['aceptar', 'rechazar', 'resolver'],
})
export const REASON_MAX = 240
// The cell's rules.MODES: the shop picks the product up (recoleccion), the
// customer brings it in (visita), the customer collects it at the shop
// (entrega_en_tienda: the replacement or the repaired piece).
export const MODES = Object.freeze([
  'recoleccion',
  'visita',
  'entrega_en_tienda',
])

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value : [])

// Literal class names: an icon class built at runtime is never generated.
const QUEUE_ICON = Object.freeze({
  devoluciones: 'lucide-undo-2',
  garantias: 'lucide-shield-check',
  datos: 'lucide-lock',
  bajas: 'lucide-trash-2',
  pagos: 'lucide-hand-coins',
})

export function queueLabel(key) {
  if (key === 'devoluciones') return __('Returns', null, CTX)
  if (key === 'garantias') return __('Warranty', null, CTX)
  if (key === 'datos') return __('Personal data', null, CTX)
  if (key === 'bajas') return __('Closed accounts', null, CTX)
  if (key === 'pagos') return __('Payments to check', null, CTX)
  return __('All', null, CTX)
}

/**
 * The queue chips, «Todas» first (value '', the ChipGroup's way back), each
 * with what waits in it; a queue the person does not read never comes.
 */
export function queueChips(queues) {
  const chips = []
  for (const queue of list(queues)) {
    const key = text(queue?.key)
    if (key !== ALL && !QUEUES.includes(key)) continue
    const count = Number(queue?.count) || 0
    chips.push({
      value: key === ALL ? '' : key,
      label: queueLabel(key),
      count,
      title: Number(queue?.overdue)
        ? __('{0} overdue', [Number(queue.overdue)], CTX)
        : undefined,
    })
  }
  const all = chips.findIndex((chip) => chip.value === '')
  return all > 0
    ? [chips[all], ...chips.slice(0, all), ...chips.slice(all + 1)]
    : chips
}

/** What the request is about, in the worker's words. */
export function kindLabel(kind) {
  switch (kind) {
    case 'devolucion':
      return __('Return', null, CTX)
    case 'garantia':
      return __('Warranty request', null, CTX)
    case 'acceso':
      return __('Wants to see their data', null, CTX)
    case 'rectificacion':
      return __('Wants their data corrected', null, CTX)
    case 'cancelacion':
      return __('Wants their data deleted', null, CTX)
    case 'oposicion':
      return __('Wants a use of their data stopped', null, CTX)
    case 'arco':
      return __('Privacy request', null, CTX)
    case 'baja':
      return __('Deleted their account', null, CTX)
    case 'pago':
      return __('Online payment', null, CTX)
    case 'recarga':
      return __('Top-up', null, CTX)
    default:
      return __('Request', null, CTX)
  }
}

/** Why: the customer's reason for a return, or what is wrong with the money. */
export function reasonLabel(reason) {
  switch (reason) {
    case 'defectuoso':
      return __('Defective', null, CTX)
    case 'equivocado':
      return __('Wrong product', null, CTX)
    case 'no_como_esperaba':
      return __('Not what they expected', null, CTX)
    case 'otro':
      return __('Another reason', null, CTX)
    case 'unbooked':
      return __('Charged but not recorded', null, CTX)
    case 'unknown':
      return __('The card’s answer never came', null, CTX)
    case 'stalled':
      return __('Still waiting after its time', null, CTX)
    case 'review':
      return __('The carrier’s answer is uncertain', null, CTX)
    case 'payback':
      return __('Pay the customer back by hand', null, CTX)
    default:
      return ''
  }
}

/** What to do about the money, one sentence per reason (the sheet's guide). */
export function reasonHelp(reason) {
  switch (reason) {
    case 'unbooked':
      return __(
        'The gateway took the money. Fix what blocks the books (a closed period, a missing account), then retry.',
        null,
        CTX,
      )
    case 'unknown':
      return __(
        'Check in the gateway whether the card was charged before the customer pays again.',
        null,
        CTX,
      )
    case 'stalled':
      return __(
        'Check the amount and the currency in the gateway; retry once it shows paid.',
        null,
        CTX,
      )
    case 'review':
      return __(
        'Never refund it while the carrier checks it: the nightly check marks it delivered or failed.',
        null,
        CTX,
      )
    case 'payback':
      return __(
        'It was not sent and could not be paid back by itself. Pay the customer back, then mark it resolved.',
        null,
        CTX,
      )
    default:
      return ''
  }
}

/** The sheet's one guiding sentence for what staff must do, or ''. */
export function guideText(detail) {
  if (detail?.queue === 'bajas')
    return __(
      'Remove their contact details from the customer record where the law allows; invoices and fiscal records stay.',
      null,
      CTX,
    )
  if (detail?.queue === 'pagos') return reasonHelp(detail.reason)
  return ''
}

/** The schedule form's choice: who moves the product. */
export function modeChoice(mode) {
  if (mode === 'recoleccion') return __('We pick it up', null, CTX)
  if (mode === 'entrega_en_tienda')
    return __('They collect it at the shop', null, CTX)
  return __('They bring it', null, CTX)
}

/** What was scheduled, as the sheet's fact and the row's chip name it. */
export function modeLabel(mode) {
  if (mode === 'recoleccion') return __('Pickup', null, CTX)
  if (mode === 'entrega_en_tienda')
    return __('Hand-over at the shop', null, CTX)
  return __('Visit to the shop', null, CTX)
}

function modeChip(mode, day) {
  if (mode === 'recoleccion') return __('Pickup {0}', [day], CTX)
  if (mode === 'entrega_en_tienda') return __('At the shop {0}', [day], CTX)
  if (mode === 'visita') return __('Visit {0}', [day], CTX)
  return __('Scheduled {0}', [day], CTX)
}

function modeToday(mode) {
  if (mode === 'recoleccion') return __('Pickup today', null, CTX)
  if (mode === 'entrega_en_tienda') return __('At the shop today', null, CTX)
  if (mode === 'visita') return __('Visit today', null, CTX)
  return __('Scheduled today', null, CTX)
}

/** {label, tone} of the request's state (StatusChip). */
export function stateChip(state) {
  switch (state) {
    case 'open':
      return { label: __('New', null, CTX), tone: 'info' }
    case 'in_progress':
      return { label: __('In progress', null, CTX), tone: 'neutral' }
    case 'resolved':
      return { label: __('Resolved', null, CTX), tone: 'success' }
    case 'rejected':
      return { label: __('Rejected', null, CTX), tone: 'neutral' }
    case 'closed':
      return { label: __('Closed', null, CTX), tone: 'neutral' }
    default:
      return null
  }
}

const OPEN = new Set(['open', 'in_progress'])
const isReturn = (queue) => queue === 'devoluciones' || queue === 'garantias'

function shortDay(value, now) {
  return formatDate(value, { now, relative: false })
}

/**
 * The due chip of an open request, or null: a privacy request's legal day to
 * answer by («Vence 30 nov», red once past), a return's scheduled pickup,
 * visit or hand-over («Recolección 25 nov»).
 */
export function dueChip(item, now = new Date()) {
  if (!item?.due || !OPEN.has(item.state)) return null
  const date = parseServerDate(item.due)
  if (!date) return null
  const days = dayDiff(date, now)
  if (isReturn(item.queue)) {
    const mode = item.scheduled?.mode
    if (days === 0) return { label: modeToday(mode), tone: 'warning' }
    return {
      label: modeChip(mode, shortDay(date, now)),
      tone: days < 0 ? 'danger' : 'neutral',
    }
  }
  if (days < 0)
    return {
      label: __('Overdue since {0}', [shortDay(date, now)], CTX),
      tone: 'danger',
    }
  if (days === 0) return { label: __('Due today', null, CTX), tone: 'warning' }
  return {
    label: __('Due {0}', [shortDay(date, now)], CTX),
    tone: days <= 2 ? 'warning' : 'neutral',
  }
}

/** One list row: who asks, what about and since when, the money, its chip. */
// Mid-line, a reason reads as part of the sentence («Garantía, defectuoso»).
const lowerFirst = (value) =>
  value ? value.charAt(0).toLocaleLowerCase() + value.slice(1) : value

export function itemRow(item, now = new Date()) {
  const parts = [kindLabel(item?.kind)]
  const reason = reasonLabel(item?.reason)
  if (reason) parts.push(lowerFirst(reason))
  const asked = item?.date ? formatDate(item.date, { now }) : ''
  if (asked) parts.push(asked)
  const due = dueChip(item, now)
  return {
    id: text(item?.id),
    who: text(item?.who) || __('Customer', null, CTX),
    line: parts.join(', '),
    icon: QUEUE_ICON[item?.queue] || 'lucide-inbox',
    amount:
      item?.amount === null || item?.amount === undefined
        ? ''
        : money(item.amount, item.currency || ''),
    due,
    state: due ? null : stateChip(item?.state),
  }
}

/** The sheet's line under the name: what it is about and why. */
export function detailSubtitle(detail) {
  if (!detail) return ''
  const reason = reasonLabel(detail.reason)
  const kind = kindLabel(detail.kind)
  return reason ? `${kind}, ${lowerFirst(reason)}` : kind
}

export function itemRows(items, queue = '', now = new Date()) {
  const rows = []
  for (const item of list(items))
    if (!queue || item?.queue === queue) rows.push(itemRow(item, now))
  return rows
}

/** What an empty list says: nothing waits here, or nothing closed yet. */
export function emptyText(queue, closed) {
  if (closed)
    return {
      title: __('Nothing closed in the last 60 days', null, CTX),
      message: '',
    }
  return {
    title: queue
      ? __('Nothing waiting in {0}', [queueLabel(queue)], CTX)
      : __('Nothing waiting', null, CTX),
    message: __(
      'When a customer asks for something from the app, it shows here.',
      null,
      CTX,
    ),
  }
}

// --- the sheet --------------------------------------------------------------

/** Where a linked document opens: its /crm page, a sibling app, or nothing. */
export function documentLink(ref, boot = null) {
  const doctype = text(ref?.doctype)
  const name = text(ref?.name)
  if (!doctype || !name) return null
  if (doctype === 'Repair Order')
    return { href: `/taller/orders/${encodeURIComponent(name)}` }
  if (doctype === 'Customer')
    return { to: `/contactos/customer/${encodeURIComponent(name)}` }
  const route = documentRoute(doctype, name, { boot })
  return route ? { to: route } : null
}

function docLabel(doctype) {
  switch (doctype) {
    case 'Sales Order':
      return __('Order', null, CTX)
    case 'Sales Invoice':
      return __('Invoice', null, CTX)
    case 'POS Invoice':
      return __('Ticket', null, CTX)
    case 'Repair Order':
      return __('Repair', null, CTX)
    case 'Storefront Debt Payment':
      return __('Online payment', null, CTX)
    case 'Saldo Transaction':
      return __('Top-up', null, CTX)
    default:
      return __('Document', null, CTX)
  }
}

/** The sheet's facts: [{key, label, value, link?}] in reading order. */
export function detailFacts(detail, { boot = null, now = new Date() } = {}) {
  const facts = []
  if (!detail) return facts
  if (detail.ref?.name)
    facts.push({
      key: 'ref',
      label: docLabel(detail.ref.doctype),
      value: detail.ref.name,
      link: documentLink(detail.ref, boot),
    })
  if (detail.customer?.name)
    facts.push({
      key: 'customer',
      label: __('Customer', null, CTX),
      value: text(detail.customer.label) || detail.customer.name,
      link: documentLink({ doctype: 'Customer', name: detail.customer.name }),
    })
  if (detail.amount !== null && detail.amount !== undefined)
    facts.push({
      key: 'amount',
      label: __('Amount', null, CTX),
      value: money(detail.amount, detail.currency || ''),
    })
  const reason = reasonLabel(detail.reason)
  if (reason)
    facts.push({ key: 'reason', label: __('Why', null, CTX), value: reason })
  if (detail.date)
    facts.push({
      key: 'date',
      label: __('Asked', null, CTX),
      value:
        `${formatDate(detail.date, { now })} ${formatTime(detail.date)}`.trim(),
    })
  if (detail.scheduled?.when) {
    facts.push({
      key: 'scheduled',
      label: modeLabel(detail.scheduled.mode),
      value: whenText(detail.scheduled.when, now),
    })
    if (text(detail.scheduled.note))
      facts.push({
        key: 'scheduled-note',
        label: __('Note', null, CTX),
        value: text(detail.scheduled.note),
      })
  }
  for (const doc of list(detail.documents))
    if (doc?.name)
      facts.push({
        key: `doc:${doc.doctype}:${doc.name}`,
        label: docLabel(doc.doctype),
        value: doc.name,
        link: documentLink(doc, boot),
      })
  return facts
}

/** «25 nov, 10:30» (a day without an hour is the day alone). */
export function whenText(value, now = new Date()) {
  const date = parseServerDate(value)
  if (!date) return ''
  const day = formatDate(date, { now, relative: false })
  return date.getHours() || date.getMinutes()
    ? `${day}, ${formatTime(date)}`
    : day
}

export const phoneDigits = (value) => String(value || '').replace(/[^+\d]/g, '')

/** The ways to reach the person: [{key, label, icon, href}] (llamar, WhatsApp, correo). */
export function reachLinks(contact) {
  const links = []
  const phone = phoneDigits(contact?.phone)
  if (phone.replace(/\D/g, '').length >= 7) {
    links.push({
      key: 'llamar',
      label: __('Call', null, CTX),
      icon: 'lucide-phone',
      href: `tel:${phone}`,
    })
    links.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'lucide-message-circle',
      href: `https://wa.me/${phone.replace(/\D/g, '')}`,
    })
  }
  const email = text(contact?.email)
  if (/^[^\s@]+@[^\s@]+$/.test(email))
    links.push({
      key: 'correo',
      label: __('Email', null, CTX),
      icon: 'lucide-mail',
      href: `mailto:${email}`,
    })
  return links
}

function family(detail) {
  const queue = detail?.queue
  if (isReturn(queue)) return 'return'
  if (queue === 'datos') return 'arco'
  if (queue === 'bajas') return 'baja'
  if (detail?.kind === 'recarga') return 'topup'
  return 'payment'
}

/** Whether a step's words reach the customer (their Avisos are on). */
export function tellsCustomer(detail, action) {
  return (
    detail?.notifies === true && (TOLD[family(detail)] || []).includes(action)
  )
}

/** Whether the sheet shows the message box: some step tells the customer. */
export function hasMessage(detail) {
  return list(detail?.actions).some((action) => tellsCustomer(detail, action))
}

function actionLabel(action, fam) {
  if (action === 'aceptar')
    return fam === 'baja' ? __('Start', null, CTX) : __('Accept', null, CTX)
  if (action === 'programar') return __('Schedule', null, CTX)
  if (action === 'rechazar') return __('Reject', null, CTX)
  if (action === 'reintentar') return __('Retry', null, CTX)
  return __('Mark resolved', null, CTX)
}

/**
 * The sheet's buttons, the filled one last: the next step of where the
 * request is (accept a new one, resolve one in progress, retry a payment).
 * [{action, label, primary}]
 */
export function actionButtons(detail) {
  const fam = family(detail)
  const actions = list(detail?.actions)
  if (!actions.length) return []
  let primary
  if (fam === 'payment' && actions.includes('reintentar'))
    primary = detail?.reason === 'unbooked' ? 'reintentar' : 'resolver'
  else if (actions.includes('aceptar') && fam !== 'baja') primary = 'aceptar'
  else if (actions.includes('resolver')) primary = 'resolver'
  else primary = actions[0]
  const order = ['rechazar', 'programar', 'reintentar', 'aceptar', 'resolver']
  const rest = order.filter((a) => a !== primary && actions.includes(a))
  return [
    ...rest.map((action) => ({
      action,
      label: actionLabel(action, fam),
      primary: false,
    })),
    { action: primary, label: actionLabel(primary, fam), primary: true },
  ]
}

/** Why a step cannot go yet, in the field it belongs to, or ''. */
export function stepProblem(action, draft) {
  const reason = text(draft?.reason)
  if (action === 'rechazar' && reason.length < 3)
    return __('Write why: the customer reads it.', null, CTX)
  if (reason.length > REASON_MAX)
    return __('At most {0} characters.', [REASON_MAX], CTX)
  if (action === 'programar') {
    if (!MODES.includes(draft?.mode))
      return __('Choose pickup or visit.', null, CTX)
    if (!text(draft?.when)) return __('Choose the day.', null, CTX)
  }
  return ''
}

/** What `act` receives for a step. */
export function stepPayload(id, action, draft) {
  const payload = { id, action }
  const reason = text(draft?.reason)
  if (reason) payload.reason = reason
  if (action === 'programar') {
    payload.mode = draft.mode
    payload.when = String(draft.when).trim().replace(' ', 'T').slice(0, 16)
  }
  return payload
}

/** The toast after a step: the verb, and whether the customer was told. */
export function stepToast(action, notified, detail) {
  const done = {
    aceptar:
      family(detail) === 'baja'
        ? __('Started.', null, CTX)
        : __('Accepted.', null, CTX),
    programar: __('Scheduled.', null, CTX),
    rechazar: __('Rejected.', null, CTX),
    resolver: __('Marked resolved.', null, CTX),
    reintentar: __('Asked the gateway again.', null, CTX),
  }[action]
  if (!(TOLD[family(detail)] || []).includes(action)) return done
  return notified
    ? `${done} ${__('The customer sees it in their app.', null, CTX)}`
    : `${done} ${__('Tell the customer by WhatsApp or email.', null, CTX)}`
}

/** Where staff book the visit in the shop's appointments, or null. */
export function citasLink(citas) {
  if (!citas) return null
  const query = new URLSearchParams({ new_cita: '1' })
  if (text(citas.contact)) {
    query.set('contact', citas.contact)
    if (text(citas.contact_label))
      query.set('contact_label', citas.contact_label)
  }
  return `/agenda?${query}`
}

/** The door's line on /negocio/app-clientes: what waits, or nothing waits. */
export function doorLine(counts) {
  const count = Number(counts?.count) || 0
  if (!count) return __('Nothing waiting', null, CTX)
  return count === 1
    ? __('1 waiting', null, CTX)
    : __('{0} waiting', [count], CTX)
}
