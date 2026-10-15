// A deal's next step: one key each (n · p · r · h), tomorrow 10:00 and the same
// owner by default, asked after a call, a quote or a stage change (not Won/Lost).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ calls: [], answers: {}, toasts: [] }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(async (method, args) => {
    api.calls.push([method, args])
    const answer = api.answers[method.split('.').pop()]
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(args) : answer
  }),
  toast: {
    success: (text, options) => api.toasts.push(['success', text, options]),
    error: (text) => api.toasts.push(['error', text]),
  },
}))

import {
  NEXT_STEP_KEYS,
  datePresets,
  draftCall,
  draftFor,
  draftProblem,
  joinAt,
  nextStepAction,
  rowNextStep,
  splitAt,
} from '@/utils/nextStep'
import {
  ASK_AGAIN_MS,
  nextStepChanged,
  nextStepDialog,
  openNextStep,
  requestNextStep,
  runNextStep,
  snoozeNextStep,
} from '@/composables/useNextStep'

const FRESH = {
  deal: 'D-1',
  open: true,
  owner: 'ana@x.mx',
  task: '',
  title: '',
  at: '',
  type: '',
  assigned_to: '',
  modified: '',
  default_at: '2026-10-16 10:00:00',
  types: ['Task', 'Call', 'WhatsApp'],
}
const CURRENT = {
  ...FRESH,
  task: '77',
  title: 'Llamar',
  at: '2026-10-20 16:30:00',
  type: 'Call',
  assigned_to: 'luis@x.mx',
  modified: '2026-10-15 09:00:00.123',
}

function key(k, extra = {}) {
  return { key: k, target: { tagName: 'DIV' }, ...extra }
}

beforeEach(() => {
  api.calls = []
  api.answers = {}
  api.toasts = []
  Object.assign(nextStepDialog, { open: false, deal: '', state: null })
})

describe('keys', () => {
  it('n · p · r · h, one action each', () => {
    expect(NEXT_STEP_KEYS).toEqual({
      n: 'schedule',
      p: 'snooze',
      r: 'reschedule',
      h: 'complete',
    })
    expect(nextStepAction(key('n'))).toBe('schedule')
    expect(nextStepAction(key('P'))).toBe('snooze')
  })

  it('never while typing, with a modifier or when already handled', () => {
    expect(nextStepAction(key('n', { target: { tagName: 'INPUT' } }))).toBe(
      null,
    )
    expect(
      nextStepAction(
        key('n', { target: { tagName: 'DIV', isContentEditable: true } }),
      ),
    ).toBe(null)
    expect(nextStepAction(key('n', { ctrlKey: true }))).toBe(null)
    expect(nextStepAction(key('r', { metaKey: true }))).toBe(null)
    expect(nextStepAction(key('h', { defaultPrevented: true }))).toBe(null)
    expect(nextStepAction(key('x'))).toBe(null)
  })
})

describe('dates', () => {
  it('splits and joins site-time datetimes', () => {
    expect(splitAt('2026-10-16 10:00:00')).toEqual({
      date: '2026-10-16',
      time: '10:00',
    })
    expect(splitAt('2026-10-16')).toEqual({ date: '2026-10-16', time: '10:00' })
    expect(splitAt('')).toBe(null)
    expect(joinAt('2026-10-16', '09:15')).toBe('2026-10-16 09:15:00')
    expect(joinAt('2026-10-16', '')).toBe('2026-10-16 10:00:00')
    expect(joinAt('', '09:15')).toBe('')
  })

  it('quick picks count from tomorrow, across a month end', () => {
    expect(datePresets('2026-10-30 10:00:00').map((p) => p.date)).toEqual([
      '2026-10-30',
      '2026-11-01',
      '2026-11-05',
    ])
  })
})

