import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: mocks.call,
  BottomSheet: { render: () => null },
}))
// The sheet's frame is S1's (tested there); here only its slots matter.
vi.mock('@/components/ui/BottomSheet.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]),
  },
}))

import {
  chipsFor,
  inlineParts,
  looksLikeQuestion,
  mergeHistory,
  proseBlocks,
  visibleMessages,
  proseOf,
  questionText,
  shellPathFor,
  splitButtons,
  textParts,
  newClientId,
  normalizeRow,
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
import AssistantSheet from '@/components/assistant/AssistantSheet.vue'

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
        detail: null,
        confirm: 'agr:RUN-1:p1:a',
        change: 'agr:RUN-1:p1:r',
      },
    ])
    expect(choices).toEqual([{ label: 'Ver más', data: 'more:1' }])
    // the numbered line lives on the card only, and so does doco's frame
    expect(proseOf(message, cards)).toBe('')
    expect(
      proseOf(
        { ...message, text: `${message.text}\nLo ves en Pendientes.` },
        cards,
      ),
    ).toBe('Lo ves en Pendientes.')
  })

  it("puts an approval's indented detail on its card: what will change", () => {
    // doco action_cards.render_pending + collab_actions.preview (crear_pendiente)
    const message = {
      text: [
        '⏸ El agente propone y espera tu decisión:',
        '1. ✅ Pendiente personal',
        '   «Llamar a este cliente» sobre Customer S2c · para 2026-10-19 10:00',
        'Al aprobar se guardan los cambios mostrados.',
      ].join('\n'),
      buttons: [
        [
          { text: '⚡ Aprobar 1', callback_data: 'agr:RUN-2:p9:a' },
          { text: '❌ Rechazar 1', callback_data: 'agr:RUN-2:p9:r' },
        ],
      ],
    }
    const { cards } = splitButtons(message)
    expect(cards[0]).toMatchObject({
      summary: 'Pendiente personal',
      detail:
        '«Llamar a este cliente» sobre Customer S2c · para 2026-10-19 10:00',
    })
    // the card asks and saves: doco's frame around it is not repeated
    expect(proseOf(message, cards)).toBe('')
  })

  it('opens links of this site written as http:// behind the https proxy', () => {
    const host = globalThis.location.host
    expect(shellPathFor(`http://${host}/crm/pendientes/todo/q3f`)).toBe(
      '/pendientes/todo/q3f',
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

  it('marks an answer doco cannot replay as an earlier answer', () => {
    const stale = normalizeRow({
      kind: 'bot',
      mid: 'm1',
      message:
        'Este resultado necesita una consulta nueva con tu acceso actual. Tu mensaje y borrador se conservan.',
    })
    expect(stale.stale).toBe(true)
    expect(
      normalizeRow({ kind: 'bot', mid: 'm2', message: 'Hola' }).stale,
    ).toBe(false)
    expect(
      normalizeRow({
        kind: 'user',
        message: 'Este resultado necesita una consulta nueva',
      }).stale,
    ).toBe(false)
  })

  it('reads a model outage as one line, with the raw provider error too', () => {
    const row = (message) => normalizeRow({ kind: 'bot', mid: 'x', message })
    expect(
      row(
        '⚠️ El asistente inteligente no está disponible en este momento por un problema del servicio de IA; ya avisamos a Muelle.',
      ).down,
    ).toBe(true)
    expect(
      row(
        'No pude completar la consulta: LLM provider unavailable: provider=openai_compat, status=None, request_id=None.',
      ).down,
    ).toBe(true)
    expect(row('Tienes 3 pendientes.').down).toBe(false)
  })

  it("reads the model's Markdown as bold, lists and tables, not asterisks and pipes", () => {
    expect(inlineParts('Vence **hoy**: $1,500')).toEqual([
      { text: 'Vence ' },
      { text: 'hoy', strong: true },
      { text: ': $1,500' },
    ])
    expect(inlineParts('2 ** 3 y **')).toEqual([{ text: '2 ** 3 y **' }])
    expect(inlineParts('lo puso como *Refacciones S26*, pero 2*3*4')).toEqual([
      { text: 'lo puso como ' },
      { text: 'Refacciones S26', em: true },
      { text: ', pero 2*3*4' },
    ])
    const blocks = proseBlocks(
      [
        '### Pagos vencidos',
        'Lo primero:',
        '1. **XMovil:** $9,969',
        '- Refacciones: $1,500',
        '',
        '| Cotización | Total |',
        '|---|---:|',
        '| SAL-QTN-6 | $1,100 |',
        '| SAL-QTN-5 | $1,850 |',
        'Dime cuál.',
      ].join('\n'),
    )
    expect(blocks.map((b) => b.type)).toEqual([
      'h',
      'p',
      'li',
      'li',
      'table',
      'p',
    ])
    expect(blocks[2]).toEqual({
      type: 'li',
      marker: '1.',
      nested: false,
      parts: [{ text: 'XMovil:', strong: true }, { text: ' $9,969' }],
    })
    expect(blocks[3].marker).toBe('•')
    expect(blocks[3].nested).toBe(false)
    expect(proseBlocks('2. ¿Cómo?\n   - Cita')[1]).toMatchObject({
      type: 'li',
      nested: true,
    })
    expect(blocks[4].head).toEqual([
      [{ text: 'Cotización' }],
      [{ text: 'Total' }],
    ])
    expect(blocks[4].rows).toEqual([
      [[{ text: 'SAL-QTN-6' }], [{ text: '$1,100' }]],
      [[{ text: 'SAL-QTN-5' }], [{ text: '$1,850' }]],
    ])
    // a Desk link without a shell screen reads as its record name
    expect(
      inlineParts('Ver http://x.invalid/desk/captura-contable/CAP-7'),
    ).toEqual([
      { text: 'Ver ' },
      { href: 'http://x.invalid/desk/captura-contable/CAP-7', label: 'CAP-7' },
    ])
  })

  it('drops an outage line once a later answer came, with its question', () => {
    const row = (kind, message, mid) => normalizeRow({ kind, message, mid })
    const down = 'El asistente inteligente no está disponible en este momento.'
    const old = [
      row('user', '¿Facturas del RFC?', 'u1'),
      row('bot', down, 'b1'),
      row('user', '¿Qué hago primero hoy?', 'u2'),
      row('bot', 'Consultando…', 'p2'),
      row('bot', 'Lo primero: cobrar.', 'b2'),
    ]
    expect(visibleMessages(old).map((m) => m.id)).toEqual(['u2', 'b2'])
    const now = [row('user', 'Hola', 'u3'), row('bot', down, 'b3')]
    expect(visibleMessages(now).map((m) => m.id)).toEqual(['u3', 'b3'])
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
    // the agent's own words may come first; the card waits for the link
    onMessage({ chat_id: staff.chat_id, mid: 'n1', text: 'Quedó ligado.' })
    expect(assistant.awaitingReceipt).toBe('agr:RUN-1:p1:a')
    onMessage({
      chat_id: staff.chat_id,
      mid: 'r1',
      text: 'Listo: /app/todo/T-9',
    })
    expect(assistant.messages.at(-1).receiptOf).toBe('agr:RUN-1:p1:a')
    expect(assistant.awaitingReceipt).toBe(null)
    await tap('agr:RUN-1:p2:r', 'agr:RUN-1:p2:r')
    expect(assistant.cards['agr:RUN-1:p2:r']).toBe('changed')
  })

  it('a reload of the history keeps the answers this page saw live', async () => {
    await openAssistant()
    onMessage({
      chat_id: staff.chat_id,
      mid: 'c1',
      text: '1. ✅ Pendiente personal',
      buttons: [[{ text: '⚡ Aprobar 1', callback_data: 'agr:R:p:a' }]],
    })
    mocks.call.mockImplementation((method) =>
      method === `${API}.history`
        ? Promise.resolve([
            {
              kind: 'bot',
              mid: 'c1',
              message:
                'Este resultado necesita una consulta nueva con tu acceso actual.',
            },
          ])
        : answer(method),
    )
    const { loadHistory } = await import('@/components/assistant/useAssistant')
    await loadHistory()
    expect(assistant.messages).toHaveLength(1)
    expect(assistant.messages[0].buttons).toHaveLength(1)
    expect(assistant.messages[0].stale).toBeFalsy()
  })

  it('a reload keeps a live card the history leaves out, and its receipt', () => {
    const live = [
      { id: 'u1', mid: 'u1', role: 'user', text: 'Mañana a las 10' },
      {
        id: 'c1',
        mid: 'c1',
        role: 'bot',
        text: '1. Pendiente',
        buttons: [[{}]],
      },
      {
        id: 'r1',
        mid: 'r1',
        role: 'bot',
        text: 'Creado /app/todo/T',
        receiptOf: 'agr:R:p:a',
      },
    ]
    const rows = [
      { id: 'u1', mid: 'u1', role: 'user', text: 'Mañana a las 10' },
      { id: 'n1', mid: 'n1', role: 'bot', text: 'Listo, dejé el pendiente' },
      { id: 'r1', mid: 'r1', role: 'bot', text: 'Creado /app/todo/T' },
    ]
    const merged = mergeHistory(rows, live)
    expect(merged.map((m) => m.mid)).toEqual(['u1', 'c1', 'n1', 'r1'])
    expect(merged[3].receiptOf).toBe('agr:R:p:a')
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

describe('the ⌘J door', () => {
  it("is the shell's: the sheet itself does not listen for ⌘J", async () => {
    const { app } = mount(AssistantSheet)
    await openAssistant()
    await nextTick()
    expect(assistant.open).toBe(true)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }),
    )
    await nextTick()
    // Only shellKeyboard's shellAssistant (MuelleShell) toggles it now.
    expect(assistant.open).toBe(true)
    app.unmount()
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

describe('the suggestion rules', async () => {
  const { hoySuggestion, contactoSuggestion } = await import(
    '@/components/assistant/suggestions'
  )
  it('Hoy: the oldest overdue pendiente, else a deal without a next step, else nothing', () => {
    const data = {
      pendientes: {
        available: true,
        overdue: {
          rows: [
            {
              doctype: 'ToDo',
              name: 'T2',
              date: '2026-10-10',
              description: '<p>Llamar a Ana</p>',
            },
            {
              doctype: 'ToDo',
              name: 'T1',
              date: '2026-03-02',
              description: 'Cobrar a Aaron',
            },
          ],
        },
      },
      seguimiento: {
        available: true,
        rows: [{ name: 'D1', title: 'Galaxy A54' }],
      },
    }
    const s = hoySuggestion(data)
    expect(s.reason).toBe('Overdue since 2 de marzo: Cobrar a Aaron')
    expect(s.verb).toBe('Resolve')
    expect(s.prompt).toContain('Cobrar a Aaron')
    data.pendientes.overdue.rows = []
    expect(hoySuggestion(data).reason).toBe('«Galaxy A54» has no next step')
    expect(
      hoySuggestion({
        pendientes: { available: false },
        seguimiento: { available: true, rows: [] },
      }),
    ).toBeNull()
  })

  it('Contacto: only an overdue balance is a reason', () => {
    const owed = {
      customer: 'C1',
      currency: 'MXN',
      overdue_amount: 775,
      invoices: [
        { overdue_days: 0, next_due: '2026-11-01' },
        { overdue_days: 200, next_due: '2026-03-15' },
      ],
    }
    const s = contactoSuggestion('Aaron Telez', owed)
    expect(s.reason).toMatch(/^Owes \$775(\.00)? since 15 de marzo$/)
    expect(s.verb).toBe('Collect')
    expect(s.prompt).toContain('Aaron Telez')
    expect(
      contactoSuggestion('Aaron', { ...owed, overdue_amount: 0 }),
    ).toBeNull()
    expect(contactoSuggestion('Aaron', null)).toBeNull()
  })
})
