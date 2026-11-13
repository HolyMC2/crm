// The decision card of «Pregúntale a Muelle» (asistente S41c): which card a
// message carries, what it shows, what each answer sends, and how a reload
// keeps doco's rebuilt card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))

import {
  cardOf,
  choiceFor,
  codeLine,
  createFields,
  draftFrom,
  leadOf,
  lineFigures,
  matchFacts,
  progressText,
  resultOf,
} from '@/components/assistant/decisionCards'
import {
  isProgress,
  mergeHistory,
  normalizeRow,
} from '@/components/assistant/assistantText'
import {
  _resetAssistant,
  answerCard,
  assistant,
  onMessage,
} from '@/components/assistant/useAssistant'
import DecisionCard from '@/components/assistant/DecisionCard.vue'
import AssistantLog from '@/components/assistant/AssistantLog.vue'

const API = 'doco.docoutils.assistant.shell_api'
const IMEI = '350000000000017'

function itemCard(over = {}) {
  return {
    v: 1,
    type: 'cap_item',
    sid: 'abcdef123456',
    di: 1,
    status: 'pending',
    progress: { n: 2, total: 3, done: 1 },
    subject: 'CELULAR PRUEBA Z9',
    prompt: '¿Cuál es «CELULAR PRUEBA Z9»?',
    capture: 'CAP-2026-00001',
    line: {
      text: 'CELULAR PRUEBA Z9 256GB 8 RAM VERDE',
      qty: 1,
      rate: 1967,
      amount: 1967,
      currency: 'MXN',
      part_number: null,
      serials: [IMEI],
      serials_more: 0,
    },
    proposal: {
      item_name: 'Celular Prueba Z9 256GB Verde',
      item_group: 'Celulares',
      stock_uom: 'Nos',
      has_serial: true,
      has_batch: false,
      item_code: 'IPN005430',
      plan: null,
      image: null,
    },
    research: null,
    matches: [
      {
        i: 0,
        code: 'IPN001',
        name: 'Celular Prueba Z9 128GB Verde',
        image: '/files/z9.png',
        uom: 'Nos',
        stock: 3,
        last_price: 1890,
        data: 'dec:abcdef123456:d1:o:0',
      },
    ],
    actions: {
      new: 'dec:abcdef123456:d1:n',
      skip: 'dec:abcdef123456:d1:k',
      search: true,
      sheet: { data: 'dec:abcdef123456:s:S', n: 2 },
    },
    ...over,
  }
}

function resolvedCard() {
  return {
    ...itemCard(),
    status: 'resolved',
    result: {
      action: 'create',
      summary: 'creé «Celular Prueba Z9 256GB Verde»',
      doctype: 'Item',
      name: 'IPN005430',
    },
    matches: undefined,
    actions: undefined,
    proposal: undefined,
  }
}

// every mounted card unmounts after its test: a pending preview timer must
// never call into the next test
const mounted = []
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
})

/** The choices of the last decision_apply call. */
function lastApplied() {
  const call = mocks.call.mock.calls.findLast(
    ([method]) => method === `${API}.decision_apply`,
  )
  return JSON.parse(call[1].choices)
}

function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/productos/:item',
        name: 'Producto',
        component: { render: () => null },
      },
      { path: '/:p(.*)*', component: { render: () => null } },
    ],
  })
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  mounted.push(app)
  return { el, app }
}

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeEach(() => {
  _resetAssistant()
  mocks.call.mockReset()
  mocks.call.mockResolvedValue({ ok: true, applied: 1, errors: [], rows: [] })
  document.body.innerHTML = ''
})