describe('the draft', () => {
  it('a new step: tomorrow 10:00, the deal owner, titled by what just happened', () => {
    const draft = draftFor(FRESH, { reason: 'call' })
    expect(draft).toMatchObject({
      mode: 'schedule',
      task: '',
      title: 'Call again',
      date: '2026-10-16',
      time: '10:00',
      type: 'Call',
      owner: 'ana@x.mx',
    })
    expect(draftFor(FRESH, { reason: 'quote' }).title).toBe(
      'Follow up on the quote',
    )
    expect(draftFor(FRESH).title).toBe('Follow up')
  })

  it('editing keeps the current step, its date and its assignee', () => {
    expect(draftFor(CURRENT, { mode: 'reschedule' })).toMatchObject({
      mode: 'reschedule',
      task: '77',
      title: 'Llamar',
      date: '2026-10-20',
      time: '16:30',
      type: 'Call',
      owner: 'luis@x.mx',
    })
  })

  it('complete closes the current step and drafts the next from the defaults', () => {
    const draft = draftFor(CURRENT, { mode: 'complete' })
    expect(draft).toMatchObject({
      mode: 'complete',
      task: '',
      date: '2026-10-16',
      owner: 'ana@x.mx',
      scheduleNext: true,
    })
    const [method, args] = draftCall('D-1', CURRENT, { ...draft, note: 'Ok' })
    expect(method).toBe('complete')
    expect(args).toMatchObject({ deal: 'D-1', task: '77', note: 'Ok' })
    expect(args.modified).toBe(CURRENT.modified)
    expect(JSON.parse(args.next_step)).toMatchObject({
      title: 'Follow up',
      at: '2026-10-16 10:00:00',
      type: 'Task',
    })
    expect(
      draftCall('D-1', CURRENT, { ...draft, scheduleNext: false })[1].next_step,
    ).toBe('')
  })

  it('complete or reschedule with no current step is a new step', () => {
    expect(draftFor(FRESH, { mode: 'complete' }).mode).toBe('schedule')
    expect(draftFor(FRESH, { mode: 'reschedule' }).mode).toBe('schedule')
  })

  it('a reschedule sends the step and the version it was read at', () => {
    const draft = draftFor(CURRENT, { mode: 'reschedule' })
    expect(draftCall('D-1', CURRENT, draft)).toEqual([
      'schedule',
      {
        deal: 'D-1',
        title: 'Llamar',
        at: '2026-10-20 16:30:00',
        activity_type: 'Call',
        owner: 'luis@x.mx',
        task: '77',
        modified: CURRENT.modified,
      },
    ])
  })

  it('explains what is missing', () => {
    expect(
      draftProblem({ mode: 'schedule', title: ' ', date: '2026-10-16' }),
    ).toBe('Write what the next step is.')
    expect(draftProblem({ mode: 'schedule', title: 'x', date: '' })).toBe(
      'Choose the date of the next step.',
    )
    expect(draftProblem({ mode: 'complete', scheduleNext: false })).toBe('')
  })

  it('maps a saved step onto the deal row', () => {
    expect(rowNextStep(CURRENT)).toEqual({
      next_activity_task: '77',
      next_activity_at: '2026-10-20 16:30:00',
      next_activity_title: 'Llamar',
      next_activity_type: 'Call',
    })
    expect(rowNextStep({ task: '' }).next_activity_task).toBe('')
  })
})

describe('asking after an action', () => {
  it('opens for an open deal, prefilled, and only once per action', async () => {
    api.answers.get = FRESH
    const now = 1_000_000
    await requestNextStep({ deal: 'D-1', reason: 'stage', now })
    expect(nextStepDialog).toMatchObject({
      open: true,
      deal: 'D-1',
      mode: 'schedule',
      reason: 'stage',
    })
    nextStepDialog.open = false
    await requestNextStep({ deal: 'D-1', reason: 'stage', now: now + 1000 })
    expect(nextStepDialog.open).toBe(false)
    await requestNextStep({
      deal: 'D-1',
      reason: 'stage',
      now: now + ASK_AGAIN_MS,
    })
    expect(nextStepDialog.open).toBe(true)
  })

  it('never for a Won or Lost deal, and never blocks the action on an error', async () => {
    api.answers.get = { ...FRESH, open: false }
    await requestNextStep({ deal: 'D-2', reason: 'stage' })
    expect(nextStepDialog.open).toBe(false)
    api.answers.get = new Error('offline')
    await expect(
      requestNextStep({ deal: 'D-3', reason: 'call' }),
    ).resolves.toBeUndefined()
    expect(nextStepDialog.open).toBe(false)
  })

  it('opens on demand with the mode the key asked for', async () => {
    api.answers.get = CURRENT
    await runNextStep('reschedule', 'D-1')
    expect(nextStepDialog).toMatchObject({ open: true, mode: 'reschedule' })
    expect(nextStepDialog.state.task).toBe('77')
    await openNextStep({ deal: '' })
    expect(api.calls.length).toBe(1)
  })
})

describe('snooze', () => {
  it('moves the step it read, announces it, and offers Undo to the old date', async () => {
    api.answers.get = CURRENT
    api.answers.snooze = {
      ...CURRENT,
      at: '2026-10-21 16:30:00',
      modified: 'm2',
    }
    api.answers.schedule = CURRENT
    await snoozeNextStep('D-1')
    expect(api.calls[1]).toEqual([
      'crm.api.next_step.snooze',
      { deal: 'D-1', days: 1, task: '77', modified: CURRENT.modified },
    ])
    expect(nextStepChanged.value).toMatchObject({ deal: 'D-1' })
    const [, , options] = api.toasts[0]
    await options.action.onClick()
    expect(api.calls[2]).toEqual([
      'crm.api.next_step.schedule',
      {
        deal: 'D-1',
        title: 'Llamar',
        at: '2026-10-20 16:30:00',
        activity_type: 'Call',
        task: '77',
        modified: 'm2',
      },
    ])
  })

  it('a closed deal is not snoozed; a refusal is shown', async () => {
    api.answers.get = { ...CURRENT, open: false }
    expect(await snoozeNextStep('D-1')).toBe(null)
    expect(api.toasts[0][0]).toBe('error')
    api.answers.get = CURRENT
    api.answers.snooze = Object.assign(new Error('x'), { messages: ['Stale'] })
    expect(await snoozeNextStep('D-1')).toBe(null)
    expect(api.toasts[1]).toEqual(['error', 'Stale'])
  })
})

