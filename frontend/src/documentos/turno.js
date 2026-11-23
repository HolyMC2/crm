// A register turn on its document page (POS Opening Shift or POS Closing
// Shift): posawesome's `shift_view.shift` read shaped into the tiles, the view
// chips and the rows of each view. Pure, so the page and its tests share it.
// Amounts the reader may not see arrive as null and stay out of the screen.
import { call } from 'frappe-ui'
import {
  bagState,
  money,
  PURPOSE,
  shiftWhen,
  who,
} from '@/components/efectivo/efectivo'
import { formatDateTime, formatTime } from '@/utils/display'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { documentRoute, floorRoute } from './registry'

export const OPENING = 'POS Opening Shift'
export const CLOSING = 'POS Closing Shift'

export const readShift = (doctype, name) =>
  call('posawesome.posawesome.api.shift_view.shift', { doctype, name })

const MOVEMENT = {
  Expense: 'Gasto',
  Deposit: 'Depósito',
  'Cash In': 'Entrada de efectivo',
}
// The payroll kinds a cash out was recorded as (POS CashMovementHistory).
const MOVEMENT_KIND = {
  employee_advance: 'Adelanto a trabajador',
  salary: 'Nómina',
  bonus: 'Bono o comisión',
  owner_draw: 'Retiro del dueño',
}
const TRANSFER = {
  Float: 'Fondo',
  Change: 'Cambio',
  Drop: 'Retiro',
  SafeHandoff: 'Entrega',
}
const TRANSFER_STATE = {
  Draft: 'Por preparar',
  Prepared: 'Preparado',
  InTransit: 'En camino',
  ReceivedPendingReview: 'Recibido, en revisión',
  Completed: 'Completo',
  Disputed: 'Con diferencia',
  Cancelled: 'Cancelado',
  Returned: 'Regresó',
  Received: 'Recibido',
}
const COUNT_SCOPE = {
  Drawer: 'Corte de caja',
  Safe: 'Arqueo de la caja fuerte',
  Bag: 'Conteo de bolsa',
  Transfer: 'Conteo de traslado',
  Fund: 'Ingreso a la caja fuerte',
  Payout: 'Conteo de pago',
}
const COUNT_STATE = {
  Draft: 'Sin terminar',
  Final: 'Cuadró',
  Exception: 'No cuadró',
  Reviewed: 'Revisado',
  Closed: 'Cerrado',
}

const has = (v) => v !== null && v !== undefined
const line = (parts) => parts.filter(Boolean).join(' · ')

/** «+$40.00», «−$10.00», «$0.00». */
export function signed(amount, currency) {
  const n = Number(amount) || 0
  if (!n) return money(0, currency)
  return `${n > 0 ? '+' : '−'}${money(Math.abs(n), currency)}`
}

/** The time of a moment inside the turn: «10:42»; another day reads whole. */
function when(at, shift) {
  if (!at) return ''
  const day = String(at).slice(0, 10)
  const opened = String(shift?.opened || '').slice(0, 10)
  return day && day === opened ? formatTime(at) : formatDateTime(at)
}

/** The cash method's row of the payments, or null. */
export function cashRow(data) {
  const rows = data?.payments || []
  return rows.find((r) => r.mode_of_payment === data?.cash_mode) || null
}

/** «Doco Ventas · hoy, 09:05–19:49» or «… · abierto desde hoy 09:05». */
export function turnLine(data, { now } = {}) {
  const s = data?.shift
  if (!s) return ''
  return line([
    s.caja,
    s.store !== s.caja ? s.store : '',
    shiftWhen(s, { now }),
  ])
}

/** The tiles over the views: what the turn sold, the cash and its difference. */
export function tiles(data) {
  if (!data) return []
  const currency = data.shift?.currency
  const out = []
  const sales = data.sales
  if (sales) {
    const counts = line([
      sales.count === 1 ? '1 ticket' : `${sales.count} tickets`,
      sales.returns
        ? sales.returns === 1
          ? '1 devolución'
          : `${sales.returns} devoluciones`
        : '',
      sales.drafts ? `${sales.drafts} en espera` : '',
    ])
    out.push(
      has(sales.total)
        ? {
            key: 'ventas',
            label: 'Ventas',
            value: money(sales.total, currency),
            hint: counts,
          }
        : {
            key: 'ventas',
            label: 'Tickets',
            value: String(sales.count),
            hint: '',
          },
    )
  }
  const cash = cashRow(data)
  const closed = !!data.shift?.closing
  if (cash && closed && has(cash.counted)) {
    out.push({
      key: 'efectivo',
      label: 'Efectivo contado',
      value: money(cash.counted, currency),
      hint: has(cash.expected)
        ? `Esperado ${money(cash.expected, currency)}`
        : '',
    })
  } else if (cash && has(cash.expected)) {
    out.push({
      key: 'efectivo',
      label: 'Efectivo en caja',
      value: money(cash.expected, currency),
      hint: cash.opening ? `Fondo ${money(cash.opening, currency)}` : '',
    })
  }
  if (
    closed &&
    data.payments?.length &&
    data.payments.every((r) => has(r.difference))
  ) {
    const total = data.payments.reduce(
      (sum, r) => sum + (Number(r.difference) || 0),
      0,
    )
    const off = Math.abs(total) >= 0.005
    out.push({
      key: 'diferencia',
      label: 'Diferencia',
      value: off ? signed(total, currency) : 'Cuadró',
      tone: off ? (total < 0 ? 'danger' : 'warning') : 'success',
    })
  }
  return out
}