describe('which card a message carries', () => {
  it('draws the kinds it knows and leaves anything else as text', () => {
    expect(cardOf({ card: itemCard() })?.type).toBe('cap_item')
    expect(cardOf({ card: { ...itemCard(), type: 'cat_line' } })).toBeNull()
    expect(cardOf({ card: { ...itemCard(), sid: undefined } })).toBeNull()
    expect(cardOf({ card: null })).toBeNull()
    expect(cardOf({})).toBeNull()
  })

  it('says where the question sits, what the paper says and what a match is', () => {
    expect(progressText(itemCard())).toBe('Question 2 of 3 · 1 answered')
    expect(progressText(itemCard({ progress: { n: 1, total: 1 } }))).toBe('')
    expect(lineFigures(itemCard())).toBe('1 × $1,967.00')
    const two = itemCard()
    two.line = { ...two.line, qty: 2, amount: 3934 }
    expect(lineFigures(two)).toBe('2 × $1,967.00 = $3,934.00')
    expect(matchFacts(itemCard().matches[0])).toBe(
      '3 in stock · last paid $1,890.00',
    )
    expect(matchFacts({ stock: 0 })).toBe('None in stock')
    expect(matchFacts({})).toBe('')
  })

  it('names the code a new article takes, or the plan that names it', () => {
    expect(codeLine({ item_code: 'IPN005430' })).toBe(
      'IPN005430 (next free code)',
    )
    expect(codeLine({ plan: 'variante NUEVA de «Z9»', item_code: null })).toBe(
      'variante NUEVA de «Z9»',
    )
    expect(codeLine({})).toBe('Given by the item naming series')
  })

  it('keeps what heads the first card, and nothing for the others', () => {
    expect(
      leadOf({
        text: '🧾 Factura de Compra de «Proveedora» · $49,222.67\n3 preguntas antes de armar el borrador.\n\n❓ **2/3** · ¿Cuál es «Z9»?',
      }),
    ).toBe(
      '🧾 Factura de Compra de «Proveedora» · $49,222.67\n3 preguntas antes de armar el borrador.',
    )
    expect(leadOf({ text: '❓ ¿Cuál es «Z9»?\n   📄 1 × $1,967.00' })).toBe('')
  })

  it('reads an answered card as what was done, with the article to open', () => {
    const done = resultOf(resolvedCard())
    expect(done.text).toBe('Creé «Celular Prueba Z9 256GB Verde»')
    expect(done.to).toEqual({ name: 'Producto', params: { item: 'IPN005430' } })
    const skipped = resultOf({
      ...resolvedCard(),
      status: 'skipped',
      result: { action: 'skip', summary: 'omití «Z9»' },
    })
    expect(skipped.skipped).toBe(true)
    expect(skipped.to).toBeNull()
  })
})

describe('what an answer sends', () => {
  it('links by option, by a searched code, creates with the edits, skips', () => {
    const card = itemCard()
    expect(choiceFor(card, 'link', card.matches[0])).toEqual({
      di: 1,
      op: 'o',
      i: 0,
    })
    expect(choiceFor(card, 'code', 'IPN777')).toEqual({
      di: 1,
      op: 'w',
      text: 'IPN777',
    })
    expect(choiceFor(card, 'skip')).toEqual({ di: 1, op: 'k' })
    const draft = {
      ...draftFrom(card),
      item_name: '  Celular   Z9  Verde ',
      image: '',
    }
    expect(choiceFor(card, 'create', draft)).toEqual({
      di: 1,
      op: 'n',
      fields: {
        item_name: 'Celular Z9 Verde',
        item_group: 'Celulares',
        stock_uom: 'Nos',
        has_serial: true,
      },
    })
    expect(
      createFields({ ...draft, image: '/private/files/z9.jpg' }).image,
    ).toBe('/private/files/z9.jpg')
  })

  it('applies inline, closes the card at once, and shows a refusal on it', async () => {
    const card = itemCard()
    assistant.messages = [{ id: 'm1', mid: 'm1', role: 'bot', card }]
    mocks.call.mockResolvedValueOnce({
      ok: true,
      applied: 1,
      errors: [],
      rows: [
        {
          n: 2,
          summary: 'vinculé «CELULAR PRUEBA Z9»',
          action: 'link',
          doctype: 'Item',
          name: 'IPN001',
        },
      ],
    })
    expect(await answerCard(card, { di: 1, op: 'o', i: 0 })).toBe(true)
    expect(mocks.call).toHaveBeenCalledWith(`${API}.decision_apply`, {
      session_id: 'abcdef123456',
      choices: JSON.stringify([{ di: 1, op: 'o', i: 0 }]),
    })
    expect(assistant.messages[0].card.status).toBe('resolved')
    expect(assistant.messages[0].card.result.summary).toBe(
      'vinculé «CELULAR PRUEBA Z9»',
    )
    // the closed card already opens the article it linked
    expect(resultOf(assistant.messages[0].card).to).toEqual({
      name: 'Producto',
      params: { item: 'IPN001' },
    })

    const open = itemCard({ di: 2 })
    mocks.call.mockResolvedValueOnce({
      ok: true,
      applied: 0,
      errors: [
        { n: 3, summary: '«X» agrupa otros grupos; elige uno de adentro.' },
      ],
    })
    expect(await answerCard(open, { di: 2, op: 'n', fields: {} })).toBe(false)
    expect(assistant.decisions['abcdef123456:2']).toEqual({
      state: 'failed',
      error: '«X» agrupa otros grupos; elige uno de adentro.',
    })
    mocks.call.mockResolvedValueOnce({ ok: false, reason: 'expired' })
    await answerCard(open, { di: 2, op: 'k' })
    expect(assistant.decisions['abcdef123456:2'].error).toMatch(/closed/)
  })
})

