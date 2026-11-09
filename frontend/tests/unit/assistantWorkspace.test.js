// The assistant's desktop workspace (Marco 2026-11-05: model selection,
// conversations on the left, side panels on the right) and the composer's
// model picker, which the dock and the phone sheet share. Thread management
// (2026-11-05, T3's thread menu): a row's «⋯» resolves, snoozes, marks
// unread, regenerates the title and copies.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import { _resetAssistant, assistant } from '@/components/assistant/useAssistant'
import { _resetAgenda } from '@/components/assistant/assistantAgenda'
import { _resetCanvas } from '@/components/assistant/assistantCanvas'
import {
  _resetModels,
  loadModels,
  models,
} from '@/components/assistant/assistantModels'
import {
  _resetSessions,
  groupConversations,
  sessions,
  showView,
} from '@/components/assistant/assistantSessions'
import AssistantModelPicker from '@/components/assistant/AssistantModelPicker.vue'
import AssistantSheet from '@/components/assistant/AssistantSheet.vue'

const API = 'doco.docoutils.assistant.shell_api'

const haiku = {
  model: 'claude-haiku-5-5',
  label: 'Claude Haiku 5.5',
  efforts: ['low', 'medium', 'high'],
}
const sonnet = {
  model: 'claude-sonnet-5-5',
  label: 'Claude Sonnet 5.5',
  efforts: ['medium', 'high'],
}
function options(current = haiku, effort = 'medium', extra = {}) {
  return {
    can_choose: true,
    reason: null,
    message: null,
    chosen: current !== haiku,
    current: { model: current.model, effort, label: current.label },
    default: { model: haiku.model, effort: 'medium' },
    models: [haiku, sonnet],
    efforts: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
    ...extra,
  }
}

let answers
function answer(method, args) {
  if (method in answers) return answers[method](args)
  if (method === `${API}.status`)
    return Promise.resolve({
      enabled: true,
      role: 'owner',
      chat_id: 'desk:o@t.mx',
    })
  if (method === `${API}.history`) return Promise.resolve([])
  if (method === `${API}.open_work`)
    return Promise.resolve({ captures: [], proposals: [], count: 0 })
  if (method === `${API}.encargos`) return Promise.resolve({ items: [] })
  if (method === `${API}.models`) return Promise.resolve(options())
  if (method === `${API}.conversations`)
    return Promise.resolve({
      available: true,
      current: { title: 'Ventas de hoy', messages: 2 },
      conversations: [
        {
          id: 'C1',
          title: 'Factura XMovil',
          ended_at: '2026-11-04 10:00:00',
          messages: 6,
        },
      ],
      archived: 0,
    })
  return Promise.resolve({ ok: true })
}

function calls(method) {
  return mocks.call.mock.calls.filter(([m]) => m === `${API}.${method}`)
}

beforeEach(() => {
  _resetAssistant()
  _resetSessions()
  _resetAgenda()
  _resetCanvas()
  _resetModels()
  localStorage.clear()
  answers = {}
  mocks.call.mockReset()
  mocks.call.mockImplementation(answer)
})

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  router.push('/hoy')
  await router.isReady()
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  await flush()
  return { el, app }
}

function desktop() {
  const matchMedia = window.matchMedia
  window.matchMedia = (media) => ({
    media,
    matches: media === '(min-width: 1280px)',
    addEventListener() {},
    removeEventListener() {},
  })
  return () => (window.matchMedia = matchMedia)
}

const q = (sel) => document.querySelector(sel)

