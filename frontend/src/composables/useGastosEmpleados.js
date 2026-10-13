import { comprasApi, money, outcomeUnknown, requestId } from './useCompras'
import { errorKind } from '@/utils/contactos'
import { safeReturn } from '@/vendor/muelle-shell/contracts'

// Gastos «De empleados»: money an employee spent for the shop — its receipt,
// its approval and how it was settled. HRMS's Expense Claim is the record and
// Doco's claims service owns every read and write; pure helpers live here so
// the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.claims'
export const CLAIM = 'Expense Claim'
// Translation context shared with the bills screens.
export const CTX = 'Gastos'

export { money, outcomeUnknown, requestId }

/** POST to the claims service; a refusal keeps the server's message and type. */
export function claimsApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export const CLAIM_CHIPS = Object.freeze([
  { value: 'mios', label: 'Mine' },
  { value: 'por-aprobar', label: 'To approve' },
  { value: 'por-reembolsar', label: 'To reimburse' },
  { value: 'adelantos', label: 'Advances' },
  { value: 'caja', label: 'Cash register' },
])
export const SCOPES = Object.freeze([
  { value: 'mine', label: 'Asked of you' },
  { value: 'all', label: 'Everyone' },
])
// The states a chip works: «Siguiente» opens the next one still waiting.
const WORK_STATES = Object.freeze({
  'por-aprobar': ['to_approve'],
  'por-reembolsar': ['to_reimburse', 'partly_reimbursed'],
})

/** The chips this worker may open (from the service), in the queue's order. */
export function claimChips(claims) {
  const allowed = new Set(claims?.chips || [])
  return CLAIM_CHIPS.filter((chip) => allowed.has(chip.value))
}
export function chipLabel(value) {
  return tr(
    CLAIM_CHIPS.find((chip) => chip.value === value)?.label || 'Mine',
    null,
    CTX,
  )
}
/** A chip from the URL, or '' (the server opens the first with work for me). */
export function normalizeClaimChip(value, claims) {
  return claimChips(claims).some((chip) => chip.value === value) ? value : ''
}
export function normalizeScope(chip, value) {
  return chip === 'por-aprobar' && SCOPES.some((s) => s.value === value)
    ? value
    : ''
}

/** «De empleados» shows where claims work, or where its guard explains why not. */
export function claimsSegmentShown(boot) {
  const claims = boot?.claims
  return Boolean(claims?.enabled || claims?.code === 'no_hrms')
}
/** Bill readers keep «Por pagar»; a claim-only employee lands on «De empleados». */
export function defaultSegment(boot) {
  if (boot?.capabilities?.read) return 'por-pagar'
  return claimsSegmentShown(boot) ? 'empleados' : 'por-pagar'
}

/** What is still owed to the employee on an approved claim (after advances). */
export function owedTotal(row) {
  return Math.max(Number(row?.total || 0) - Number(row?.advance || 0), 0)
}

/** The state of a claim in shop words; «tu» when it is the reader's own. */
export function stateLabel(row) {
  switch (row?.state) {
    case 'draft':
      return tr('Draft', null, CTX)
    case 'to_fix':
      return tr('To correct')
    case 'to_approve':
      return row.approver_name
        ? tr('To approve · {0}', [row.approver_name])
        : tr('To approve', null, CTX)
    case 'to_reimburse':
      return tr('Approved · to reimburse')
    case 'partly_reimbursed':
      return tr('Reimbursed {0} of {1}', [
        money(row.reimbursed, row.currency),
        money(owedTotal(row), row.currency),
      ])
    case 'paid':
      return tr('Paid', null, CTX)
    case 'by_advance':
      return row.mine
        ? tr('Discounted from your advance')
        : tr('Discounted from the advance')
    case 'rejected':
      return tr('Rejected', null, CTX)
    case 'cancelled':
      return tr('Cancelled', null, CTX)
    default:
      return ''
  }
}

export function stateTheme(row) {
  return (
    {
      draft: 'orange',
      to_fix: 'orange',
      to_approve: 'blue',
      to_reimburse: 'blue',
      partly_reimbursed: 'blue',
      paid: 'green',
      by_advance: 'green',
      rejected: 'red',
      cancelled: 'gray',
    }[row?.state] || 'gray'
  )
}

/** The amount a queue row shows: what is still owed once approved, else the claim. */
export function rowAmount(row) {
  if (['to_reimburse', 'partly_reimbursed'].includes(row?.state))
    return Number(row.outstanding || 0)
  return Number(row?.total || 0)
}

/** «Se descuenta de tu adelanto · quedan $200». */
export function advanceText(advance, mine) {
  if (!advance) return ''
  const left = money(advance.remaining, advance.currency)
  return mine
    ? tr('Discounted from your advance · {0} left', [left])
    : tr('Discounted from the advance · {0} left', [left])
}

/** The query that reopens the queue exactly as it was. */
export function claimsQuery({ chip, scope, employee, q } = {}) {
  const query = { segment: 'empleados' }
  if (chip) query.chip = chip
  if (scope) query.scope = scope
  if (employee) query.employee = employee
  if (q) query.q = q
  return query
}