describe('a reload', () => {
  it('keeps the card doco rebuilt, and none once it expired', () => {
    const row = normalizeRow({
      kind: 'bot',
      mid: 'm1',
      message: '¿Cuál?',
      card: itemCard(),
    })
    expect(row.card.type).toBe('cap_item')
    expect(
      normalizeRow({ kind: 'texto', message: 'hola', card: itemCard() }).card,
    ).toBeNull()
    expect(isProgress({ text: 'Buscando…', card: itemCard() })).toBe(false)
    const live = [{ ...row, card: itemCard() }]
    const answered = normalizeRow({
      kind: 'bot',
      mid: 'm1',
      message: '🆕 creé',
      card: resolvedCard(),
    })
    expect(mergeHistory([answered], live)[0].card.status).toBe('resolved')
    const expired = normalizeRow({
      kind: 'bot',
      mid: 'm1',
      message: '¿Cuál?',
      card: null,
    })
    expect(mergeHistory([expired], live)[0].card).toBeNull()
  })

  it('a live edit turns the card into its result', () => {
    assistant.status = { enabled: true, chat_id: 'desk:ana@tienda.mx' }
    onMessage({
      mid: 'm1',
      chat_id: 'desk:ana@tienda.mx',
      text: '¿Cuál?',
      buttons: [],
      card: itemCard(),
    })
    onMessage({
      mid: 'm1',
      chat_id: 'desk:ana@tienda.mx',
      text: '🆕 creé «Z9» — IPN005430\n(2/3)',
      buttons: [],
      card: resolvedCard(),
      edit: true,
    })
    expect(assistant.messages).toHaveLength(1)
    expect(assistant.messages[0].card.status).toBe('resolved')
  })
})

