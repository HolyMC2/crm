import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import AssistantComposer from '@/components/assistant/AssistantComposer.vue'
import {
  DEBOUNCE_MS,
  _resetComplete,
  complete,
  moveActive,
  pickItem,
  resolveCommand,
  tokenAt,
  updateComplete,
} from '@/components/assistant/assistantAutocomplete'
import { _resetAssistant, assistant } from '@/components/assistant/useAssistant'
import {
  _resetSessions,
  sessions,
} from '@/components/assistant/assistantSessions'

const API = 'doco.docoutils.assistant.shell_api'

// doco assistant/comandos.py, as autocompletar returns it
const COMMANDS = [
  {
    cmd: '/nueva',
    label: 'Nueva conversación',
    hint: 'Empieza de cero',
    kind: 'client',
    action: 'new',
  },
  {
    cmd: '/encargos',
    label: 'Mi agenda con el asistente',
    hint: 'Qué te encargué',
    kind: 'say',
    say: '¿Qué encargos tienes en tu agenda para mí?',
  },
  {
    cmd: '/recuerdame',
    label: 'Recuérdame…',
    hint: '/recuerdame mañana a las 9 revisar los cobros',
    kind: 'say',
    template: 'Recuérdame {texto}',
  },
  {
    cmd: '/abierto',
    label: 'Trabajo abierto',
    hint: 'Capturas y propuestas',
    kind: 'client',
    action: 'open',
  },
]
const PEOPLE = [
  { name: 'andres@tienda.mx', label: 'Andrés López', self: false },
  { name: 'tere@tienda.mx', label: 'Tere Ruiz', self: false },
]

function answer(method, args) {
  if (method === `${API}.autocompletar`) {
    const q = String(args.q || '').toLowerCase()
    const items =
      args.kind === 'persona'
        ? PEOPLE.filter((p) => p.label.toLowerCase().startsWith(q))
        : COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q))
    return Promise.resolve({ kind: args.kind, items })
  }
  if (method === `${API}.history`) return Promise.resolve([])
  if (method === `${API}.open_work`)
    return Promise.resolve({ captures: [], proposals: [], count: 0 })
  return Promise.resolve({ ok: true })
}

function calls(method) {
  return mocks.call.mock.calls.filter(([m]) => m === method)
}

beforeEach(() => {
  _resetAssistant()
  _resetSessions()
  _resetComplete()
  mocks.call.mockReset()
  mocks.call.mockImplementation(answer)
})

afterEach(() => {
  vi.useRealTimers()
})

async function settle() {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
  await Promise.resolve()
  await nextTick()
}

describe('the token under the caret', () => {
  it('reads «/» only as the first word, «@» after a space or at the start', () => {
    expect(tokenAt('/rec')).toEqual({
      kind: 'comando',
      query: 'rec',
      start: 0,
      end: 4,
    })
    expect(tokenAt('dile a @an')).toEqual({
      kind: 'persona',
      query: 'an',
      start: 7,
      end: 10,
    })
    expect(tokenAt('@')).toMatchObject({ kind: 'persona', query: '' })
    // a slash in the middle of a sentence, an email and a finished word are not tokens
    expect(tokenAt('ventas 1/2')).toBe(null)
    expect(tokenAt('manda a tere@tienda.mx')).toBe(null)
    expect(tokenAt('/recuerdame mañana')).toBe(null)
  })
})