/** The rows of each view, keyed: ventas, pagos, cobros, movimientos, bolsas, traslados, conteos, cajon. */
export function views(data, { boot = null } = {}) {
  if (!data) return {}
  const s = data.shift || {}
  const currency = s.currency
  const people = data.people || {}
  const out = {}

  if (data.sales) {
    const rows = []
    if (data.sales.drafts)
      rows.push({
        key: 'drafts',
        title:
          data.sales.drafts === 1
            ? '1 ticket en espera'
            : `${data.sales.drafts} tickets en espera`,
        icon: 'lucide-pause',
      })
    for (const t of data.sales.rows) {
      rows.push({
        key: `${t.doctype}:${t.name}`,
        title: t.customer || 'Público en general',
        subtitle: line([
          t.is_return ? 'Devolución' : '',
          when(t.at, s),
          t.name,
        ]),
        meta: has(t.amount) ? money(t.amount, currency) : '',
        metaTone: t.is_return ? 'danger' : '',
        icon: t.is_return ? 'lucide-undo-2' : 'lucide-receipt',
        to: documentRoute(t.doctype, t.name, { boot }),
      })
    }
    out.ventas = rows
  }

  const pagos = []
  if (data.payments) {
    for (const p of data.payments) {
      const diff = has(p.difference) && Math.abs(Number(p.difference)) >= 0.005
      pagos.push({
        key: p.mode_of_payment,
        title: modeOfPaymentLabel(p.mode_of_payment),
        subtitle: line([
          p.opening ? `Fondo ${money(p.opening, currency)}` : '',
          has(p.expected) ? `Esperado ${money(p.expected, currency)}` : '',
          has(p.counted) ? `Contado ${money(p.counted, currency)}` : '',
        ]),
        meta: has(p.difference)
          ? diff
            ? signed(p.difference, currency)
            : 'Cuadró'
          : has(p.counted)
            ? money(p.counted, currency)
            : has(p.expected)
              ? money(p.expected, currency)
              : '',
        metaTone: diff && Number(p.difference) < 0 ? 'danger' : '',
        icon:
          p.mode_of_payment === data.cash_mode
            ? 'lucide-banknote'
            : 'lucide-credit-card',
      })
    }
  } else {
    for (const o of data.opening || []) {
      pagos.push({
        key: o.mode_of_payment,
        title: modeOfPaymentLabel(o.mode_of_payment),
        subtitle: 'Fondo',
        meta: has(o.amount) ? money(o.amount, currency) : '',
        icon: 'lucide-banknote',
      })
    }
  }
  if (data.payments || pagos.length) out.pagos = pagos

  if (data.cobros)
    out.cobros = data.cobros.map((c) => ({
      key: c.name,
      title: c.party || c.name,
      subtitle: line([
        c.kind === 'Pay' ? 'Pago' : 'Cobro',
        c.mode_of_payment ? modeOfPaymentLabel(c.mode_of_payment) : '',
        when(c.at, s),
      ]),
      meta: has(c.amount)
        ? signed(c.kind === 'Pay' ? -c.amount : c.amount, currency)
        : '',
      icon: 'lucide-hand-coins',
      to: documentRoute('Payment Entry', c.name, {
        boot,
        hint: { payment_type: c.kind },
      }),
    }))

  if (data.movements)
    out.movimientos = data.movements.map((m) => ({
      key: m.name,
      title: MOVEMENT_KIND[m.kind] || MOVEMENT[m.type] || m.type,
      subtitle: line([
        m.reason ? `«${m.reason}»` : '',
        m.employee,
        who(m.user, people),
        when(m.at, s),
      ]),
      subtitleLines: 2,
      meta: has(m.amount)
        ? signed(m.type === 'Cash In' ? m.amount : -m.amount, currency)
        : '',
      icon:
        m.type === 'Cash In'
          ? 'lucide-arrow-down-to-line'
          : 'lucide-arrow-up-from-line',
      to: documentRoute('POS Cash Movement', m.name, { boot }),
    }))

  if (data.bags)
    out.bolsas = data.bags.map((b) => ({
      key: b.name,
      title: `Bolsa ${b.seal}`,
      subtitle: line([
        b.direction === 'in'
          ? 'Recibida en la caja'
          : PURPOSE[b.purpose] || b.purpose,
        bagState(b.state).label,
        who(b.user, people),
      ]),
      meta: has(b.amount) ? money(b.amount, b.currency || currency) : '',
      icon: 'lucide-package',
      to: { name: 'EfectivoBolsa', params: { name: b.name } },
    }))

  if (data.transfers)
    out.traslados = data.transfers.map((t) => ({
      key: t.name,
      title: `${TRANSFER[t.kind] || 'Traslado'} · ${t.direction === 'out' ? 'salió de la caja' : 'entró a la caja'}`,
      subtitle: line([
        TRANSFER_STATE[t.state] || t.state,
        who(t.user, people),
        when(t.at, s),
      ]),
      meta: has(t.amount)
        ? signed(t.direction === 'out' ? -t.amount : t.amount, currency)
        : '',
      icon: 'lucide-arrow-left-right',
    }))

  if (data.counts)
    out.conteos = data.counts.map((c) => {
      const diff = has(c.difference) && Math.abs(Number(c.difference)) >= 0.005
      return {
        key: c.name,
        title: COUNT_SCOPE[c.scope] || 'Conteo',
        subtitle: line([
          COUNT_STATE[c.state] || c.state,
          `Contó ${who(c.counted_by, people)}`,
          has(c.expected_amount)
            ? `esperado ${money(c.expected_amount, currency)}`
            : '',
          when(c.at, s),
        ]),
        subtitleTone: c.state === 'Exception' ? 'danger' : '',
        meta: diff ? signed(c.difference, currency) : money(c.amount, currency),
        metaTone: diff && Number(c.difference) < 0 ? 'danger' : '',
        icon: 'lucide-calculator',
      }
    })

  const opens = data.drawer_opens?.rows || []
  if (opens.length)
    out.cajon = opens.map((o) => ({
      key: o.name,
      title: o.reason_code || 'Sin motivo',
      subtitle: line([
        o.user_name,
        o.approved_by_name ? `autorizó ${o.approved_by_name}` : '',
        o.reason_note ? `«${o.reason_note}»` : '',
      ]),
      meta: when(o.occurred_at, s),
      icon: 'lucide-archive',
    }))
  return out
}

