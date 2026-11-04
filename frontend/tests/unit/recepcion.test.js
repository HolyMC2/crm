// Recepción in the shell: the receipt counted against its order without
// leaving Muelle. The rules (what is missing, the tally, what a scan answer
// means) and the page as the worker sees it: the tally, a scan, a tap on the
// stepper, an item on two order rows, and confirming back to the order.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  filterLines,
  lineState,
  orderedLines,
  scanOutcome,
  tally,
} from '@/composables/useRecepcion'
import { receiptRoute } from '@/composables/useCompras'
import CompraRecepcion from '@/pages/CompraRecepcion.vue'

const line = (row, extra = {}) => ({
  row,
  item_code: `IT-${row}`,
  item_name: `Artículo ${row}`,
  qty: 0,
  uom: 'Nos',
  rate: 10,
  amount: 0,
  ordered_qty: 2,
  purchase_order: 'PO-7',
  ...extra,
})

describe('Recepción rules', () => {
  it('reads each line against what the order still owes', () => {
    expect(lineState(line('a', { qty: 1 })).key).toBe('missing')
    expect(lineState(line('a', { qty: 2 })).key).toBe('complete')
    expect(lineState(line('a', { qty: 3 })).key).toBe('over')
    // A second delivery: what earlier receipts brought is not owed again.
    expect(lineState(line('a', { qty: 1, already_received: 1 })).key).toBe(
      'complete',
    )
    expect(lineState(line('a', { ordered_qty: undefined })).key).toBe('extra')
  })

  it('tallies pieces counted against pieces owed', () => {
    const lines = [
      line('a', { qty: 2 }),
      line('b', { qty: 1, ordered_qty: 3 }),
      line('c', { qty: 1, ordered_qty: undefined }),
    ]
    expect(tally(lines)).toMatchObject({
      counted: 4,
      toward: 3,
      expected: 5,
      missing: 2,
      over: 0,
      complete: false,
    })
    expect(tally([line('a', { qty: 2 })]).complete).toBe(true)
  })

  it('puts what is left to count first, and the field filters by name or code', () => {
    const rows = orderedLines([
      line('a', { qty: 2 }),
      line('b', { qty: 0, item_name: 'Pantalla Xiaomi 14T' }),
    ])
    expect(rows.map((r) => r.line.row)).toEqual(['b', 'a'])
    expect(filterLines(rows, 'xiaomi pantalla').map((r) => r.line.row)).toEqual(
      ['b'],
    )
    expect(filterLines(rows, 'IT-a').map((r) => r.line.row)).toEqual(['a'])
  })

  it('says what a scan answer means', () => {
    expect(scanOutcome({ unknown_code: '123' }, '123').kind).toBe('unknown')
    expect(scanOutcome({ ambiguous: 'X', rows: ['a', 'b'] }, 'X')).toEqual({
      kind: 'ambiguous',
      rows: ['a', 'b'],
      code: 'X',
    })
    expect(scanOutcome({ lines: [], not_ordered: 'Funda' }).kind).toBe(
      'refused',
    )
    expect(scanOutcome({ lines: [], unit_mismatch: 'X' }).escaner).toBe(true)
    expect(scanOutcome({ lines: [], touched_row: 'a' })).toMatchObject({
      kind: 'applied',
      row: 'a',
    })
  })

  it('opens the receipt as a shell route that knows its order and queue', () => {
    expect(receiptRoute('PR-1', 'PO-7', '/compras?foco=PO-7')).toEqual({
      name: 'CompraRecepcion',
      params: { name: 'PR-1' },
      query: { orden: 'PO-7', list: '/compras?foco=PO-7' },
    })
    expect(receiptRoute('PR-1', 'PO-7', '//evil').query).toEqual({
      orden: 'PO-7',
    })
  })
})

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

let receipt, calls, answers, app, root, router
const payload = () => JSON.parse(JSON.stringify(receipt))
beforeEach(() => {
  receipt = {
    kind: 'PR',
    doctype: 'Purchase Receipt',
    name: 'PR-1',
    party: 'SUP-1',
    party_label: 'Tecnomaxx',
    docstatus: 0,
    currency: 'MXN',
    total_qty: 0,
    grand_total: 255,
    pdf_url: '/printview?x',
    line_count: 2,
    lines: [
      line('a', { item_name: 'Pantalla Xiaomi 14T', qty: 0 }),
      line('b', { item_name: 'Funda rosa', qty: 1, ordered_qty: 1 }),
    ],
  }
  calls = []
  answers = {
    doc_detail: () => payload(),
    set_line_qty: (args) => {
      const target = receipt.lines.find((l) => l.row === args.row)
      target.qty = args.qty
      return payload()
    },
    scan_add_line: (args) => {
      if (args.code === 'DUP' && !args.row)
        return { ...payload(), ambiguous: 'DUP', rows: ['a', 'b'] }
      if (args.code === '750' || args.code === 'DUP') {
        const target = receipt.lines.find((l) => l.row === (args.row || 'a'))
        target.qty += 1
        return { ...payload(), touched_row: target.row }
      }
      return { unknown_code: args.code }
    },
    submit_doc: () => ({ ...payload(), docstatus: 1 }),
  }
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      const args = init?.body ? JSON.parse(init.body) : {}
      calls.push([method, args])
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: answers[method]?.(args) ?? null }),
      }
    }),
  )
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function mountAt(path) {
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/compras/recepcion/:name',
        name: 'CompraRecepcion',
        component: CompraRecepcion,
        props: true,
      },
      {
        path: '/compras/orden/:name',
        name: 'CompraOrden',
        component: { render: () => null },
      },
      { path: '/compras', name: 'Compras', component: { render: () => null } },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
}

