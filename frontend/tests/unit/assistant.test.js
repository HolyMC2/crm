import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: mocks.call,
  BottomSheet: { render: () => null },
}))

import {
  chipsFor,
  looksLikeQuestion,
  proseOf,
  questionText,
  shellPathFor,
  splitButtons,
  textParts,
  newClientId,
} from '@/components/assistant/assistantText'
import {
  _resetAssistant,
  assistant,
  onMessage,
  openAssistant,
  screenContext,
  send,
  tap,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { createAssistantProvider } from '@/components/assistant/assistantPalette'
import ActionCard from '@/components/assistant/ActionCard.vue'
import SuggestionLine from '@/components/assistant/SuggestionLine.vue'

const API = 'doco.docoutils.assistant.shell_api'
const staff = { enabled: true, role: 'staff', chat_id: 'desk:ana@tienda.mx' }

function answer(method, args) {
  if (method === `${API}.status`) return Promise.resolve(staff)
  if (method === `${API}.history`) return Promise.resolve([])
  return Promise.resolve({ ok: true })
}

beforeEach(() => {
  _resetAssistant()
  mocks.call.mockReset()
  mocks.call.mockImplementation(answer)
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

describe('what a reply says', () => {
  it('turns run approvals into cards with their line, and keeps choices apart', () => {
    const message = {
      text: '⏸ El agente propone y espera tu decisión:\n1. Crear Seguimiento para AARON mañana 10:00\nAl aprobar se guardan los cambios mostrados.',
      buttons: [
        [
          { text: '⚡ Aprobar 1', callback_data: 'agr:RUN-1:p1:a' },
          { text: '❌ Rechazar 1', callback_data: 'agr:RUN-1:p1:r' },
        ],
        [{ text: 'Ver más', callback_data: 'more:1' }],
      ],
    }
    const { cards, choices } = splitButtons(message)
    expect(cards).toEqual([
      {
        id: 'agr:RUN-1:p1:a',
        summary: 'Crear Seguimiento para AARON mañana 10:00',
        confirm: 'agr:RUN-1:p1:a',
        change: 'agr:RUN-1:p1:r',
      },
    ])
    expect(choices).toEqual([{ label: 'Ver más', data: 'more:1' }])
    // the numbered line lives on the card only; the leading emoji goes
    expect(proseOf(message, cards)).toBe(
      'El agente propone y espera tu decisión:\nAl aprobar se guardan los cambios mostrados.',
    )
  })

  it('reads a parked proposal (act:) as a card with its own label', () => {
    const { cards } = splitButtons({
      text: 'Listo',
      buttons: [
        [{ text: '⚡ Registrar la luz · $450.00', callback_data: 'act:cabc' }],
      ],
    })
    expect(cards[0]).toMatchObject({
      summary: 'Registrar la luz · $450.00',
      confirm: 'act:cabc',
      change: null,
    })
  })

  it('opens Desk links of shell records in the shell, never a Desk dead end', () => {
    expect(shellPathFor('/app/contact/CONT-0001')).toBe(
      '/contactos/contact/CONT-0001',
    )
    expect(shellPathFor('https://muelle.invalid/app/todo/abc')).toBe(
      '/pendientes/todo/abc',
    )
    expect(shellPathFor('/app/crm-deal/CRM-DEAL-1')).toBe('/deal/CRM-DEAL-1')
    expect(shellPathFor('/crm/hoy')).toBe('/hoy')
    expect(shellPathFor('/app/journal-entry/JE-1')).toBeNull()
    expect(shellPathFor('https://evil.example/app/contact/x')).toBeNull()
    const parts = textParts('Listo: /app/todo/T-9. Gracias')
    expect(parts).toEqual([
      { text: 'Listo: ' },
      {
        href: '/app/todo/T-9',
        label: '/app/todo/T-9',
        to: '/pendientes/todo/T-9',
      },
      { text: '. Gracias' },
    ])
  })

  it('offers the chips of the screen', () => {
    expect(
      chipsFor({ doctype: 'Contact', name: 'C1' }).map((c) => c.label),
    ).toEqual([
      'Summary',
      'What do they owe?',
      'Schedule a follow-up',
      'Draft a message',
    ])
    expect(chipsFor({ route: '/crm/hoy' }).map((c) => c.label)).toEqual([
      'What do I do first?',
    ])
    expect(
      chipsFor({ route: '/crm/contactos', doctype: 'Contact' })[0].fill,
    ).toBe(true)
    expect(chipsFor({ route: '/crm/agenda' })).toEqual([])
  })

  it('knows a question from a search', () => {
    for (const q of [
      '¿Cuánto me debe Aaron?',
      'que hago primero',
      '?ventas de hoy',
      'muéstrame lo que vence esta semana por favor',
    ])
      expect(looksLikeQuestion(q)).toBe(true)
    for (const q of ['aaron', 'PUR-ORD-0001', '6671234567', ''])
      expect(looksLikeQuestion(q)).toBe(false)
    expect(questionText('?ventas de hoy')).toBe('ventas de hoy')
  })

  it('makes client ids api.say accepts', () => {
    expect(newClientId()).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })
})

describe('the conversation', () => {
  it('sends the screen with the question, then shows the reply in place', async () => {
    await openAssistant()
    assistant.context = {
      route: '/crm/contactos/contact/C1',
      doctype: 'Contact',
      name: 'C1',
      title: 'Aaron',
    }
    await send('¿Qué debe?')
    const say = mocks.call.mock.calls.find(([m]) => m === `${API}.say`)
    expect(say[1].text).toBe('¿Qué debe?')
    expect(JSON.parse(say[1].context)).toMatchObject({
      doctype: 'Contact',
      name: 'C1',
    })
    expect(say[1].client_id).toMatch(/^shell-/)
    expect(assistant.thinking).toBe(true)

    onMessage({
      chat_id: staff.chat_id,
      mid: 'm1',
      text: 'Buscando en ventas…',
      buttons: [],
    })
    expect(assistant.thinking).toBe(true)
    expect(assistant.progress).toBe('Buscando en ventas…')
    onMessage({
      chat_id: staff.chat_id,
      mid: 'm1',
      edit: true,
      text: 'Le debe $775 desde marzo.',
      buttons: [],
    })
    expect(assistant.thinking).toBe(false)
    expect(assistant.messages.filter((m) => m.role === 'bot')).toHaveLength(1)
    expect(assistant.messages.at(-1).text).toBe('Le debe $775 desde marzo.')
    // another person's chat never lands here
    onMessage({ chat_id: 'desk:otro@tienda.mx', mid: 'x', text: 'no' })
    expect(assistant.messages.at(-1).text).toBe('Le debe $775 desde marzo.')
  })

  it('without the chip, only the route goes', async () => {
    await openAssistant()
    assistant.context = {
      route: '/crm/hoy',
      doctype: 'Contact',
      name: 'C1',
      title: 'x',
    }
    assistant.contextOn = false
    await send('hola')
    const say = mocks.call.mock.calls.find(([m]) => m === `${API}.say`)
    expect(JSON.parse(say[1].context)).toEqual({ route: '/crm/hoy' })
  })

  it('a confirmed card gets the next reply as its receipt', async () => {
    await openAssistant()
    await tap('agr:RUN-1:p1:a', 'agr:RUN-1:p1:a')
    expect(mocks.call).toHaveBeenCalledWith(`${API}.callback`, {
      data: 'agr:RUN-1:p1:a',
    })
    expect(assistant.cards['agr:RUN-1:p1:a']).toBe('confirmed')
    onMessage({
      chat_id: staff.chat_id,
      mid: 'r1',
      text: 'Listo: /app/todo/T-9',
    })
    expect(assistant.messages.at(-1).receiptOf).toBe('agr:RUN-1:p1:a')
    await tap('agr:RUN-1:p2:r', 'agr:RUN-1:p2:r')
    expect(assistant.cards['agr:RUN-1:p2:r']).toBe('changed')
  })

  it('a failed send says so and keeps the text', async () => {
    await openAssistant()
    mocks.call.mockImplementation((method, args) =>
      method === `${API}.say`
        ? Promise.reject(new Error('El asistente está apagado en este sitio.'))
        : answer(method, args),
    )
    await send('hola')
    expect(assistant.messages.at(-1)).toMatchObject({
      text: 'hola',
      failed: true,
    })
    expect(assistant.error).toBe('El asistente está apagado en este sitio.')
    expect(assistant.thinking).toBe(false)
  })

  it('does not open for someone without the assistant', async () => {
    mocks.call.mockResolvedValue({ enabled: false })
    expect(await openAssistant()).toBe(false)
    expect(assistant.open).toBe(false)
  })

  it('a page names its record; a page without one still gives its route', () => {
    const route = { fullPath: '/hoy' }
    expect(screenContext(route, 'Hoy')).toEqual({
      route: '/crm/hoy',
      doctype: '',
      name: '',
      title: 'Hoy',
      filters: {},
    })
    const remove = useAssistantContext(() => ({
      doctype: 'Contact',
      name: 'C1',
      title: 'Aaron',
      filters: { status: 'Abierto', x: 1 },
    }))
    expect(screenContext(route, 'Contactos')).toMatchObject({
      doctype: 'Contact',
      name: 'C1',
      title: 'Aaron',
      filters: { status: 'Abierto' },
    })
    remove()
    expect(screenContext(route, 'Hoy').doctype).toBe('')
  })
})

describe('the palette door', () => {
  it('offers «Preguntar a Muelle» for a question, and nothing for a search', async () => {
    const provider = createAssistantProvider()
    const items = await provider.search({
      raw: '¿cuánto vendí hoy?',
      text: '¿cuánto vendí hoy?',
      kind: 'text',
      scope: 'all',
    })
    expect(items).toEqual([
      expect.objectContaining({
        group: 'acciones',
        action: 'assistant',
        args: { text: '¿cuánto vendí hoy?' },
      }),
    ])
    expect(
      await provider.search({
        raw: 'aaron',
        text: 'aaron',
        kind: 'text',
        scope: 'all',
      }),
    ).toEqual([])
  })

  it('stays silent for someone without the assistant', async () => {
    mocks.call.mockResolvedValue({ enabled: false })
    const provider = createAssistantProvider()
    expect(
      await provider.search({ raw: '¿qué hago?', text: '¿qué hago?' }),
    ).toEqual([])
  })
})

describe('cards and suggestions', () => {
  it('a card asks before it changes anything', async () => {
    const onConfirm = vi.fn()
    const card = {
      id: 'a',
      summary: 'Seguimiento mañana 10:00',
      confirm: 'a',
      change: 'r',
    }
    const { el } = mount(ActionCard, { card, onConfirm })
    expect(el.textContent).toContain('Seguimiento mañana 10:00')
    el.querySelector('[data-testid="assistant-card-confirm"]').click()
    expect(onConfirm).toHaveBeenCalledWith(card)
    const receipt = mount(ActionCard, {
      card,
      state: 'confirmed',
      receipt: { to: '/pendientes/todo/T-9' },
    })
    await nextTick()
    expect(
      receipt.el.querySelector('[data-testid="assistant-card-confirm"]'),
    ).toBeNull()
    expect(
      receipt.el
        .querySelector('[data-testid="assistant-card-open"]')
        .getAttribute('href'),
    ).toBe('/pendientes/todo/T-9')
  })

  it('a suggestion asks when tapped and stays dismissed', async () => {
    const props = {
      id: 'contact:C1:debe',
      reason: 'Le debe $775 desde marzo',
      verb: 'Cobrar',
      prompt: '¿Cómo le cobro a Aaron?',
    }
    const { el } = mount(SuggestionLine, props)
    await vi.waitFor(() =>
      expect(
        el.querySelector('[data-testid="assistant-suggestion"]'),
      ).not.toBeNull(),
    )
    el.querySelector('[data-testid="assistant-suggestion"] button').click()
    await vi.waitFor(() =>
      expect(mocks.call).toHaveBeenCalledWith(
        `${API}.say`,
        expect.objectContaining({ text: '¿Cómo le cobro a Aaron?' }),
      ),
    )
    el.querySelector('[data-testid="assistant-suggestion-dismiss"]').click()
    await nextTick()
    expect(el.querySelector('[data-testid="assistant-suggestion"]')).toBeNull()
    const again = mount(SuggestionLine, props)
    await nextTick()
    expect(
      again.el.querySelector('[data-testid="assistant-suggestion"]'),
    ).toBeNull()
  })
})