describe('the model picker', () => {
  it('names the brain of this conversation and switches it', async () => {
    answers[`${API}.model_set`] = ({ model, effort }) =>
      Promise.resolve(options(model === sonnet.model ? sonnet : haiku, effort))
    const { el, app } = await mount(AssistantModelPicker)
    const chip = el.querySelector('[data-testid="assistant-model"]')
    expect(chip.textContent).toContain('Haiku 5.5 · Medium')

    chip.click()
    await flush()
    const rows = [...el.querySelectorAll('[data-model]')]
    expect(rows.map((r) => r.textContent.trim())).toEqual([
      expect.stringContaining('Claude Haiku 5.5'),
      expect.stringContaining('Claude Sonnet 5.5'),
    ])
    el.querySelector('[data-model="claude-sonnet-5-5"]').click()
    await flush()
    // the effort carries over when the new model has it
    expect(calls('model_set').at(-1)[1]).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'medium',
    })
    expect(chip.textContent).toContain('Sonnet 5.5 · Medium')
    expect(
      el.querySelector('[data-testid="assistant-model-reset"]').textContent,
    ).toContain('Haiku 5.5 · Medium')
    app.unmount()
  })

  it('falls back to the model’s first effort when it lacks the current one', async () => {
    await loadModels()
    models.current.effort = 'low'
    answers[`${API}.model_set`] = (args) =>
      Promise.resolve(options(sonnet, args.effort))
    const { el, app } = await mount(AssistantModelPicker)
    el.querySelector('[data-testid="assistant-model"]').click()
    await flush()
    el.querySelector('[data-model="claude-sonnet-5-5"]').click()
    await flush()
    expect(calls('model_set').at(-1)[1].effort).toBe('medium')
    app.unmount()
  })

  it('shows staff who may not choose the model and the reason, no list', async () => {
    answers[`${API}.models`] = () =>
      Promise.resolve(
        options(haiku, 'medium', {
          can_choose: false,
          models: [],
          message: 'El dueño no habilitó elegir modelo para el equipo.',
        }),
      )
    const { el, app } = await mount(AssistantModelPicker)
    el.querySelector('[data-testid="assistant-model"]').click()
    await flush()
    expect(
      el.querySelector('[data-testid="assistant-model-refusal"]').textContent,
    ).toContain('El dueño no habilitó')
    expect(el.querySelector('[data-model]')).toBeNull()
    app.unmount()
  })

  it('hides itself on a server without the endpoint', async () => {
    answers[`${API}.models`] = () => Promise.reject(new Error('not found'))
    const { el, app } = await mount(AssistantModelPicker)
    expect(el.querySelector('[data-testid="assistant-model"]')).toBeNull()
    app.unmount()
  })

  it('Esc folds the menu without closing the assistant', async () => {
    const { el, app } = await mount(AssistantModelPicker)
    el.querySelector('[data-testid="assistant-model"]').click()
    await flush()
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    el.querySelector('[data-model]').dispatchEvent(event)
    await flush()
    expect(event.defaultPrevented).toBe(true)
    expect(el.querySelector('[data-testid="assistant-model-menu"]')).toBeNull()
    app.unmount()
  })
})

