import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))

import {
  _resetActivity,
  durationText,
  liveTurn,
  onActivity,
  onUsage,
  shuffledPhrases,
  stepsOf,
  thinkingPhrases,
  work,
} from '@/components/assistant/assistantActivity'
import {
  HEAL_MS,
  _resetAssistant,
  assistant,
  loadHistory,
  onActivityEvent,
  onMessage,
  retireConversation,
  restoreConversation,
} from '@/components/assistant/useAssistant'
import AssistantLog from '@/components/assistant/AssistantLog.vue'

const API = 'doco.docoutils.assistant.shell_api'
const CHAT = 'desk:ana@tienda.mx'

// doco assistant/activity.py's payload, as the built-in engine sends it
function event(seq, phase, status = 'running', extra = {}) {
  return {
    chat_id: CHAT,
    turn_id: 'T1',
    run_id: 'T1',
    client_id: 'shell-1',
    seq,
    phase,
    status,
    tool: null,
    detail: null,
    elapsed_ms: 0,
    ...extra,
  }
}

// a question answered with one read: route, model round, tool, closing round
const BUILT_IN = [
  event(1, 'preparing', 'running', { elapsed_ms: 0 }),
  event(2, 'model', 'running', { elapsed_ms: 200 }),
  event(3, 'model', 'completed', { elapsed_ms: 1400, stage_elapsed_ms: 1200 }),
  event(4, 'tool', 'running', {
    elapsed_ms: 1410,
    tool: 'query_records',
    detail: 'Busco en el sistema',
  }),
  event(5, 'tool', 'completed', {
    elapsed_ms: 2210,
    stage_elapsed_ms: 800,
    tool: 'query_records',
    detail: 'Busco en el sistema',
  }),
  event(6, 'model', 'running', { elapsed_ms: 2220 }),
  event(7, 'model', 'completed', { elapsed_ms: 4020, stage_elapsed_ms: 1800 }),
  event(8, 'completed', 'completed', { elapsed_ms: 4100 }),
]

beforeEach(() => {
  _resetAssistant()
  _resetActivity()
  mocks.call.mockReset()
  mocks.call.mockImplementation((method) => {
    if (method === `${API}.status`)
      return Promise.resolve({ enabled: true, chat_id: CHAT })
    if (method === `${API}.history`) return Promise.resolve([])
    if (method === `${API}.activity`)
      return Promise.resolve({ chat_id: CHAT, events: BUILT_IN })
    return Promise.resolve({ ok: true })
  })
  assistant.status = { enabled: true, chat_id: CHAT }
  sessionStorage.clear()
})

function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  return { el, app }
}