describe('the list', () => {
  it('opens from the server after a short pause, and a late answer never wins', async () => {
    vi.useFakeTimers()
    updateComplete('/re', 3)
    updateComplete('/rec', 4)
    await settle()
    expect(calls(`${API}.autocompletar`)).toHaveLength(1)
    expect(calls(`${API}.autocompletar`)[0][1]).toEqual({
      q: 'rec',
      kind: 'comando',
    })
    expect(complete.open).toBe(true)
    expect(complete.items.map((i) => i.cmd)).toEqual(['/recuerdame'])
    // the caret leaves the token: the list closes
    updateComplete('/recuerdame mañana', 18)
    expect(complete.open).toBe(false)
  })

  it('moves with the arrows and wraps around', async () => {
    vi.useFakeTimers()
    updateComplete('/', 1)
    await settle()
    expect(complete.active).toBe(0)
    moveActive(-1)
    expect(complete.active).toBe(COMMANDS.length - 1)
    moveActive(1)
    expect(complete.active).toBe(0)
  })

  it('inserts «@Nombre» for a coworker and keeps the rest of the sentence', async () => {
    vi.useFakeTimers()
    updateComplete('avísale a @te que ya llegó', 13)
    await settle()
    expect(complete.items.map((i) => i.label)).toEqual(['Tere Ruiz'])
    const out = pickItem('avísale a @te que ya llegó')
    expect(out.text).toBe('avísale a @Tere Ruiz que ya llegó')
    expect(out.caret).toBe('avísale a @Tere Ruiz '.length)
    expect(complete.open).toBe(false)
  })

  it('keeps a template command to finish, sends a say one, runs a client one', async () => {
    vi.useFakeTimers()
    updateComplete('/rec', 4)
    await settle()
    expect(pickItem('/rec')).toEqual({ text: '/recuerdame ', caret: 12 })
    updateComplete('/enc', 4)
    await settle()
    expect(pickItem('/enc')).toEqual({
      send: '¿Qué encargos tienes en tu agenda para mí?',
      text: '',
    })
    updateComplete('/nu', 3)
    await settle()
    expect(pickItem('/nu')).toEqual({ action: 'new', text: '' })
  })
})

describe('a typed command', () => {
  it('goes out expanded, as comandos.expand', async () => {
    expect(
      await resolveCommand('/recuerdame  mañana a las 9   revisar cobros'),
    ).toEqual({ text: 'Recuérdame mañana a las 9 revisar cobros' })
    expect(await resolveCommand('/abierto')).toEqual({ action: 'open' })
    // not a command: sent as typed
    expect(await resolveCommand('/nada que ver')).toBe(null)
    expect(await resolveCommand('hola')).toBe(null)
  })
})

describe('in the composer', () => {
  let el, app
  afterEach(() => {
    app?.unmount()
    el?.remove()
  })

  function mount() {
    el = document.createElement('div')
    document.body.appendChild(el)
    app = createApp({ render: () => h(AssistantComposer) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
  }

  function type(input, value) {
    input.value = value
    input.setSelectionRange(value.length, value.length)
    input.dispatchEvent(new Event('input'))
  }

  function key(input, name) {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    return event
  }

  it('picks with the arrows and Enter, and Esc closes the list, not the sheet', async () => {
    vi.useFakeTimers()
    assistant.status = { enabled: true }
    mount()
    const input = el.querySelector('[data-testid="assistant-input"]')
    type(input, '/')
    await settle()
    const list = el.querySelector('[data-testid="assistant-complete"]')
    expect(list).not.toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    key(input, 'ArrowDown')
    key(input, 'ArrowDown')
    await nextTick()
    expect(input.getAttribute('aria-activedescendant')).toBe(
      'assistant-complete-2',
    )
    key(input, 'Enter')
    await nextTick()
    // «/recuerdame» waits for its text; nothing was sent
    expect(assistant.draft).toBe('/recuerdame ')
    expect(calls(`${API}.say`)).toHaveLength(0)

    type(input, '/recuerdame @')
    await settle()
    expect(
      [...el.querySelectorAll('[role="option"]')].map((o) =>
        o.textContent.trim(),
      ),
    ).toEqual(['Andrés López', 'Tere Ruiz'])
    const esc = key(input, 'Escape')
    await nextTick()
    expect(esc.defaultPrevented).toBe(true)
    expect(el.querySelector('[data-testid="assistant-complete"]')).toBeNull()
  })

  it('runs a client command on a tap (phone) and sends a typed one expanded', async () => {
    vi.useFakeTimers()
    assistant.status = { enabled: true }
    mount()
    const input = el.querySelector('[data-testid="assistant-input"]')
    type(input, '/ab')
    await settle()
    el.querySelector('[data-complete="/abierto"]').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    )
    await vi.runAllTimersAsync()
    expect(sessions.view).toBe('open')
    expect(assistant.draft).toBe('')

    vi.useRealTimers()
    assistant.draft = '/recuerdame mañana llamar a Andrés'
    await nextTick()
    el.querySelector('form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
    expect(calls(`${API}.say`)[0][1].text).toBe(
      'Recuérdame mañana llamar a Andrés',
    )
  })
})