describe('the desktop workspace', () => {
  async function openWorkspace() {
    const restore = desktop()
    const mounted = await mount(AssistantSheet)
    assistant.open = true
    assistant.full = true
    // the workspace is its own chunk; its list arrives after it mounts
    await vi.waitFor(() => expect(q('[data-conversation="C1"]')).not.toBeNull())
    await flush()
    return { ...mounted, restore }
  }

  it('puts conversations left, the chat in the middle; the panels wait to be asked for', async () => {
    const { app, restore } = await openWorkspace()
    expect(q('[data-testid="assistant-workspace"]')).not.toBeNull()
    expect(q('[data-testid="assistant-dock"]')).toBeNull()
    expect(q('[data-testid="assistant-sidebar"]')).not.toBeNull()
    expect(q('[data-testid="assistant-input"]')).not.toBeNull()
    expect(q('[data-testid="assistant-model"]')).not.toBeNull()
    expect(q('[data-conversation="C1"]').textContent).toContain(
      'Factura XMovil',
    )
    // a chat app's full screen: no column of panels until one is asked for
    expect(q('[data-testid="assistant-side-panels"]')).toBeNull()
    // «Abierto» heads the left column and opens its panel, unfolded
    expect(q('[data-testid="assistant-sidebar-open"]')).not.toBeNull()
    q('[data-testid="assistant-sidebar-open"]').click()
    await flush()
    expect(
      [...document.querySelectorAll('[data-panel]')].map(
        (p) => p.dataset.panel,
      ),
    ).toEqual(['screen', 'open', 'agenda', 'canvas', 'conversation'])
    expect(q('[data-panel="open"] button').getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(sessions.view).toBe('chat')
    app.unmount()
    restore()
  })

  it('steps down to the dock when a screen opens from outside it (⌘K, the rail)', async () => {
    const { app, restore } = await openWorkspace()
    await app.config.globalProperties.$router.push('/contactos')
    await flush()
    expect(assistant.full).toBe(false)
    expect(assistant.open).toBe(true)
    await vi.waitFor(() =>
      expect(q('[data-testid="assistant-dock"]')).not.toBeNull(),
    )
    expect(q('[data-testid="assistant-workspace"]')).toBeNull()
    // a filter on the same screen leaves the full screen alone
    assistant.full = true
    await app.config.globalProperties.$router.push('/contactos?q=ana')
    await flush()
    expect(assistant.full).toBe(true)
    app.unmount()
    restore()
  })

  it('opens an earlier conversation in the middle and comes back to the chat', async () => {
    answers[`${API}.conversation`] = () =>
      Promise.resolve({
        conversation: { id: 'C1', title: 'Factura XMovil' },
        messages: [
          { role: 'user', text: '¿Cuánto le debo a XMovil?', mid: 'm1' },
        ],
      })
    const { app, restore } = await openWorkspace()
    q('[data-conversation="C1"] button').click()
    await flush()
    expect(calls('conversation').at(-1)[1]).toEqual({ conversation_id: 'C1' })
    expect(q('[data-testid="assistant-transcript"]').textContent).toContain(
      '¿Cuánto le debo a XMovil?',
    )
    expect(q('[data-testid="assistant-back"]').textContent).toContain(
      'Factura XMovil',
    )
    q('[data-testid="assistant-back"]').click()
    await flush()
    expect(sessions.view).toBe('chat')
    expect(q('[data-testid="assistant-input"]')).not.toBeNull()
    app.unmount()
    restore()
  })

  it('a new conversation settles, reloads the list and goes back to the default model', async () => {
    answers[`${API}.liquidar`] = () =>
      Promise.resolve({ ok: true, closed: 'C2', archived: [], cutoff: 'x' })
    const { app, restore } = await openWorkspace()
    const before = calls('conversations').length
    const modelsBefore = calls('models').length
    q('[data-testid="assistant-sidebar-new"]').click()
    await flush()
    await flush()
    expect(calls('liquidar')).toHaveLength(1)
    expect(calls('conversations').length).toBeGreaterThan(before)
    expect(calls('models').length).toBeGreaterThan(modelsBefore)
    app.unmount()
    restore()
  })

  it('folds each side and remembers it; minimize goes back to the dock', async () => {
    const { app, restore } = await openWorkspace()
    q('[data-testid="assistant-toggle-sidebar"]').click()
    q('[data-testid="assistant-toggle-panels"]').click()
    await flush()
    expect(q('[data-testid="assistant-sidebar"]')).toBeNull()
    expect(q('[data-testid="assistant-side-panels"]')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('muelle-assistant-layout'))).toEqual(
      {
        sidebar: false,
        panels: true,
      },
    )
    // with the column folded, the header keeps a new conversation at hand
    expect(q('[data-testid="assistant-new"]')).not.toBeNull()
    q('[data-testid="assistant-toggle-panels"]').click()
    await flush()
    expect(q('[data-testid="assistant-side-panels"]')).toBeNull()
    // «/abierto» shows the panels instead of leaving the chat
    showView('open')
    await flush()
    expect(sessions.view).toBe('chat')
    expect(q('[data-testid="assistant-side-panels"]')).not.toBeNull()
    q('[data-testid="assistant-toggle-sidebar"]').click()
    await flush()
    expect(q('[data-testid="assistant-sidebar"]')).not.toBeNull()

    q('[data-testid="assistant-minimize"]').click()
    await flush()
    expect(assistant.full).toBe(false)
    expect(q('[data-testid="assistant-workspace"]')).toBeNull()
    expect(q('[data-testid="assistant-dock"]')).not.toBeNull()
    app.unmount()
    restore()
  })

  it('an answer refreshes «Abierto» and the agenda beside it', async () => {
    const { app, restore } = await openWorkspace()
    const before = calls('open_work').length
    assistant.thinking = true
    await flush()
    assistant.thinking = false
    await flush()
    expect(calls('open_work').length).toBe(before + 1)
    app.unmount()
    restore()
  })

  it('Esc puts the workspace away', async () => {
    const { app, restore } = await openWorkspace()
    q('[data-testid="assistant-input"]').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    )
    await flush()
    expect(assistant.open).toBe(false)
    app.unmount()
    restore()
  })

  it('the Lienzo keeps the composer; a question asked there answers in the chat', async () => {
    const { app, restore } = await openWorkspace()
    showView('canvas')
    // the Lienzo view is its own chunk
    await vi.waitFor(() =>
      expect(q('[data-testid="assistant-canvas-view"]')).not.toBeNull(),
    )
    const input = q('[data-testid="assistant-input"]')
    expect(input).not.toBeNull()
    assistant.draft = '¿Qué dice la tabla de ventas?'
    await flush()
    q('[data-testid="assistant-send"]').click()
    await flush()
    expect(calls('say').at(-1)[1].text).toBe('¿Qué dice la tabla de ventas?')
    expect(sessions.view).toBe('chat')
    app.unmount()
    restore()
  })
})

