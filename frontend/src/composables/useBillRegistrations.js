import { toast } from 'frappe-ui'
import {
  gastosApi,
  money,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useGastos'
import {
  dismissRegistration,
  registrationOf,
  registrations,
  upsertRegistration,
} from '@/composables/gastosRegistrations'

// «Registrar» in the background: the request answers after the quick checks
// (doco payables.submit_bill background=1), the worker keeps working, and the
// outcome arrives on `gastos_bill_registration` (realtime) or, when the socket
// missed it, from `payables.registration` (polled while one is pending).

export const REGISTRATION_EVENT = 'gastos_bill_registration'
// Pages that show a bill reload on this window event (detail: the outcome).
export const REGISTRATION_CHANGED = 'gastos:registration'
const POLL_MS = 8000
const DONE_LINGER_MS = 6000

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// Same id on a retry after an unknown outcome: one registration, never two.
const requests = new Map()

/**
 * Queue the bill's registration. Resolves once the server accepted it (or it
 * was already registered); a refusal of the quick checks throws as before.
 */
export function registerInBackground(doc) {
  return queue(doc, 'submit_bill', { background: 1 })
}

/**
 * «Resolver»: apply the fix a refused registration named (activate the
 * supplier, move the date out of a closed period), then register again.
 */
export function fixAndRegister(doc, fix, { postingDate = '' } = {}) {
  return queue(doc, 'fix_and_register', { fix, posting_date: postingDate })
}

async function queue(doc, method, args) {
  const name = doc.name
  const key = `${method}:${name}:${JSON.stringify(args)}`
  const request = requests.get(key) || requestId()
  requests.set(key, request)
  let result
  try {
    result = await gastosApi(method, {
      request_id: request,
      name,
      modified: doc.modified,
      ...args,
    })
  } catch (error) {
    if (!outcomeUnknown(error)) requests.delete(key)
    throw error
  }
  requests.delete(key)
  const entry = {
    name,
    party: doc.party || name,
    total: doc.total,
    currency: doc.currency,
    startedAt: Date.now(),
    state: 'queued',
    message: '',
    fix: null,
  }
  upsertRegistration(entry)
  if (Number(result?.docstatus) === 1) settle({ ...entry, state: 'done' })
  else ensurePolling()
  return result
}

let router = null
let listening = null
let pollTimer = null

/** Once per page, from the tray: realtime, the poll fallback, reconnects. */
export function watchRegistrations({ socket, router: appRouter } = {}) {
  router = appRouter || router
  if (socket && socket !== listening) {
    listening = socket
    socket.on(REGISTRATION_EVENT, (payload) => {
      if (registrationOf(payload?.name)) settle(payload)
      else announce(payload)
    })
  }
  if (typeof window !== 'undefined' && !watchRegistrations.wired) {
    watchRegistrations.wired = true
    window.addEventListener('socket:reconnected', poll)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') poll()
    })
  }
  poll()
  ensurePolling()
}

function pending() {
  return registrations.value.filter((row) => row.state === 'queued')
}

function ensurePolling() {
  if (pollTimer || !pending().length) return
  pollTimer = setInterval(() => {
    if (!pending().length) {
      clearInterval(pollTimer)
      pollTimer = null
      return
    }
    if (document.visibilityState !== 'hidden') poll()
  }, POLL_MS)
}

async function poll() {
  for (const row of pending()) {
    try {
      const status = await gastosApi('registration', { name: row.name })
      if (status.state === 'done' || status.state === 'failed')
        settle({ ...row, ...status })
      else if (status.state === 'none')
        // Lost: no job holds it and nothing was recorded (a worker restart).
        settle({
          ...row,
          state: 'failed',
          message: tr('The registration did not run. Try again.'),
        })
    } catch (error) {
      const problem = problemOf(error)
      // Offline: ask again on the next round. Gone or not readable: say so.
      if (problem.kind !== 'offline')
        settle({ ...row, state: 'failed', message: problem.detail })
    }
  }
}

function settle(payload) {
  const row = registrationOf(payload?.name)
  if (!row || row.state !== 'queued') return
  const outcome = {
    ...row,
    party: payload.party || row.party,
    total: payload.total ?? row.total,
    currency: payload.currency || row.currency,
    state: payload.state,
    message: payload.message || '',
    fix: payload.fix || null,
    endedAt: Date.now(),
  }
  upsertRegistration(outcome)
  announce(outcome)
  say(outcome)
  if (outcome.state === 'done')
    setTimeout(() => {
      if (registrationOf(outcome.name)?.state === 'done')
        dismissRegistration(outcome.name)
    }, DONE_LINGER_MS)
}

function announce(outcome) {
  if (typeof window === 'undefined' || !outcome?.name) return
  window.dispatchEvent(
    new CustomEvent(REGISTRATION_CHANGED, { detail: outcome }),
  )
}

/** Is the worker on this bill already? Then the page itself shows it. */
function onBill(name) {
  const route = router?.currentRoute?.value
  return route?.name === 'GastoFactura' && route.params?.name === name
}

export function openBill(name) {
  router?.push({ name: 'GastoFactura', params: { name } })
}

function say(outcome) {
  const what = [
    outcome.party,
    outcome.total ? money(outcome.total, outcome.currency) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const open = onBill(outcome.name)
    ? undefined
    : { label: tr('Open'), onClick: () => openBill(outcome.name) }
  if (outcome.state === 'done')
    toast.success(tr('Bill registered: {0}. It is now in To pay.', [what]), {
      action: open,
    })
  else
    toast.error(
      tr('Could not register {0}: {1}', [what, outcome.message || '']),
      { action: open, duration: 12000 },
    )
}
