// The assistant's desktop workspace (Marco 2026-11-05: model selection,
// conversations on the left, side panels on the right) and the composer's
// model picker, which the dock and the phone sheet share.
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

  it('puts conversations left, the chat in the middle and the panels right', async () => {
    const { app, restore } = await openWorkspace()
    expect(q('[data-testid="assistant-workspace"]')).not.toBeNull()
    expect(q('[data-testid="assistant-dock"]')).toBeNull()
    expect(q('[data-testid="assistant-sidebar"]')).not.toBeNull()
    expect(q('[data-testid="assistant-input"]')).not.toBeNull()
    expect(q('[data-testid="assistant-model"]')).not.toBeNull()
    expect(
      [...document.querySelectorAll('[data-panel]')].map(
        (p) => p.dataset.panel,
      ),
    ).toEqual(['screen', 'open', 'agenda', 'canvas', 'conversation'])
    expect(q('[data-conversation="C1"]').textContent).toContain(
      'Factura XMovil',
    )
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
    expect(q('[data-testid="assistant-side-panels"]')).toBeNull()
    expect(
      JSON.parse(localStorage.getItem('muelle-assistant-workspace')),
    ).toEqual({
      sidebar: false,
      panels: false,
    })
    // «/abierto» shows the panels instead of leaving the chat
    showView('open')
    await flush()
    expect(sessions.view).toBe('chat')
    expect(q('[data-testid="assistant-side-panels"]')).not.toBeNull()

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
})
