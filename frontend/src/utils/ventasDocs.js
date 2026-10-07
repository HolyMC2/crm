// Ventas commercial documents: one normalized model and one next-action policy
// for every host of the shared panel (deal record, Inbox context, Contactos
// ficha, legacy vertical slot). Pure: the panel renders it, the server re-checks
// every action it offers.

import { posCollectHref } from '@/utils/posHandoff'

export const SALES_DOCTYPES = Object.freeze([
  'Quotation',
  'Sales Order',
  'Sales Invoice',
  'POS Invoice',
])
const POS_RETURN_DOCTYPES = ['Sales Invoice', 'POS Invoice']
const RETURN_PREFIXES = ['/crm/']

function groupDefs() {
  return [
    { key: 'quotations', label: __('Quotations'), doctype: 'Quotation' },
    { key: 'sales_orders', label: __('Sales orders'), doctype: 'Sales Order' },
    { key: 'invoices', label: __('Invoices'), doctype: 'Sales Invoice' },
    {
      key: 'credit_notes',
      label: __('Credit notes'),
      doctype: 'Sales Invoice',
    },
    { key: 'payments', label: __('Payments'), doctype: 'Payment Entry' },
  ]
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizeRow(raw, fallbackDoctype) {
  const doctype = raw.doctype || fallbackDoctype
  const payment = doctype === 'Payment Entry'
  return {
    doctype,
    name: String(raw.name || ''),
    status: raw.status || '',
    docstatus: Number(raw.docstatus ?? (payment ? 1 : 0)),
    date: raw.date || raw.posting_date || raw.transaction_date || '',
    amount: num(payment ? raw.allocated_amount : raw.grand_total),
    currency: raw.currency || '',
    outstanding: num(raw.outstanding_amount),
    isReturn: Boolean(Number(raw.is_return || 0)),
    perBilled: num(raw.per_billed),
    customer: raw.customer || '',
    modified: raw.modified || '',
    modeOfPayment: raw.mode_of_payment || '',
    paymentType: raw.payment_type || '',
    // an invoice that also carries other deals' sales: amounts are this
    // deal's share, and only workers who may see every deal open it whole
    mixed: Boolean(Number(raw.mixed || 0)),
    viewable: raw.viewable === undefined ? true : Boolean(Number(raw.viewable)),
  }
}

/**
 * Deal payload (doco sales_docs summary + capabilities) and contact payload
 * (contact360 documents) → one shape. Deal invoices mix returns in; they are
 * split here so both scopes show «Notas de crédito» the same way.
 */
export function normalizeCommercialDocs(payload) {
  if (!payload) return null
  const lists = {
    quotations: payload.quotations || [],
    sales_orders: payload.sales_orders || [],
    invoices: (payload.invoices || []).filter((r) => !Number(r.is_return)),
    credit_notes: [
      ...(payload.credit_notes || []),
      ...(payload.invoices || []).filter((r) => Number(r.is_return)),
    ],
    payments: payload.payments || [],
  }
  const groups = groupDefs()
    .map((def) => ({
      ...def,
      rows: lists[def.key].map((raw) => normalizeRow(raw, def.doctype)),
      truncated: payload.truncated?.[def.key] || null,
    }))
    .filter((group) => group.rows.length)
  const count = (key) =>
    payload.truncated?.[key]?.total ?? lists[key].length ?? 0
  const rollup = payload.rollup || null
  return {
    groups,
    rollup,
    capabilities: payload.capabilities || null,
    counters: [
      {
        key: 'quotations',
        label: __('Quotations'),
        count: count('quotations'),
      },
      {
        key: 'sales_orders',
        label: __('Orders'),
        count: count('sales_orders'),
      },
      { key: 'invoices', label: __('Invoices'), count: count('invoices') },
      {
        key: 'outstanding',
        label: __('Balance due'),
        amount: rollup?.outstanding ?? null,
        currency: rollup?.currency || '',
      },
    ],
    empty: !groups.length,
  }
}

// ── next actions ─────────────────────────────────────────────────────────────

function denied(action, reason) {
  return {
    ...action,
    disabled: true,
    reason,
    resolve: { key: 'copy_request', label: __('Copy access request') },
  }
}

/** The receiving app validates `return_to` again; this only refuses to send junk. */
export function safeReturnPath(path) {
  if (typeof path !== 'string' || path.length > 2048) return ''
  if (!RETURN_PREFIXES.some((prefix) => path.startsWith(prefix))) return ''
  if (
    path.includes('//') ||
    path.includes('\\') ||
    [...path].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  )
    return ''
  const pathname = path.split(/[?#]/)[0]
  let segments
  try {
    // browsers normalize %2e%2e to «..» before navigating: judge decoded segments
    segments = pathname.split('/').map((segment) => decodeURIComponent(segment))
  } catch {
    return ''
  }
  if (
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        /[\\/]/.test(segment) ||
        [...segment].some((ch) => ch.charCodeAt(0) < 32),
    )
  )
    return ''
  return path
}

// POS Cobranza with the invoice preselected: one shared link builder (Cobranza uses it too).
export { posCollectHref }

/** POS «Devolver venta» deep link (posawesome returnFlowContext contract). */
export function posReturnHref(row) {
  if (!POS_RETURN_DOCTYPES.includes(row.doctype) || !row.name) return ''
  return `/posapp?return_sale=${encodeURIComponent(row.name)}&return_doctype=${encodeURIComponent(row.doctype)}`
}

function orderPending(row) {
  return row.docstatus === 1 && row.perBilled < 100
}

/**
 * One primary action at most, then secondaries, for a document in a scope.
 * ctx: { scope: 'deal'|'contact', caps, paymentLink, returnTo, returnLabel }
 */
export function nextActions(row, ctx = {}) {
  const caps = ctx.caps || {}
  const deal = ctx.scope === 'deal'
  const secondary = []
  let primary = null
  const view = SALES_DOCTYPES.includes(row.doctype)
    ? { key: 'view', label: __('View'), kind: 'view' }
    : null

  if (row.docstatus === 2)
    return { primary: null, secondary: view ? [view] : [] }

  if (row.doctype === 'Quotation' && deal) {
    if (row.docstatus === 0) {
      primary = {
        key: 'edit_quote',
        label: __('Edit and send'),
        kind: 'editor',
      }
      if (!caps.can_write)
        primary = denied(
          primary,
          __('You can read this deal but not change it.'),
        )
    } else if (!['Ordered', 'Lost', 'Expired'].includes(row.status)) {
      primary = {
        key: 'accept_quote',
        label: __('Customer accepted: create order'),
        kind: 'call',
        method: 'accept_quotation',
      }
      if (!caps.can_write)
        primary = denied(
          primary,
          __('You can read this deal but not change it.'),
        )
      secondary.push({
        key: 'send_quote',
        label: __('Send again'),
        kind: 'editor',
      })
    }
  }

  if (row.doctype === 'Sales Order' && deal) {
    if (row.docstatus === 0) {
      primary = {
        key: 'confirm_order',
        label: __('Confirm order'),
        kind: 'call',
        method: 'confirm_sales_order',
      }
      if (!caps.can_write)
        primary = denied(
          primary,
          __('You can read this deal but not change it.'),
        )
      else if (!caps.can_confirm_order)
        primary = denied(primary, __('Your role cannot confirm sales orders.'))
    } else if (
      orderPending(row) &&
      ['On Hold', 'Closed'].includes(row.status)
    ) {
      // native Resume / Re-open, with the reason on the order's timeline
      primary = {
        key: 'reopen_order',
        label: __('Resume order'),
        kind: 'call',
        method: 'reopen_sales_order',
        reason: true,
        blocked:
          row.status === 'On Hold'
            ? __('This order is on hold, so it cannot be invoiced yet.')
            : __('This order is closed, so it cannot be invoiced yet.'),
      }
      if (!caps.can_write)
        primary = denied(
          primary,
          __('You can read this deal but not change it.'),
        )
      else if (!caps.can_confirm_order)
        primary = denied(
          primary,
          __(
            'This order is {0}. Your role cannot resume orders: ask a sales manager.',
            [__(row.status)],
          ),
        )
    } else if (orderPending(row) && row.status !== 'Completed') {
      primary = {
        key: 'make_invoice',
        label: __('Create invoice'),
        kind: 'call',
        method: 'make_invoice',
      }
      if (!caps.can_write)
        primary = denied(
          primary,
          __('You can read this deal but not change it.'),
        )
      else if (!caps.can_invoice)
        primary = denied(primary, __('Your role cannot create invoices.'))
    }
  }

  const invoice = ['Sales Invoice', 'POS Invoice'].includes(row.doctype)
  if (row.doctype === 'Sales Invoice' && row.docstatus === 0 && deal) {
    primary = {
      key: 'issue_invoice',
      label: __('Issue invoice'),
      kind: 'call',
      method: 'issue_invoice',
    }
    if (!caps.can_write)
      primary = denied(primary, __('You can read this deal but not change it.'))
    else if (!caps.can_issue_invoice)
      primary = denied(primary, __('Your role cannot issue invoices.'))
    else if (row.mixed && !row.viewable)
      primary = denied(
        primary,
        __(
          'This invoice also includes sales from other deals. Ask whoever handles them to issue it.',
        ),
      )
  }

  if (invoice && row.docstatus === 1 && !row.isReturn) {
    // Register work belongs to POS; contact scope has no deal capabilities, so
    // only an explicit «no POS» answer hides the hand-off there.
    const hasPos = deal ? Boolean(caps.has_pos) : caps.has_pos !== false
    if (row.outstanding > 0) {
      // The register does not preselect a Ventas invoice yet (only Clínica
      // arms Cobranza): say exactly what to pick there before leaving.
      primary = hasPos
        ? {
            key: 'collect',
            label: __('Collect at the register'),
            kind: 'handoff',
            href: posCollectHref(row, ctx),
            assist: row.customer
              ? __(
                  'At the register open Cobranza, search {0} and choose invoice {1}. Come back here afterwards: the balance updates by itself.',
                  [row.customer, row.name],
                )
              : __(
                  'At the register open Cobranza and choose invoice {0}. Come back here afterwards: the balance updates by itself.',
                  [row.name],
                ),
          }
        : {
            key: 'collect',
            label: __('Collect at the register'),
            kind: 'route',
            disabled: true,
            reason: __(
              'The register (POS) is not installed on this site. Record the payment with your accountant.',
            ),
            resolve: { key: 'copy_folio', label: __('Copy invoice number') },
          }
      if (ctx.paymentLink && deal && row.doctype === 'Sales Invoice')
        secondary.push({
          key: 'payment_link',
          label: __('Send payment link'),
          kind: 'call',
          method: 'payment_link',
        })
    }
    if (hasPos)
      secondary.push({
        key: 'return',
        label: __('Return at the register'),
        kind: 'route',
        href: posReturnHref(row),
      })
  }

  if (view && (row.viewable ?? true)) secondary.push(view)
  return { primary, secondary }
}

// ── status ───────────────────────────────────────────────────────────────────

export function statusLabel(row) {
  if (row.doctype === 'Payment Entry')
    return row.paymentType && row.paymentType !== 'Receive'
      ? __('Refund')
      : __('Received')
  if (row.docstatus === 0) return __('Draft')
  if (row.docstatus === 2) return __('Cancelled')
  return row.status ? __(row.status) : __('Issued')
}

const THEMES = {
  Paid: 'green',
  Completed: 'green',
  Ordered: 'green',
  Consolidated: 'green',
  Submitted: 'green',
  Open: 'blue',
  'To Deliver and Bill': 'blue',
  'To Bill': 'blue',
  'To Deliver': 'blue',
  Unpaid: 'orange',
  'Partly Paid': 'orange',
  Expired: 'orange',
  Overdue: 'red',
  Lost: 'red',
  Cancelled: 'red',
}
export function statusTheme(row) {
  if (row.doctype === 'Payment Entry') return 'green'
  if (row.docstatus === 0) return 'gray'
  if (row.docstatus === 2) return 'red'
  return THEMES[row.status] || 'gray'
}

/** Paid share of what was invoiced, 0–100, for the rollup bar. */
export function paidPercent(rollup) {
  const invoiced = num(rollup?.invoiced)
  if (!invoiced) return 0
  return Math.max(
    0,
    Math.min(100, Math.round((num(rollup.paid) / invoiced) * 100)),
  )
}

/** Plain-text access request a worker can paste to a manager (no dead end). */
export function accessRequestText(action, row, scopeLabel) {
  return __(
    'Please give me permission to "{0}" in Ventas. Document: {1} {2}. Record: {3}.',
    [action.label, __(row.doctype), row.name, scopeLabel || '—'],
  )
}
