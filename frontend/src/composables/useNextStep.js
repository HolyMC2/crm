// A deal's next step, from anywhere: Deal 360, the deals list, Hoy, Ctrl+K and
// right after an action (call, quote, stage change). One dialog, mounted once in
// GlobalModals; one server API (crm.api.next_step); one key each.
//
//   openNextStep({ deal, mode })      mode: schedule · reschedule · complete
//   requestNextStep({ deal, reason }) after an action; skipped for Won/Lost deals
//   snoozeNextStep(deal)              +1 day, with Undo
//   useNextStepKeys(() => deal)       n · p · r · h while the page is mounted
//   nextStepChanged                   { deal, state, at } after every save
import { onBeforeUnmount, onMounted, reactive, shallowRef } from 'vue'
import { call, toast } from 'frappe-ui'
import { registerPageShortcuts } from '@/composables/shellKeyboard'
import { NEXT_STEP_SHORTCUTS, nextStepAction } from '@/utils/nextStep'

const t = (text, replace) =>
  globalThis.window?.__ ? globalThis.window.__(text, replace) : text

export const nextStepDialog = reactive({
  open: false,
  loading: false,
  deal: '',
  mode: 'schedule',
  reason: '',
  state: null,
  error: '',
  deals: [],
  onDone: null,
})

/** The last saved step: lists and cards patch their row from it. */
export const nextStepChanged = shallowRef(null)

export function nextStepApi(method, args) {
  return call(`crm.api.next_step.${method}`, args)
}

export function announceNextStep(deal, state) {
  nextStepChanged.value = { deal, state, at: Date.now() }
}

export function nextStepError(error) {
  return (
    error?.messages?.[0] ||
    error?.message ||
    t('The next step could not be saved. Retry.')
  )
}

export async function openNextStep({ deal, mode = 'schedule', reason = '' }) {
  if (!deal) return
  Object.assign(nextStepDialog, {
    open: true,
    loading: true,
    deal,
    mode,
    reason,
    state: null,
    error: '',
    deals: [],
    onDone: null,
  })
  try {
    const state = await nextStepApi('get', { deal })
    if (nextStepDialog.deal !== deal) return
    nextStepDialog.state = state
  } catch (error) {
    nextStepDialog.error = nextStepError(error)
  } finally {
    if (nextStepDialog.deal === deal) nextStepDialog.loading = false
  }
}

// Issuing a quote and then sending it is one action for the seller: ask once.
export const ASK_AGAIN_MS = 10 * 60 * 1000
const asked = new Map()

/** After a call, a quote or a stage change: ask for the next dated step. */
export async function requestNextStep({ deal, reason = '', now = Date.now() }) {
  if (!deal || nextStepDialog.open) return
  const key = `${deal}|${reason}`
  if (now - (asked.get(key) ?? -Infinity) < ASK_AGAIN_MS) return
  asked.set(key, now)
  let state
  try {
    state = await nextStepApi('get', { deal })
  } catch {
    return // the action itself succeeded; never block it on this prompt
  }
  if (!state?.open) return // Won or Lost: the outcome is the answer
  Object.assign(nextStepDialog, {
    open: true,
    loading: false,
    deal,
    mode: 'schedule',
    reason,
    state,
    error: '',
    deals: [],
    onDone: null,
  })
}

/** «Programar seguimiento» for the deals selected in the list (one step each). */
export async function openBulkNextStep(deals, { onDone = null } = {}) {
  if (!deals?.length) return
  await openNextStep({ deal: deals[0], mode: 'bulk' })
  Object.assign(nextStepDialog, { deals: [...deals], onDone })
}

/** The toast after a bulk schedule: how many, and why any were left out. */
export function bulkSummary(answer) {
  const done = answer?.scheduled?.length || 0
  const skipped = answer?.skipped || []
  const why = (reason) => skipped.filter((row) => row.reason === reason).length
  const parts = [t('{0} deals scheduled', [done])]
  if (why('has_step'))
    parts.push(t('{0} already had a next step', [why('has_step')]))
  if (why('closed')) parts.push(t('{0} closed', [why('closed')]))
  if (why('denied')) parts.push(t('{0} you cannot change', [why('denied')]))
  return parts.join(' · ')
}

export async function snoozeNextStep(deal, { days = 1 } = {}) {
  if (!deal) return null
  try {
    const before = await nextStepApi('get', { deal })
    if (!before.open) {
      toast.error(t('This deal is closed; it needs no next step.'))
      return null
    }
    const state = await nextStepApi('snooze', {
      deal,
      days,
      task: before.task || undefined,
      modified: before.modified || undefined,
    })
    announceNextStep(deal, state)
    toast.success(t('Snoozed to {0}', [formatStep(state.at)]), {
      duration: 8000,
      action: before.task
        ? {
            label: t('Undo'),
            onClick: () => undoSnooze(deal, before, state),
          }
        : undefined,
    })
    return state
  } catch (error) {
    toast.error(nextStepError(error))
    return null
  }
}

async function undoSnooze(deal, before, after) {
  try {
    const state = await nextStepApi('schedule', {
      deal,
      title: before.title,
      at: before.at,
      activity_type: before.type || undefined,
      task: after.task,
      modified: after.modified,
    })
    announceNextStep(deal, state)
    toast.success(t('Snooze undone'))
  } catch (error) {
    toast.error(nextStepError(error))
  }
}

/** n · p · r · h for one deal: open the dialog, or snooze straight away. */
export function runNextStep(action, deal) {
  if (!action || !deal) return
  if (action === 'snooze') return snoozeNextStep(deal)
  return openNextStep({ deal, mode: action })
}

function otherDialogOpen() {
  return Boolean(
    globalThis.document?.querySelector('[aria-modal="true"], [role="dialog"]'),
  )
}

/**
 * The page's next-step keys while it is mounted, for the deal `deal()` names
 * (falsy: keys off). Declared in Alt+H «En esta página».
 */
export function useNextStepKeys(deal, { enabled = () => true } = {}) {
  registerPageShortcuts(null, () => (deal() ? NEXT_STEP_SHORTCUTS : []))
  function onKey(event) {
    const name = deal()
    if (!name || !enabled() || nextStepDialog.open || otherDialogOpen()) return
    const action = nextStepAction(event)
    if (!action) return
    event.preventDefault()
    runNextStep(action, name)
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}

export function formatStep(at, locale = globalThis.window?.lang || 'es-MX') {
  if (!at) return ''
  const [date, time = '00:00'] = String(at).split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const when = new Date(y, m - 1, d, hh, mm)
  try {
    return when.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return at
  }
}
