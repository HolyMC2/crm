// A deal's next step, the pure part: keys, dates and the dialog's draft.
// The server (crm.api.next_step) owns the rules; this only shapes what it gets.

// One key each, on Deal 360 and on the focused row of the deals list.
export const NEXT_STEP_KEYS = Object.freeze({
  n: 'schedule',
  p: 'snooze',
  r: 'reschedule',
  h: 'complete',
})

// English source strings; the es-MX catalog translates them in the sheet.
export const NEXT_STEP_SHORTCUTS = Object.freeze([
  { id: 'next-step.schedule', keys: ['n'], description: 'Next step' },
  { id: 'next-step.snooze', keys: ['p'], description: 'Snooze one day' },
  { id: 'next-step.reschedule', keys: ['r'], description: 'Reschedule' },
  {
    id: 'next-step.complete',
    keys: ['h'],
    description: 'Done, then next step',
  },
])

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/

export function isTypingElement(element) {
  if (!element) return false
  return Boolean(
    TYPING.test(element.tagName || '') ||
      element.isContentEditable ||
      element.closest?.('[contenteditable="true"]'),
  )
}

/** The next-step action a key press asks for, or null. */
export function nextStepAction(event) {
  if (!event || event.defaultPrevented) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (isTypingElement(event.target)) return null
  return NEXT_STEP_KEYS[String(event.key || '').toLowerCase()] || null
}

// ── dates (site time, as the server writes them: "YYYY-MM-DD HH:MM:SS") ─────

export function splitAt(at) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(at || '')
  return match ? { date: match[1], time: match[2] || '10:00' } : null
}

export function joinAt(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return ''
  const clock = /^\d{2}:\d{2}$/.test(time || '') ? time : '10:00'
  return `${date} ${clock}:00`
}

export function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d + days))
  return day.toISOString().slice(0, 10)
}

/** Quick picks from the server's default (tomorrow): tomorrow, in 3 days, in a week. */
export function datePresets(defaultAt) {
  const base = splitAt(defaultAt)
  if (!base) return []
  return [
    { key: 'tomorrow', label: 'Tomorrow', date: base.date },
    { key: 'three', label: 'In 3 days', date: shiftDate(base.date, 2) },
    { key: 'week', label: 'In a week', date: shiftDate(base.date, 6) },
  ]
}

// What a new step is called after each action; the seller can change it.
const REASON_TITLES = {
  call: 'Call again',
  quote: 'Follow up on the quote',
  stage: 'Follow up',
}
const REASON_TYPES = { call: 'Call' }

/**
 * The dialog's starting draft.
 * mode: schedule (new or edit) · reschedule (same step, new date) · complete.
 */
export function draftFor(
  state,
  { mode = 'schedule', reason = '', deals = [] } = {},
) {
  if (mode === 'bulk') {
    const fresh = splitAt(state?.default_at) || { date: '', time: '10:00' }
    return {
      mode,
      deals,
      task: '',
      title: 'Follow up',
      translateTitle: true,
      date: fresh.date,
      time: fresh.time,
      type: 'Task',
      owner: '',
      note: '',
      scheduleNext: true,
    }
  }
  const current = state?.task ? splitAt(state.at) : null
  const fresh = splitAt(state?.default_at) || { date: '', time: '10:00' }
  const editing = mode !== 'complete' && Boolean(state?.task)
  const when = editing && current ? current : fresh
  return {
    mode: state?.task ? mode : 'schedule',
    task: editing ? state.task : '',
    title: editing ? state.title : REASON_TITLES[reason] || 'Follow up',
    translateTitle: !editing,
    date: when.date,
    time: when.time,
    type: editing ? state.type || 'Task' : REASON_TYPES[reason] || 'Task',
    owner: (editing && state.assigned_to) || state?.owner || '',
    note: '',
    scheduleNext: true,
  }
}

/** The server call for a draft: [method, args]. */
export function draftCall(deal, state, draft) {
  const step = {
    title: (draft.title || '').trim(),
    at: joinAt(draft.date, draft.time),
    activity_type: draft.type || 'Task',
    owner: draft.owner || undefined,
  }
  if (draft.mode === 'bulk')
    return [
      'schedule_many',
      {
        deals: JSON.stringify(draft.deals || []),
        title: step.title,
        at: step.at,
        activity_type: step.activity_type,
      },
    ]
  if (draft.mode === 'complete')
    return [
      'complete',
      {
        deal,
        task: state.task,
        modified: state.modified,
        note: draft.note || '',
        next_step: draft.scheduleNext
          ? JSON.stringify({ ...step, type: step.activity_type })
          : '',
      },
    ]
  return [
    'schedule',
    {
      deal,
      ...step,
      task: draft.task || undefined,
      modified: draft.task ? state.modified : undefined,
    },
  ]
}

/** Why a draft cannot be saved yet, or ''. */
export function draftProblem(draft) {
  if (draft.mode === 'complete' && !draft.scheduleNext) return ''
  if (!(draft.title || '').trim()) return 'Write what the next step is.'
  if (!joinAt(draft.date, draft.time))
    return 'Choose the date of the next step.'
  return ''
}

/** A saved step as the deal row's denormalised next-activity fields. */
export function rowNextStep(state) {
  return {
    next_activity_task: state?.task || '',
    next_activity_at: state?.at || '',
    next_activity_title: state?.title || '',
    next_activity_type: state?.type || '',
  }
}

// ── the deals list: the way back to the same place ──────────────────────────

const PAGE = 50
const MAX_RESTORE_ROWS = 500

export function readListReturn(storage, key) {
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null')
    if (!raw || typeof raw.deal !== 'string') return { deal: '' }
    return {
      deal: raw.deal,
      scrollTop: Math.max(0, Number(raw.scrollTop) || 0),
      loaded: Math.max(0, Number(raw.loaded) || 0),
    }
  } catch {
    return { deal: '' }
  }
}

export function writeListReturn(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    /* no storage: the list simply opens at the top */
  }
}

/** Rows to load so the row opened last is on the page again (whole pages). */
export function listReturnPageLength(saved) {
  if (!saved?.deal || !saved.loaded) return PAGE
  return Math.min(MAX_RESTORE_ROWS, Math.ceil(saved.loaded / PAGE) * PAGE)
}