describe('the card on screen', () => {
  it('shows the line as printed, its IMEIs, the matches and the new article', async () => {
    const { el } = mount(DecisionCard, { card: itemCard() })
    await tick()
    expect(
      el.querySelector('[data-testid="decision-line"]').textContent,
    ).toContain('CELULAR PRUEBA Z9 256GB 8 RAM VERDE')
    expect(el.textContent).toContain('Question 2 of 3 · 1 answered')
    expect(el.textContent).toContain('1 × $1,967.00')
    expect(
      el.querySelector('[data-testid="decision-serials"]').textContent,
    ).toContain(IMEI)
    const match = el.querySelector('[data-testid="decision-match"]')
    expect(match.textContent).toContain('Celular Prueba Z9 128GB Verde')
    expect(match.textContent).toContain('3 in stock · last paid $1,890.00')
    expect(match.querySelector('img').getAttribute('src')).toBe('/files/z9.png')
    expect(el.querySelector('[data-testid="decision-name"]').value).toBe(
      'Celular Prueba Z9 256GB Verde',
    )
    expect(
      el.querySelector('[data-testid="decision-code"]').textContent,
    ).toContain('IPN005430 (next free code)')
    expect(
      el
        .querySelector('[data-testid="decision-serial"]')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      el.querySelector('[data-testid="decision-sheet"]').textContent,
    ).toContain('Decide all at once (2)')
  })

  it('«Vincular» links the match and «Crear artículo» sends the edited article', async () => {
    const { el } = mount(DecisionCard, { card: itemCard() })
    await tick()
    el.querySelector('[data-testid="decision-link"]').click()
    await tick()
    expect(mocks.call).toHaveBeenLastCalledWith(`${API}.decision_apply`, {
      session_id: 'abcdef123456',
      choices: JSON.stringify([{ di: 1, op: 'o', i: 0 }]),
    })
    const name = el.querySelector('[data-testid="decision-name"]')
    name.value = 'Celular Z9 Verde Editado'
    name.dispatchEvent(new Event('input'))
    el.querySelector('[data-testid="decision-serial"]').click()
    await tick()
    el.querySelector('[data-testid="decision-create"]').click()
    await tick()
    const sent = mocks.call.mock.calls.find(
      ([method, args]) =>
        method === `${API}.decision_apply` && args.choices.includes('"op":"n"'),
    )
    expect(JSON.parse(sent[1].choices)).toEqual([
      {
        di: 1,
        op: 'n',
        fields: {
          item_name: 'Celular Z9 Verde Editado',
          has_serial: false,
          item_group: 'Celulares',
          stock_uom: 'Nos',
        },
      },
    ])
    // the edited name asks doco what «Crear» would do with it (after a pause)
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(
      mocks.call.mock.calls.some(
        ([method]) => method === `${API}.decision_preview`,
      ),
    ).toBe(true)
  })

  it('shows a refusal on the card and waits for a name before «Crear»', async () => {
    const card = itemCard()
    assistant.decisions = {
      'abcdef123456:1': {
        state: 'failed',
        error: 'No encontré la unidad «X».',
      },
    }
    const { el } = mount(DecisionCard, { card })
    await tick()
    expect(
      el.querySelector('[data-testid="decision-error"]').textContent,
    ).toContain('No encontré la unidad')
    const name = el.querySelector('[data-testid="decision-name"]')
    name.value = '   '
    name.dispatchEvent(new Event('input'))
    await tick()
    expect(el.querySelector('[data-testid="decision-create"]').disabled).toBe(
      true,
    )
    expect(el.textContent).toContain(
      'Write the name of the new article to create it.',
    )
  })

  it('a shop whose inventory keeps serials off sees why the toggle is off', async () => {
    const card = itemCard()
    card.proposal = {
      ...card.proposal,
      has_serial: false,
      serials_allowed: false,
    }
    const { el } = mount(DecisionCard, { card })
    await tick()
    expect(el.querySelector('[data-testid="decision-serial"]').disabled).toBe(
      true,
    )
    expect(
      el.querySelector('[data-testid="decision-serial-off"]').textContent,
    ).toContain('Activar serie / lote')
  })

  it('an answered card is one line with the article to open', async () => {
    const { el } = mount(DecisionCard, { card: resolvedCard() })
    await tick()
    expect(
      el.querySelector('[data-testid="decision-result"]').textContent,
    ).toContain('Creé «Celular Prueba Z9 256GB Verde»')
    expect(
      el.querySelector('[data-testid="decision-open"]').getAttribute('href'),
    ).toBe('/productos/IPN005430')
    expect(el.querySelector('[data-testid="decision-link"]')).toBeNull()
  })

  it('a warehouse question offers its choices and takes a typed name', async () => {
    const card = {
      ...itemCard(),
      type: 'cap_warehouse',
      prompt: '¿A qué almacén entra esta compra?',
      line: undefined,
      matches: undefined,
      proposal: undefined,
      options: [{ i: 0, code: 'Tienda - T', label: 'Tienda' }],
      actions: { write: true },
    }
    const { el } = mount(DecisionCard, { card })
    await tick()
    expect(el.textContent).toContain('¿A qué almacén entra esta compra?')
    el.querySelector('[data-testid="decision-option"]').click()
    await tick()
    expect(lastApplied()).toEqual([{ di: 1, op: 'o', i: 0 }])
    const typed = el.querySelector('[data-testid="decision-write"]')
    typed.value = 'Bodega'
    typed.dispatchEvent(new Event('input'))
    await tick()
    typed.closest('form').dispatchEvent(new Event('submit'))
    await tick()
    expect(lastApplied()).toEqual([{ di: 1, op: 'w', text: 'Bodega' }])
  })

  it('the log draws the card in place of the pills, under what heads it', async () => {
    assistant.loaded = true
    assistant.messages = [
      {
        id: 'm1',
        mid: 'm1',
        role: 'bot',
        text: '🧾 Factura de Compra de «Proveedora»\n3 preguntas antes de armar el borrador.\n\n❓ **2/3** · ¿Cuál es «Z9»?',
        buttons: [
          [{ text: '➕ Crear nuevo', callback_data: 'dec:abcdef123456:d1:n' }],
        ],
        card: itemCard(),
      },
    ]
    const { el } = mount(AssistantLog, {})
    await tick()
    expect(el.querySelector('[data-testid="decision-card"]')).not.toBeNull()
    expect(el.textContent).toContain('Factura de Compra de «Proveedora»')
    expect(el.textContent).not.toContain('Crear nuevo')
    expect(el.textContent).not.toContain('¿Cuál es «Z9»?')
  })
})