/** The record's way back: the caller's return_to (§8.3) or the list it came from. */
export function claimBack(query) {
  const to = safeReturn(query?.return_to)
  if (to)
    return {
      href: to,
      route: to.startsWith('/crm/') ? to.slice(4) : null,
      label: String(query.return_label || 'Gastos').slice(0, 40),
    }
  const list =
    typeof query?.list === 'string' && query.list.startsWith('/gastos')
      ? query.list
      : ''
  return {
    href: null,
    route: list || '/gastos?segment=empleados',
    label: 'Gastos',
  }
}

/** After a decision or a payment: the next claim of the same list still waiting, else null. */
export async function nextClaim(api, listPath, current) {
  if (!listPath) return null
  const url = new URL(listPath, 'https://muelle.invalid')
  const params = Object.fromEntries(url.searchParams)
  if (params.segment !== 'empleados') return null
  try {
    const page = await api('queue', {
      chip: params.chip || '',
      scope: params.scope || '',
      employee: params.employee || '',
      search: params.q || '',
      start: 0,
      page_length: 10,
    })
    const waiting = WORK_STATES[page.chip] || []
    const row = page.rows.find(
      (r) =>
        r.name !== current && r.doctype === CLAIM && waiting.includes(r.state),
    )
    return row?.name || null
  } catch {
    return null
  }
}

/** What still blocks «Enviar a aprobar», as field keys, so the form points at them. */
export function claimMissing(form, { photos = 0, sending = false } = {}) {
  const missing = []
  if (!form.expense_type) missing.push('expense_type')
  if (!(Number(form.amount) > 0)) missing.push('amount')
  if (!form.expense_date) missing.push('expense_date')
  if (sending && !form.approver) missing.push('approver')
  if (sending && !photos && !form.photo) missing.push('photo')
  return missing
}

/** «Reembolsar»: what still blocks it. Bank transfers need their reference. */
export function reimburseMissing(form, options) {
  const missing = []
  const account = options?.accounts?.find((a) => a.account === form.account)
  if (!account) missing.push('account')
  if (!(Number(form.amount) > 0)) missing.push('amount')
  if (account?.type === 'Bank' && !String(form.reference_no || '').trim())
    missing.push('reference_no')
  if (!form.reference_date) missing.push('reference_date')
  return missing
}

const PENDING_PREFIX = 'muelle:gastos:claim:'
/** An operation sent but not confirmed: its request id and exact payload are
 *  stored BEFORE dispatch, so a reload or a retry asks about the same one
 *  (one claim, one decision, one payment) instead of doing it twice. */
export function pendingOperation(key) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_PREFIX + key) || 'null',
    )
    return value && value.request_id && value.data ? value : null
  } catch {
    return null
  }
}
function remember(key, operation) {
  try {
    sessionStorage.setItem(PENDING_PREFIX + key, JSON.stringify(operation))
  } catch {
    /* the in-memory id still covers retries in this page */
  }
}
export function forgetOperation(key) {
  try {
    sessionStorage.removeItem(PENDING_PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** One call per operation until the server answers. An unknown outcome keeps
 *  the request id and payload, so the retry replays instead of acting again;
 *  any answer (done or refused) ends it. */
export async function runOnce(api, method, key, data) {
  const operation = pendingOperation(key) || { request_id: requestId(), data }
  remember(key, operation)
  try {
    const result = await api(method, {
      request_id: operation.request_id,
      ...operation.data,
    })
    forgetOperation(key)
    return result
  } catch (error) {
    if (!outcomeUnknown(error)) forgetOperation(key)
    throw error
  }
}

/** Plain, actionable recovery for a failed call (the server's words kept). */
export function claimProblem(error) {
  const kind = errorKind(error)
  const detail =
    error?.messages?.join(' ') || error?.message || tr('Something went wrong.')
  if (outcomeUnknown(error))
    return {
      kind: 'offline',
      title: tr('No connection', null, CTX),
      detail,
      action: tr('Check result'),
    }
  if (kind === 'conflict')
    return {
      kind,
      title: tr('Someone else changed this expense'),
      detail,
      action: tr('Refresh and compare'),
    }
  if (kind === 'permission')
    return { kind, title: tr('Not allowed', null, CTX), detail, action: null }
  return { kind: 'error', title: tr('Could not finish'), detail, action: null }
}

/** The shop words for a guard's action key, when the server sent none. */
export function actionLabel(action) {
  if (action?.label) return action.label
  return (
    {
      take_photo: tr('Take the receipt photo'),
      ask_other: tr('Ask someone else'),
      ask_reimburse: tr('Ask for it to be reimbursed'),
      reimburse: tr('Reimburse now'),
      next: tr('Next', null, CTX),
      request_setup: tr('Ask for it to be set up'),
      bills: tr('Continue with bills'),
    }[action?.key] || tr('Continue')
  )
}
