import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import TarjetasCliente from '@/components/fidelidad/TarjetasCliente.vue'

/**
 * «Tarjetas de cliente» in Fidelidad: what a manager sees of the register's
 * customer cards, a new print batch, and the sheet and file of a batch. The
 * server decides who may make a batch and which cards print (blank only);
 * this pins what the page shows and calls.
 */

const API = 'doco.fidelidad.api'
const PRINTING = 'posawesome.posawesome.api.customer_cards.printing'
const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
  vi.restoreAllMocks()
})
const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}
// What a reader hears: every text node, separated as the layout separates them.
const text = (node) => {
  if (!node) return undefined
  const parts = []
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) parts.push(walker.currentNode.textContent)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const cards = (over = {}) => ({
  company: 'Doco',
  can_create: true,
  denied: null,
  counts: { active: 12, blank: 38, digital: 3 },
  batches: [
    {
      name: 'TC-2026-0002',
      made: 50,
      blank: 38,
      given: 12,
      note: 'Mostrador',
      created: '2026-11-07 09:30:00',
    },
    {
      name: 'TC-2026-0001',
      made: 10,
      blank: 0,
      given: 10,
      note: '',
      created: '2026-10-01 12:00:00',
    },
  ],
  ...over,
})

async function mount(props = { company: 'Doco' }) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(TarjetasCliente, props)
  app.config.globalProperties.__ = (s, args) =>
    String(s).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
  globalThis.__ = app.config.globalProperties.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}

describe('customer cards in Fidelidad', () => {
  it('counts the cards and lists the batches, by their note or their size', async () => {
    call.mockResolvedValue(cards())
    const el = await mount()
    expect(call).toHaveBeenCalledWith(`${API}.get_cards`, { company: 'Doco' })
    expect(
      [...el.querySelectorAll('[data-testid="tarjetas-cifras"] > div')].map(
        text,
      ),
    ).toEqual(['Given 12', 'Digital 3', 'Blank 38'])
    const rows = [...el.querySelectorAll('[data-tarjetas-lote]')]
    expect(rows.map((r) => text(r.querySelector('.min-w-0 > span')))).toEqual([
      'Mostrador',
      '10 cards',
    ])
    expect(text(rows[0])).toContain('38 blank of 50')
    expect(text(rows[0])).not.toContain('TC-2026')
    // A batch with no blank card left has nothing to print.
    expect(
      el.querySelector('[data-testid="tarjetas-imprimir-TC-2026-0001"]')
        .disabled,
    ).toBe(true)
  })

  it('makes a batch with one request id per press and reads the cards again', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('create_card_batch')
        ? { name: 'TC-2026-0003', made: 20, blank: 20, given: 0 }
        : cards(),
    )
    const el = await mount()
    el.querySelector('[data-testid="tarjetas-nuevo"]').click()
    await flush()
    const quantity = el.querySelector('[data-testid="tarjetas-cantidad"]')
    quantity.value = '20'
    quantity.dispatchEvent(new Event('input'))
    await flush()
    el.querySelector('[data-testid="tarjetas-nuevo-lote"]').dispatchEvent(
      new Event('submit'),
    )
    await flush()
    const made = call.mock.calls.find(([m]) => m.endsWith('create_card_batch'))
    expect(made[0]).toBe(`${API}.create_card_batch`)
    expect(JSON.parse(made[1].data)).toEqual({
      company: 'Doco',
      quantity: 20,
      note: '',
    })
    expect(made[1].request_id).toBeTruthy()
    expect(text(el)).toContain('20 blank cards are ready to print.')
    expect(
      call.mock.calls.filter(([m]) => m.endsWith('get_cards')),
    ).toHaveLength(2)
  })

  it('refuses a batch above a thousand cards before asking the server', async () => {
    call.mockResolvedValue(cards())
    const el = await mount()
    el.querySelector('[data-testid="tarjetas-nuevo"]').click()
    await flush()
    const quantity = el.querySelector('[data-testid="tarjetas-cantidad"]')
    quantity.value = '5000'
    quantity.dispatchEvent(new Event('input'))
    await flush()
    expect(
      el.querySelector('[data-testid="tarjetas-hacer-lote"]').disabled,
    ).toBe(true)
    expect(text(el)).toContain('A batch holds between 1 and 1000 cards.')
  })

  it('says who makes batches to a reader who may not', async () => {
    call.mockResolvedValue(
      cards({
        can_create: false,
        denied: 'A sales manager or accounts manager can make a print batch.',
        batches: [],
      }),
    )
    const el = await mount()
    expect(el.querySelector('[data-testid="tarjetas-nuevo"]')).toBeNull()
    expect(text(el)).toContain(
      'A sales manager or accounts manager can make a print batch.',
    )
    expect(text(el)).toContain('No print batch yet.')
  })

  it('prints a batch in a window opened on the tap', async () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() }
    const popup = {
      document: doc,
      focus: vi.fn(),
      close: vi.fn(),
      print: vi.fn(),
      setTimeout: (fn) => fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(popup)
    call.mockImplementation(async (method) =>
      method.endsWith('batch_sheet') ? '<html>cards</html>' : cards(),
    )
    const el = await mount()
    el.querySelector('[data-testid="tarjetas-imprimir-TC-2026-0002"]').click()
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    await flush()
    expect(call).toHaveBeenCalledWith(`${PRINTING}.batch_sheet`, {
      batch: 'TC-2026-0002',
    })
    expect(doc.write).toHaveBeenCalledWith('<html>cards</html>')
    expect(popup.opener).toBeNull()
    expect(popup.print).toHaveBeenCalled()
  })

  it('says to allow pop-ups when the browser blocks the sheet', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    call.mockResolvedValue(cards())
    const el = await mount()
    el.querySelector('[data-testid="tarjetas-imprimir-TC-2026-0002"]').click()
    await flush()
    expect(text(el)).toContain('Allow pop-ups to print the cards.')
    expect(call).not.toHaveBeenCalledWith(
      `${PRINTING}.batch_sheet`,
      expect.anything(),
    )
  })

  it('hides itself where the register has no customer cards', async () => {
    call.mockResolvedValue(null)
    const el = await mount()
    expect(el.querySelector('[data-testid="tarjetas-cifras"]')).toBeNull()
  })
})