const text = (selector) =>
  document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim()
const lineNames = () =>
  [...document.querySelectorAll('[data-recepcion-linea]')].map((li) =>
    li.querySelector('p').textContent.trim(),
  )
const field = () => document.querySelector('[data-recepcion-campo]')
async function typeAndEnter(value) {
  field().value = value
  field().dispatchEvent(new Event('input'))
  await nextTick()
  field().form.dispatchEvent(new Event('submit', { cancelable: true }))
  await flush()
}

describe('Recepción page', () => {
  it('names the supplier and counts against the order, what is missing first', async () => {
    await mountAt('/compras/recepcion/PR-1?orden=PO-7')
    expect(text('[data-appbar-title]')).toBe('Tecnomaxx')
    expect(text('[data-recepcion-tally]')).toContain('1 of 3')
    expect(text('[data-recepcion-tally]')).toContain('2 still to count')
    expect(lineNames()).toEqual(['Pantalla Xiaomi 14T', 'Funda rosa'])
    expect(document.activeElement).toBe(field())
  })

  it('a scan counts one on the line it names and says so', async () => {
    await mountAt('/compras/recepcion/PR-1?orden=PO-7')
    await typeAndEnter('750')
    const scan = calls.find(([m]) => m === 'scan_add_line')[1]
    expect(scan).toMatchObject({
      kind: 'PR',
      name: 'PR-1',
      code: '750',
      qty: 1,
    })
    expect(scan.uuid).toBeTruthy()
    expect(text('[data-recepcion-aviso]')).toBe('Pantalla Xiaomi 14T: 1 of 2')
    expect(field().value).toBe('')
  })

  it('a typed name that is no code counts on the one line it names', async () => {
    await mountAt('/compras/recepcion/PR-1?orden=PO-7')
    await typeAndEnter('xiaomi')
    expect(calls.find(([m]) => m === 'set_line_qty')[1]).toMatchObject({
      row: 'a',
      qty: 1,
    })
  })

  it('the stepper answers at once and sends the exact quantity', async () => {
    await mountAt('/compras/recepcion/PR-1?orden=PO-7')
    const plus = document.querySelector(
      '[data-row="a"] button[aria-label="One more"]',
    )
    plus.click()
    plus.click()
    await nextTick()
    expect(text('[data-recepcion-tally]')).toContain('3 of 3')
    await flush()
    expect(
      calls.filter(([m]) => m === 'set_line_qty').map(([, a]) => a.qty),
    ).toEqual([1, 2])
    expect(text('[data-recepcion-tally]')).toContain(
      'Everything on the order arrived',
    )
  })

  it('an item on two order rows asks which one, then counts it there', async () => {
    await mountAt('/compras/recepcion/PR-1?orden=PO-7')
    await typeAndEnter('DUP')
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Which line is it for?'),
    )
    const first = calls.find(([m]) => m === 'scan_add_line')[1]
    const pick = [...document.querySelectorAll('[data-ui-sheet] button')].find(
      (b) => b.textContent.includes('Funda rosa'),
    )
    pick.click()
    await flush()
    const again = calls.filter(([m]) => m === 'scan_add_line')[1][1]
    expect(again).toMatchObject({ code: 'DUP', row: 'b', uuid: first.uuid })
  })

  it('confirming adds the stock and goes back to the order with the notice', async () => {
    await mountAt(
      '/compras/recepcion/PR-1?orden=PO-7&list=%2Fcompras%3Ffoco%3DPO-7',
    )
    document.querySelector('[data-recepcion-confirmar]').click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-recepcion-confirmar-final]'),
      ).not.toBeNull(),
    )
    expect(document.body.textContent).toContain(
      '2 pieces are still missing; they stay pending on the order for another delivery.',
    )
    document.querySelector('[data-recepcion-confirmar-final]').click()
    await flush()
    expect(calls.find(([m]) => m === 'submit_doc')[1]).toMatchObject({
      kind: 'PR',
      name: 'PR-1',
    })
    expect(router.currentRoute.value.name).toBe('CompraOrden')
    expect(router.currentRoute.value.params.name).toBe('PO-7')
    expect(router.currentRoute.value.query).toEqual({
      done: 'Purchase Receipt:PR-1',
      list: '/compras?foco=PO-7',
    })
  })

  it('a confirmed receipt reads only', async () => {
    receipt.docstatus = 1
    await mountAt('/compras/recepcion/PR-1')
    expect(field()).toBeNull()
    expect(document.querySelector('button[aria-label="One more"]')).toBeNull()
    expect(text('[data-recepcion-estado]')).toBe('Confirmed')
  })
})