describe('es-MX catalog', () => {
  it('translates every string of the next-step dialog, keys and helpers', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, resolve } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    const read = (path) => readFileSync(resolve(here, path), 'utf8')
    const po = read('../../../crm/locale/es.po')
    const catalog = new Set(
      [
        ...po.matchAll(
          /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "(?:[^"\\]|\\.)+"/gm,
        ),
      ].map((m) => m[1]),
    )
    const strings = new Set()
    for (const file of [
      '../../src/components/doco/deals/NextStepDialog.vue',
      '../../src/composables/useNextStep.js',
      '../../src/utils/nextStep.js',
    ]) {
      const text = read(file)
      for (const m of text.matchAll(/(?:__|\bt)\(\s*'((?:[^'\\]|\\.)*)'/g))
        strings.add(m[1])
      for (const m of text.matchAll(
        /(?:description|label|call|quote|stage): '([^']+)'/g,
      ))
        strings.add(m[1])
    }
    for (const kind of ['Task', 'Call', 'WhatsApp', 'Email', 'Meeting'])
      strings.add(kind)
    const missing = [...strings].filter((text) => !catalog.has(text))
    expect(missing).toEqual([])
    expect(strings.size).toBeGreaterThan(30)
  })
})

describe('the deals list (S2.3)', () => {
  it('remembers the opened row and loads enough pages to show it again', async () => {
    const { readListReturn, writeListReturn, listReturnPageLength } =
      await import('@/utils/nextStep')
    const store = new Map()
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    }
    writeListReturn(storage, 'k', { deal: 'D-7', scrollTop: 840, loaded: 120 })
    const saved = readListReturn(storage, 'k')
    expect(saved).toEqual({ deal: 'D-7', scrollTop: 840, loaded: 120 })
    expect(listReturnPageLength(saved)).toBe(150)
    expect(listReturnPageLength({ deal: 'D', loaded: 40 })).toBe(50)
    expect(listReturnPageLength({ deal: 'D', loaded: 9000 })).toBe(500)
    expect(listReturnPageLength(readListReturn(storage, 'none'))).toBe(50)
    storage.setItem('bad', '{oops')
    expect(readListReturn(storage, 'bad')).toEqual({ deal: '' })
  })

  it('bulk scheduling sends the selected deals once, each to its own owner', () => {
    const draft = draftFor(FRESH, { mode: 'bulk', deals: ['D-1', 'D-2'] })
    expect(draft).toMatchObject({ mode: 'bulk', owner: '', title: 'Follow up' })
    expect(draftCall('D-1', FRESH, draft)).toEqual([
      'schedule_many',
      {
        deals: '["D-1","D-2"]',
        title: 'Follow up',
        at: '2026-10-16 10:00:00',
        activity_type: 'Task',
      },
    ])
  })

  it('the bulk toast says how many and why some were left out', async () => {
    const { bulkSummary } = await import('@/composables/useNextStep')
    expect(
      bulkSummary({
        scheduled: [{}, {}],
        skipped: [
          { reason: 'has_step' },
          { reason: 'closed' },
          { reason: 'denied' },
        ],
      }),
    ).toBe(
      '2 deals scheduled · 1 already had a next step · 1 closed · 1 you cannot change',
    )
  })

  it('«Sin seguimiento» is the first queue after Todos', async () => {
    const { FOLLOW_UP_QUEUES } = await import('@/utils/dealFollowUp')
    expect(FOLLOW_UP_QUEUES.map((q) => q.key).slice(0, 2)).toEqual([
      'all',
      'missing',
    ])
  })
})

describe('nextStepShortcuts', () => {
  it('lists n · p · r · h for the Alt+H sheet, as copies', async () => {
    const { nextStepShortcuts } = await import('@/composables/useNextStep')
    const list = nextStepShortcuts()
    expect(list.map((s) => s.keys[0])).toEqual(['n', 'p', 'r', 'h'])
    list[0].keys = ['z']
    expect(nextStepShortcuts()[0].keys).toEqual(['n'])
  })
})