describe('the steps of a turn', () => {
  it('reads the built-in engine as question, thinking, the tool, the answer', () => {
    BUILT_IN.forEach(onActivity)
    const out = stepsOf(work.turns.T1)
    expect(out.ended).toBe(true)
    expect(out.failed).toBe(false)
    expect(out.total).toBe(4100)
    expect(
      out.steps.map((s) => [s.kind, s.tool, s.answer, s.end - s.start]),
    ).toEqual([
      ['prepare', '', false, 200],
      ['model', '', false, 1200],
      ['tool', 'query_records', false, 800],
      ['model', '', true, 1800],
    ])
    expect(out.steps[2].detail).toBe('Busco en el sistema')
  })

  it("fills the harness engine's silences with the model's own rounds", () => {
    // the harness reports only its tool calls: the gaps are the model thinking
    ;[
      event(1, 'preparing', 'running', { elapsed_ms: 0 }),
      event(2, 'tool', 'running', { elapsed_ms: 2000, tool: 'buscar' }),
      event(3, 'tool', 'completed', { elapsed_ms: 2500, tool: 'buscar' }),
      event(4, 'tool', 'running', { elapsed_ms: 4000, tool: 'get_doc' }),
      event(5, 'tool', 'failed', { elapsed_ms: 4300, tool: 'get_doc' }),
    ].forEach(onActivity)
    let out = stepsOf(work.turns.T1)
    expect(out.ended).toBe(false)
    expect(out.steps.map((s) => [s.kind, s.tool, s.end])).toEqual([
      ['prepare', '', 2000],
      ['tool', 'buscar', 2500],
      ['model', '', 4000],
      ['tool', 'get_doc', 4300],
      // still running: the model reads what the tool said
      ['model', '', null],
    ])
    expect(out.steps[3].failed).toBe(true)
    onActivity(event(6, 'completed', 'completed', { elapsed_ms: 7000 }))
    out = stepsOf(work.turns.T1)
    expect(out.steps.at(-1)).toMatchObject({
      kind: 'model',
      start: 4300,
      end: 7000,
      answer: true,
    })
  })

  it('keeps each step once, in order, and drops what does not read as one', () => {
    onActivity(BUILT_IN[3])
    onActivity(BUILT_IN[0])
    onActivity(BUILT_IN[3])
    onActivity({ ...BUILT_IN[1], phase: 'reasoning' })
    onActivity({ ...BUILT_IN[1], seq: 0 })
    onActivity({ ...BUILT_IN[1], turn_id: '', run_id: '' })
    onActivity(event(9, 'tool', 'running', { tool: 'rm -rf /' }))
    expect(work.turns.T1.events.map((e) => e.seq)).toEqual([1, 4, 9])
    expect(work.turns.T1.events.at(-1).tool).toBe('')
    expect(work.turns.T1.clientId).toBe('shell-1')
  })

  it('follows the newest turn only while it runs', () => {
    BUILT_IN.forEach(onActivity)
    expect(liveTurn()).toBe(null)
    onActivity({ ...BUILT_IN[0], turn_id: 'T2', run_id: 'T2' })
    expect(liveTurn().id).toBe('T2')
  })

  it("keeps a turn's receipt by its turn", () => {
    onUsage({ mid: 'm1', turn_id: 'T1', usage: { turn_id: 'T1', calls: 2 } })
    onUsage({ mid: 'm2', turn_id: 'T2' })
    expect(work.usage).toEqual({ T1: { turn_id: 'T1', calls: 2 } })
  })
})

describe('the words and the clock', () => {
  it("speaks the person's language, in a new order each turn", () => {
    expect(thinkingPhrases('es-MX')).toContain('Muelleando')
    expect(thinkingPhrases('es')).toContain('Atando cabos')
    expect(thinkingPhrases('en')).toContain('Docking')
    expect(thinkingPhrases('')).toContain('Docking')
    const order = shuffledPhrases('es', () => 0)
    expect([...order].sort()).toEqual([...thinkingPhrases('es')].sort())
    expect(order).not.toEqual(thinkingPhrases('es'))
  })

  it('says a step’s time the way a stopwatch would', () => {
    expect(durationText(800, 'en')).toBe('0.8 s')
    expect(durationText(3400, 'en')).toBe('3.4 s')
    expect(durationText(3400, 'es-MX')).toBe('3.4 s')
    expect(durationText(12400, 'en')).toBe('12 s')
    expect(durationText(65000, 'en')).toBe('1 min 5 s')
    expect(durationText(120000, 'en')).toBe('2 min')
  })
})