describe('managing conversations (T3 thread menu)', () => {
  let rows
  beforeEach(() => {
    rows = [
      {
        id: 'C1',
        title: 'Factura XMovil',
        ended_at: '2026-11-04 10:00:00',
        messages: 6,
      },
    ]
    answers[`${API}.conversations`] = () =>
      Promise.resolve({
        available: true,
        current: { title: 'Ventas de hoy', messages: 2 },
        conversations: rows.filter((r) => !r.snoozed_until),
        snoozed: rows.filter((r) => r.snoozed_until),
        archived: 0,
      })
  })

  async function openWorkspace() {
    const restore = desktop()
    const mounted = await mount(AssistantSheet)
    assistant.open = true
    assistant.full = true
    await vi.waitFor(() => expect(q('[data-conversation="C1"]')).not.toBeNull())
    await flush()
    return { ...mounted, restore }
  }
  const more = (id) =>
    q(`[data-conversation="${id}"] [data-testid="assistant-sidebar-more"]`)
  const action = (key) =>
    q(`[data-conversation-actions] [data-action="${key}"]`)

  it('groups pinned, to review, by day and resolved last', () => {
    const now = new Date(2026, 10, 5, 12)
    const groups = groupConversations(
      [
        { id: 'a', ended_at: '2026-11-05 09:00:00', settled: true },
        { id: 'b', ended_at: '2026-10-01 09:00:00', unread: true },
        { id: 'c', ended_at: '2026-11-05 08:00:00' },
        {
          id: 'd',
          ended_at: '2026-10-01 09:00:00',
          pinned: true,
          unread: true,
        },
      ],
      now,
    )
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
      ['pinned', ['d']],
      ['unread', ['b']],
      ['today', ['c']],
      ['settled', ['a']],
    ])
  })

  it('«⋯» unfolds the actions in place and resolving reloads the list', async () => {
    answers[`${API}.conversation_settle`] = ({ settled }) => {
      rows[0].settled = !!settled
      return Promise.resolve(rows[0])
    }
    const { app, restore } = await openWorkspace()
    more('C1').click()
    await flush()
    expect(
      [
        ...document.querySelectorAll(
          '[data-conversation-actions] [data-action]',
        ),
      ].map((b) => b.dataset.action),
    ).toEqual([
      'pin',
      'settle',
      'snooze',
      'rename',
      'retitle',
      'unread',
      'copy',
      'continue',
      'archive',
    ])
    // the keyboard is in the menu
    expect(document.activeElement).toBe(action('pin'))
    const before = calls('conversations').length
    action('settle').click()
    await flush()
    expect(calls('conversation_settle')[0][1]).toEqual({
      conversation_id: 'C1',
      settled: 1,
    })
    expect(calls('conversations').length).toBe(before + 1)
    expect(q('[data-conversation-actions]')).toBeNull()
    expect(q('[data-conversation="C1"] [data-mark="settled"]')).not.toBeNull()
    expect(q('[data-testid="assistant-sidebar"]').textContent).toContain(
      'Resolved',
    )
    app.unmount()
    restore()
  })

  it('snooze picks a preset; the row waits under «Snoozed» and comes back', async () => {
    answers[`${API}.conversation_snooze`] = ({ preset }) => {
      rows[0].snoozed_until = preset ? '2026-11-09 09:00:00' : null
      return Promise.resolve(rows[0])
    }
    const { app, restore } = await openWorkspace()
    more('C1').click()
    await flush()
    action('snooze').click()
    await flush()
    const presets = [...document.querySelectorAll('[data-snooze]')]
    expect(presets.map((b) => b.dataset.snooze)).toEqual([
      '1h',
      '3h',
      'tomorrow',
      'monday',
    ])
    expect(document.activeElement).toBe(presets[0])
    presets[3].click()
    await flush()
    expect(calls('conversation_snooze')[0][1]).toEqual({
      conversation_id: 'C1',
      preset: 'monday',
    })
    const waiting = q('[data-testid="assistant-sidebar-snoozed"]')
    expect(waiting.textContent).toContain('Factura XMovil')
    waiting.querySelector('[aria-label^="Back to the list now"]').click()
    await flush()
    expect(calls('conversation_snooze')[1][1]).toEqual({
      conversation_id: 'C1',
    })
    expect(q('[data-testid="assistant-sidebar-snoozed"]')).toBeNull()
    app.unmount()
    restore()
  })

  it('an unread row shows its dot until it is opened', async () => {
    rows[0].unread = true
    answers[`${API}.conversation`] = () => {
      rows[0].unread = false
      return Promise.resolve({ conversation: rows[0], messages: [] })
    }
    const { app, restore } = await openWorkspace()
    expect(q('[data-conversation="C1"] [data-mark="unread"]')).not.toBeNull()
    expect(q('[data-testid="assistant-sidebar"]').textContent).toContain(
      'To review',
    )
    q(
      '[data-conversation="C1"] button[aria-current], [data-conversation="C1"] button',
    ).click()
    await flush()
    expect(q('[data-conversation="C1"] [data-mark="unread"]')).toBeNull()
    more('C1').click()
    await flush()
    expect(action('unread').textContent).toContain('Mark as unread')
    app.unmount()
    restore()
  })

  it('regenerates the title and copies the conversation', async () => {
    answers[`${API}.conversation_retitle`] = () => {
      rows[0].title = 'Factura de XMovil por pagar'
      return Promise.resolve(rows[0])
    }
    answers[`${API}.conversation_export`] = () =>
      Promise.resolve({
        text: 'Conversación con el Asistente Muelle: «Factura XMovil»',
      })
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { app, restore } = await openWorkspace()
    more('C1').click()
    await flush()
    action('retitle').click()
    await flush()
    expect(q('[data-conversation="C1"]').textContent).toContain(
      'Factura de XMovil por pagar',
    )
    more('C1').click()
    await flush()
    action('copy').click()
    await flush()
    expect(writeText).toHaveBeenCalledWith(
      'Conversación con el Asistente Muelle: «Factura XMovil»',
    )
    expect(
      q('[data-testid="assistant-sidebar"] [role="status"]').textContent,
    ).toContain('Conversation copied.')
    app.unmount()
    restore()
  })

  it('rename from the menu opens the name field; Esc in the menu keeps the workspace', async () => {
    const { app, restore } = await openWorkspace()
    more('C1').click()
    await flush()
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    )
    await flush()
    expect(q('[data-conversation-actions]')).toBeNull()
    expect(assistant.open).toBe(true)
    expect(document.activeElement).toBe(more('C1'))
    more('C1').click()
    await flush()
    action('rename').click()
    await flush()
    expect(q('[data-conversation="C1"] form input').value).toBe(
      'Factura XMovil',
    )
    app.unmount()
    restore()
  })
})