const CHIPS = [
  ['ventas', 'Ventas'],
  ['pagos', 'Pagos'],
  ['cobros', 'Cobros'],
  ['movimientos', 'Movimientos'],
  ['bolsas', 'Bolsas'],
  ['traslados', 'Traslados'],
  ['conteos', 'Conteos'],
  ['cajon', 'Cajón'],
]
// Ventas and Pagos are the turn itself: their chip shows even at zero.
const ALWAYS = new Set(['ventas', 'pagos'])

/** The view chips with their counts, only the views that hold something. */
export function viewChips(byView, data) {
  return CHIPS.filter(
    ([key]) => byView[key] && (byView[key].length || ALWAYS.has(key)),
  ).map(([key, label]) => ({
    value: key,
    label,
    count:
      key === 'ventas'
        ? (data?.sales?.count || 0) + (data?.sales?.returns || 0)
        : key === 'cajon'
          ? data?.drawer_opens?.count || 0
          : byView[key].length,
  }))
}

/** The other half of the turn and the turns on either side of a handover. */
export function links(data, doctype, people = data?.people || {}) {
  const s = data?.shift
  if (!s) return []
  const out = []
  if (doctype === OPENING && s.closing)
    out.push({
      key: 'closing',
      title: 'Corte de caja',
      subtitle: line([s.closing, s.closed ? formatDateTime(s.closed) : '']),
      icon: 'lucide-lock',
      to: floorRoute(CLOSING, s.closing),
    })
  if (doctype === CLOSING)
    out.push({
      key: 'opening',
      title: 'Apertura del turno',
      subtitle: line([s.name, s.opened ? formatDateTime(s.opened) : '']),
      icon: 'lucide-lock-open',
      to: floorRoute(OPENING, s.name),
    })
  const from = data.handovers?.from
  if (from?.shift)
    out.push({
      key: 'from',
      title: `Recibió el turno de ${who(from.cashier, people)}`,
      subtitle: from.shift,
      icon: 'lucide-arrow-right-to-line',
      to: floorRoute(OPENING, from.shift),
    })
  const to = data.handovers?.to
  if (to?.cashier)
    out.push({
      key: 'to',
      title: `Entregó el turno a ${who(to.cashier, people)}`,
      subtitle: to.shift || '',
      icon: 'lucide-arrow-right-from-line',
      to: to.shift ? floorRoute(OPENING, to.shift) : null,
    })
  return out
}

/** Doctypes whose saves change an open turn: the page reads it again. */
export const LIVE = [
  'Sales Invoice',
  'POS Invoice',
  'POS Cash Movement',
  'POS Cash Bag',
  'POS Cash Transfer',
  'POS Closing Shift',
]