describe('the conversation shows the work', () => {
  it('thinks in made-up words, then unfolds the real steps on a tap', async () => {
    assistant.loaded = true
    assistant.thinking = true
    const { el, app } = mount(AssistantLog, {})
    await nextTick()
    const line = el.querySelector('[data-testid="assistant-thinking"]')
    const phrase = line.querySelector('[data-testid="assistant-phrase"]')
    expect(thinkingPhrases('en').map((p) => `${p}…`)).toContain(
      phrase.textContent,
    )
    expect(line.textContent).toContain('0 s')
    const toggle = line.querySelector('[data-testid="assistant-work-toggle"]')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('See how Muelle is working')
    BUILT_IN.slice(0, 5).forEach(onActivityEvent)
    toggle.click()
    await nextTick()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const steps = [...el.querySelectorAll('[data-testid="assistant-steps"] li')]
    expect(steps.map((li) => li.dataset.state)).toEqual([
      'done',
      'done',
      'done',
      'running',
    ])
    expect(steps[2].textContent).toContain('Busco en el sistema')
    expect(steps[2].querySelector('code').textContent).toBe('query_records')
    expect(steps[3].textContent).toContain('Thinking about the next step')

    // the answer lands: the line goes, the turn's summary heads the answer,
    // folded so the answer reads first; a tap shows how it got there
    BUILT_IN.slice(5).forEach(onActivityEvent)
    onMessage({
      chat_id: CHAT,
      mid: 'm1',
      turn_id: 'T1',
      text: 'Ana debe $775.',
      buttons: [],
    })
    await nextTick()
    expect(el.querySelector('[data-testid="assistant-thinking"]')).toBe(null)
    const summary = el.querySelector('[data-testid="assistant-work"]')
    expect(summary.textContent).toContain('Worked for 4.1 s in 4 steps')
    expect(summary.querySelector('[data-testid="assistant-steps"]')).toBe(null)
    expect(el.textContent).toContain('Ana debe $775.')
    summary.querySelector('button').click()
    await nextTick()
    expect(summary.textContent).toContain('Writing the answer')
    app.unmount()
  })

  it('reads an answer from history with its receipt, and only once per turn', async () => {
    assistant.loaded = true
    assistant.messages = [
      { id: 'q', role: 'user', text: '¿Qué debe Ana?' },
      {
        id: 'm1',
        mid: 'm1',
        role: 'bot',
        text: 'Ana debe $775.',
        turnId: 'T9',
        usage: {
          turn_id: 'T9',
          calls: 3,
          total_tokens: 12400,
          complete: true,
          latency_ms: 6400,
        },
      },
      { id: 'm2', mid: 'm2', role: 'bot', text: 'Algo más.', turnId: 'T9' },
    ]
    const { el, app } = mount(AssistantLog, {})
    await nextTick()
    const summaries = el.querySelectorAll('[data-testid="assistant-work"]')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].textContent).toContain('Worked for 6.4 s')
    summaries[0].querySelector('button').click()
    await nextTick()
    expect(
      el.querySelector('[data-testid="assistant-usage"]').textContent,
    ).toContain('3 model calls, 12,400 tokens')
    app.unmount()
  })

  it('brings back a step the socket lost, once, and waits for one that is only late', async () => {
    vi.useFakeTimers()
    try {
      const asked = () =>
        mocks.call.mock.calls.filter(([m]) => m === `${API}.activity`).length
      // late: seq 2 first, seq 1 right after; nothing is fetched
      onActivityEvent(BUILT_IN[1])
      onActivityEvent(BUILT_IN[0])
      await vi.advanceTimersByTimeAsync(HEAL_MS + 10)
      expect(asked()).toBe(0)
      // lost: the turn's first step never comes; the snapshot fills it in
      onActivityEvent({ ...BUILT_IN[1], turn_id: 'T5' })
      onActivityEvent({ ...BUILT_IN[2], turn_id: 'T5' })
      mocks.call.mockImplementationOnce(() =>
        Promise.resolve({
          chat_id: CHAT,
          events: BUILT_IN.slice(0, 3).map((e) => ({ ...e, turn_id: 'T5' })),
        }),
      )
      await vi.advanceTimersByTimeAsync(HEAL_MS + 10)
      expect(asked()).toBe(1)
      expect(work.turns.T5.events.map((e) => e.seq)).toEqual([1, 2, 3])
      expect(stepsOf(work.turns.T5).steps[0].kind).toBe('prepare')
    } finally {
      vi.useRealTimers()
    }
  })

  it('backfills the latest steps on open and forgets them with the conversation', async () => {
    await loadHistory()
    await vi.waitFor(() => expect(work.turns.T1?.events).toHaveLength(8))
    expect(mocks.call).toHaveBeenCalledWith(`${API}.activity`)
    assistant.messages = [{ id: 'shell-1', role: 'user', text: '¿Qué debe?' }]
    const before = retireConversation()
    expect(work.turns).toEqual({})
    // a late step of the question that ended never lands in the new conversation
    onActivityEvent({ ...BUILT_IN[0], turn_id: 'T3' })
    expect(work.turns.T3).toBeUndefined()
    restoreConversation(before)
    expect(Object.keys(work.turns)).toEqual(['T1'])
    // another person's steps never land here
    onActivityEvent({
      ...BUILT_IN[0],
      chat_id: 'desk:otro@tienda.mx',
      turn_id: 'X',
    })
    expect(work.turns.X).toBeUndefined()
  })
})
