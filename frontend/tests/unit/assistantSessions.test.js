import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import {
  _resetAssistant,
  assistant,
  loadHistory,
  onMessage,
  onReset,
  onTyping,
} from '@/components/assistant/useAssistant'
import { _resetAgenda } from '@/components/assistant/assistantAgenda'
import {
  ACTIONS_API,
  CURRENT,
  _resetSessions,
  applyProposal,
  continueConversation,
  groupConversations,
  newConversation,
  openConversation,
  rejectProposal,
  SETTLE_DAYS,
  searchConversations,
  sessions,
  settledLine,
  showView,
  undoSettle,
} from '@/components/assistant/assistantSessions'
import AssistantHeader from '@/components/assistant/AssistantHeader.vue'
import AssistantOpenWork from '@/components/assistant/AssistantOpenWork.vue'
import AssistantConversations from '@/components/assistant/AssistantConversations.vue'

const API = 'doco.docoutils.assistant.shell_api'

const capture = {
  name: 'CAP-2026-00046',
  status: 'Mapeado',
  source: 'chat',
  supported: true,
  doctype: 'Purchase Invoice',
  doc_label: 'Factura de compra',
  supplier: 'AMOVIL',
  invoice_no: '10007310',
  total: 1200,
  currency: 'MXN',
  received_at: '2026-10-27 09:00:00',
}
const proposal = {
  name: 'ACC-0007',
  summary: 'Crear Seguimiento para AARON mañana 10:00',
  tool: 'crear_pendiente',
  created: '2026-10-27 09:30:00',
}

let work
let answers
function answer(method, args) {
  if (method in answers) return Promise.resolve(answers[method](args))
  if (method === `${API}.history`) return Promise.resolve([])
  if (method === `${API}.open_work`) return Promise.resolve(work)
  if (method === `${API}.encargos`) return Promise.resolve({ items: [] })
  return Promise.resolve({ ok: true })
}

beforeEach(() => {
  _resetAssistant()
  _resetSessions()
  _resetAgenda()
  work = { captures: [], proposals: [], count: 0 }
  answers = {}
  mocks.call.mockReset()
  mocks.call.mockImplementation(answer)
})

function calls(method) {
  return mocks.call.mock.calls.filter(([m]) => m === method)
}

async function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:p(.*)*', component: { render: () => null } },
      {
        path: '/gastos/captura/:name',
        name: 'GastoCaptura',
        component: { render: () => null },
      },
      {
        path: '/compras/captura/:name',
        name: 'CompraCaptura',
        component: { render: () => null },
      },
    ],
  })
  router.push('/compras')
  await router.isReady()
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  await flush()
  return { el, app, router }
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('a new conversation («Liquidar»)', () => {
  it('empties the chat before the server answers, then says what stays open', async () => {
    assistant.messages = [{ id: 'm1', role: 'user', text: 'hola' }]
    assistant.cards = { c1: 'confirmed' }
    sessions.view = 'list'
    work = { captures: [capture], proposals: [], count: 1 }
    let finish
    answers[`${API}.liquidar`] = () =>
      new Promise((resolve) => (finish = resolve))
    const done = newConversation()
    await flush()
    // no model turn, no wait: the log is clean while the call runs
    expect(assistant.messages).toEqual([])
    expect(assistant.cards).toEqual({})
    expect(sessions.view).toBe('chat')
    finish({
      ok: true,
      closed: 'CONV-9',
      archived: ['CONV-1', 'CONV-2'],
      cutoff: '2026-10-29 18:00:00.000001',
      open: { captures: 1, proposals: 2, encargos: 3, encargos_hoy: 1 },
    })
    await done
    const [[, args]] = calls(`${API}.liquidar`)
    expect(args).toEqual({ dias: SETTLE_DAYS })
    expect(calls(`${API}.new_conversation`)).toHaveLength(0)
    expect(calls(`${API}.history`)).toHaveLength(1)
    expect(calls(`${API}.encargos`)).toHaveLength(1)
    // the open work survives the new conversation
    expect(sessions.work.captures).toEqual([capture])
    expect(settledLine(sessions.settled)).toBe(
      'Settled. Archived 2 finished conversations. Still open: 2 changes waiting for your yes, 1 capture to finish, 3 tasks on the agenda (1 today).',
    )
  })

  it('says so when nothing stays open', () => {
    expect(
      settledLine({
        archived: [],
        open: { captures: 0, proposals: 0, encargos: 0, encargos_hoy: 0 },
      }),
    ).toBe('Settled. Nothing stays open.')
  })

  it('falls back to the plain reset on a server without «Liquidar»', async () => {
    answers[`${API}.liquidar`] = () => {
      throw new Error('Failed to get method')
    }
    assistant.messages = [{ id: 'm1', role: 'user', text: 'hola' }]
    await newConversation()
    expect(calls(`${API}.new_conversation`)).toHaveLength(1)
    expect(assistant.messages).toEqual([])
  })

  it('puts the chat back when the server refuses, and says why', async () => {
    const refuse = () => {
      throw new Error('Sin permiso')
    }
    answers[`${API}.liquidar`] = refuse
    answers[`${API}.new_conversation`] = refuse
    assistant.messages = [{ id: 'm1', role: 'user', text: 'hola' }]
    await newConversation()
    expect(assistant.messages).toHaveLength(1)
    expect(sessions.error).toBe('Sin permiso')
    expect(assistant.error).toBe('Sin permiso')
  })

  it('never shows the old turn: its reply, its typing and a late history', async () => {
    assistant.status = { enabled: true, chat_id: 'desk:a@x.com' }
    assistant.messages = [
      { id: 'shell-old', role: 'user', text: '¿ventas?', pending: false },
    ]
    assistant.thinking = true
    let late
    answers[`${API}.history`] = () => new Promise((resolve) => (late = resolve))
    const reading = loadHistory()
    answers[`${API}.history`] = () => []
    answers[`${API}.liquidar`] = () => ({
      ok: true,
      cutoff: 'C2',
      open: null,
    })
    await newConversation()
    // the history read from before the reset lands late and is dropped
    late([{ kind: 'texto', message: '¿ventas?', mid: 'u1', creation: 'x' }])
    await reading
    expect(assistant.messages).toEqual([])
    // the old turn still types and answers: neither reaches the new chat
    onTyping({ chat_id: 'desk:a@x.com' })
    expect(assistant.thinking).toBe(false)
    onMessage({
      chat_id: 'desk:a@x.com',
      client_id: 'shell-old',
      mid: 'b1',
      text: 'Vendiste $1,200.',
    })
    expect(assistant.messages).toEqual([])
    // our own reset's echo leaves the chat alone
    assistant.messages = [{ id: 'n1', role: 'user', text: 'nuevo' }]
    onReset({ chat_id: 'desk:a@x.com', cutoff: 'C2' })
    expect(assistant.messages).toHaveLength(1)
    // another tab's reset empties it
    onReset({ chat_id: 'desk:a@x.com', cutoff: 'C3' })
    expect(assistant.messages).toEqual([])
  })

  it('«Deshacer» brings the archived ones back and continues the closed one', async () => {
    sessions.settled = { closed: 'CONV-9', archived: ['CONV-1'], open: null }
    await undoSettle()
    expect(calls(`${API}.conversation_archive`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
      archived: 0,
    })
    expect(calls(`${API}.conversation_continue`)[0][1]).toEqual({
      conversation_id: 'CONV-9',
    })
    expect(sessions.settled).toBe(null)
  })
})

describe('earlier conversations', () => {
  it('groups them as the Desk bubble does: pinned, today, this week, before', () => {
    const now = new Date(2026, 9, 27, 12, 0)
    const groups = groupConversations(
      [
        { id: 'a', ended_at: '2026-10-27 08:00:00', pinned: false },
        { id: 'b', ended_at: '2026-10-25 08:00:00', pinned: false },
        { id: 'c', ended_at: '2026-09-01 08:00:00', pinned: true },
        { id: 'd', ended_at: '2026-09-01 08:00:00', pinned: false },
      ],
      now,
    )
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
      ['pinned', ['c']],
      ['today', ['a']],
      ['week', ['b']],
      ['before', ['d']],
    ])
  })

  it('opens one read-only, and the live one is the chat', async () => {
    answers[`${API}.conversation`] = () => ({
      conversation: { id: 'CONV-1', title: 'Compras AMOVIL' },
      messages: [{ kind: 'user', message: '¿Cuánto debo a AMOVIL?' }],
    })
    await openConversation('CONV-1')
    expect(calls(`${API}.conversation`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
    })
    expect(sessions.view).toBe('transcript')
    expect(sessions.transcript.conversation.title).toBe('Compras AMOVIL')
    expect(sessions.transcript.messages).toHaveLength(1)

    await openConversation(CURRENT)
    expect(sessions.view).toBe('chat')
    expect(calls(`${API}.conversation`)).toHaveLength(1)
  })

  it('continues one in a new conversation and goes back to the chat', async () => {
    sessions.view = 'transcript'
    assistant.messages = [{ id: 'm1', role: 'user', text: 'viejo' }]
    await continueConversation('CONV-1')
    expect(calls(`${API}.conversation_continue`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
    })
    expect(sessions.view).toBe('chat')
    expect(assistant.messages).toEqual([])
    expect(calls(`${API}.history`)).toHaveLength(1)
  })

  it('searches from two letters, and a late answer never replaces a newer one', async () => {
    await searchConversations('a')
    expect(calls(`${API}.conversation_search`)).toHaveLength(0)
    expect(sessions.results).toBeNull()

    let release
    answers[`${API}.conversation_search`] = ({ query }) =>
      query === 'amo'
        ? new Promise((resolve) => (release = resolve))
        : { query, results: [] }
    const slow = searchConversations('amo')
    await searchConversations('amovil')
    release({ query: 'amo', results: [{ stale: true }] })
    await slow
    expect(sessions.results).toEqual({ query: 'amovil', results: [] })
  })

  it('renames, pins and archives from the list, then reloads it', async () => {
    answers[`${API}.conversations`] = () => ({
      available: true,
      current: { title: 'Hoy', messages: 2 },
      conversations: [
        {
          id: 'CONV-1',
          title: 'Compras AMOVIL',
          ended_at: '2026-10-20 10:00:00',
          messages: 4,
          pinned: false,
          archived: false,
        },
      ],
      archived: 3,
    })
    const { el } = await mount(AssistantConversations)
    await showView('list')
    await flush()
    const row = el.querySelector('[data-conversation="CONV-1"]')
    expect(row.textContent).toContain('Compras AMOVIL')
    expect(
      el.querySelector('[data-testid="assistant-archived"]').textContent,
    ).toContain('Archived (3)')

    row.querySelector('[aria-label="Pin"]').click()
    await flush()
    expect(calls(`${API}.conversation_pin`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
      pinned: 1,
    })
    el.querySelector(
      '[data-conversation="CONV-1"] [aria-label="Archive"]',
    ).click()
    await flush()
    expect(calls(`${API}.conversation_archive`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
      archived: 1,
    })
    el.querySelector(
      '[data-conversation="CONV-1"] [aria-label="Rename"]',
    ).click()
    await flush()
    const input = el.querySelector('[aria-label="Conversation name"]')
    input.value = 'AMOVIL octubre'
    input.dispatchEvent(new Event('input'))
    input.closest('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(calls(`${API}.conversation_rename`)[0][1]).toEqual({
      conversation_id: 'CONV-1',
      title: 'AMOVIL octubre',
    })
    // each change reloads the list (once on open, then after each of the three)
    expect(calls(`${API}.conversations`)).toHaveLength(4)
  })
})

describe('«Abierto»', () => {
  it('lists chat captures with a way back into their review', async () => {
    work = { captures: [capture], proposals: [proposal], count: 2 }
    await showView('open')
    const { el } = await mount(AssistantOpenWork)
    const link = el.querySelector(`[data-captura="${capture.name}"]`)
    expect(link.getAttribute('href')).toBe(
      `/gastos/captura/${capture.name}?return_to=/crm/compras`,
    )
    expect(link.textContent).toContain('from the chat')
    expect(
      el.querySelector(`[data-accion="${proposal.name}"]`).textContent,
    ).toContain('Crear Seguimiento para AARON')
  })

  it('applies a proposal on the second tap and keeps its receipt on top', async () => {
    work = { captures: [], proposals: [proposal], count: 1 }
    await showView('open')
    answers[`${ACTIONS_API}.aplicar`] = () => {
      work = { captures: [], proposals: [], count: 0 }
      return { recibo: '✅ Seguimiento creado' }
    }
    await applyProposal(proposal.name)
    expect(calls(`${ACTIONS_API}.aplicar`)).toHaveLength(0)
    expect(sessions.proposals[proposal.name]).toBe('confirm')
    await applyProposal(proposal.name)
    expect(calls(`${ACTIONS_API}.aplicar`)[0][1]).toEqual({
      accion: proposal.name,
    })
    expect(sessions.receipts[proposal.name]).toEqual({
      summary: proposal.summary,
      text: '✅ Seguimiento creado',
    })
    expect(sessions.work.count).toBe(0)
    expect(sessions.proposals).toEqual({})
  })

  it('declines a proposal at once', async () => {
    work = { captures: [], proposals: [proposal], count: 1 }
    await showView('open')
    answers[`${ACTIONS_API}.rechazar`] = () => ({ recibo: 'Descartado.' })
    await rejectProposal(proposal.name)
    expect(calls(`${ACTIONS_API}.rechazar`)[0][1]).toEqual({
      accion: proposal.name,
    })
    expect(sessions.receipts[proposal.name].text).toBe('Descartado.')
  })
})

describe('the header', () => {
  it('counts the open work and switches between chat, conversations and «Abierto»', async () => {
    work = { captures: [capture], proposals: [proposal], count: 2 }
    assistant.open = true
    answers[`${API}.conversations`] = () => ({
      available: true,
      conversations: [],
      archived: 0,
    })
    const { el } = await mount(AssistantHeader)
    const open = el.querySelector('[data-testid="assistant-open-work"]')
    expect(open.getAttribute('aria-label')).toBe('Open work (2)')
    open.click()
    await flush()
    expect(sessions.view).toBe('open')
    el.querySelector('[data-testid="assistant-conversations"]').click()
    await flush()
    expect(sessions.view).toBe('list')
    expect(calls(`${API}.conversations`)).toHaveLength(1)
    el.querySelector('[data-testid="assistant-back"]').click()
    await flush()
    expect(sessions.view).toBe('chat')
    // a door that opens the sheet with a question brings the chat back
    sessions.view = 'open'
    assistant.focus += 1
    await flush()
    expect(sessions.view).toBe('chat')
  })
})
