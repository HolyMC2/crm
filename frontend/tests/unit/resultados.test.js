import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', () => ({
  Button: {
    props: ['label'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', { onClick: () => emit('click') }, props.label),
  },
  call: vi.fn(),
}))

import {
  accessRequest,
  axisLabel,
  boardHref,
  cardSpan,
  cardState,
  cardTitle,
  clockText,
  deltaChip,
  documentFromMemory,
  drillHref,
  fetchDocument,
  formatValue,
  lensFromMemory,
  lensMatch,
  lensToMemory,
  paymentSplit,
  productHref,
  rowFromMemory,
  saleLine,
  saleState,
  readLensQuery,
  readQuery,
  routerPath,
  rowRoute,
  toQuery,
  walkInName,
} from '../../src/composables/useResultados.js'
import { accesos } from '../../src/composables/useHoy.js'
import { hostedModules } from '../../src/composables/muelleShell.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import ResultadosCard from '../../src/components/resultados/ResultadosCard.vue'
import ResultadosChart from '../../src/components/resultados/ResultadosChart.vue'

describe('period and comparison live in the URL', () => {
  it('reads known values and falls back to Mes vs anterior', () => {
    expect(readQuery({})).toEqual({
      periodo: 'mes',
      compara: 'anterior',
      empresa: '',
      tienda: '',
    })
    expect(
      readQuery({
        periodo: 'hoy',
        compara: 'anio',
        empresa: 'Doco',
        tienda: 'T1',
      }),
    ).toEqual({
      periodo: 'hoy',
      compara: 'anio',
      empresa: 'Doco',
      tienda: 'T1',
    })
    expect(readQuery({ periodo: 'year', compara: '<b>' })).toMatchObject({
      periodo: 'mes',
      compara: 'anterior',
    })
    expect(readQuery({ periodo: ['semana', 'hoy'] }).periodo).toBe('semana')
    expect(readQuery({ tienda: 'x'.repeat(500) }).tienda).toHaveLength(140)
  })

  it('writes only what differs from the defaults, and round-trips', () => {
    expect(toQuery(readQuery({}))).toEqual({})
    const state = {
      periodo: 'semana',
      compara: 'no',
      empresa: 'Doco',
      tienda: 'T1',
    }
    expect(readQuery(toQuery(state))).toEqual(state)
  })

  it('Ayer, Mes anterior and a date range; a broken range is Mes', () => {
    expect(readQuery({ periodo: 'ayer' }).periodo).toBe('ayer')
    expect(readQuery({ periodo: 'mes_anterior' }).periodo).toBe('mes_anterior')
    const range = readQuery({
      periodo: 'rango',
      desde: '2026-10-09',
      hasta: '2026-09-20',
    })
    expect(range).toMatchObject({
      periodo: 'rango',
      desde: '2026-09-20',
      hasta: '2026-10-09',
    })
    expect(toQuery(range)).toEqual({
      periodo: 'rango',
      desde: '2026-09-20',
      hasta: '2026-10-09',
    })
    expect(readQuery(toQuery(range))).toEqual(range)
    for (const [desde, hasta] of [
      ['2026-10-09', undefined],
      ['2026-02-30', '2026-03-01'],
      ['ayer', '2026-03-01'],
    ]) {
      const state = readQuery({ periodo: 'rango', desde, hasta })
      expect(state.periodo).toBe('mes')
      expect(state).not.toHaveProperty('desde')
    }
    expect(
      readLensQuery({
        tipo: 'ventas',
        periodo: 'rango',
        desde: '2026-09-01',
        hasta: '2026-09-30',
      }),
    ).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' })
  })

  it('the lens keeps the board query and picks a known list', () => {
    expect(readLensQuery({ tipo: 'cierres', periodo: 'hoy' })).toMatchObject({
      tipo: 'cierres',
      periodo: 'hoy',
    })
    expect(readLensQuery({ tipo: 'nope' }).tipo).toBe('ventas')
    expect(
      boardHref({
        periodo: 'hoy',
        compara: 'anterior',
        empresa: '',
        tienda: 'T1',
      }),
    ).toBe('/crm/resultados?periodo=hoy&tienda=T1')
    expect(boardHref(readQuery({}))).toBe('/crm/resultados')
  })
})

describe('drills carry the way back', () => {
  const back = '/crm/resultados?periodo=hoy&compara=anio'

  it('a lens drill keeps the query and adds return_to and return_label', () => {
    const href = drillHref(
      {
        path: '/crm/resultados/documentos',
        query: { tipo: 'ventas', periodo: 'hoy' },
      },
      back,
    )
    const url = new URL(href, 'https://x.invalid')
    expect(url.pathname).toBe('/crm/resultados/documentos')
    expect(url.searchParams.get('tipo')).toBe('ventas')
    expect(url.searchParams.get('return_to')).toBe(back)
    expect(url.searchParams.get('return_label')).toBe('Resultados')
    expect(routerPath(href)).toBe(href.slice(4))
  })

  it('a Taller drill opens the orders queue by plain link with the same return', () => {
    const href = drillHref(
      { path: '/taller/orders', query: { group: 'ready' } },
      back,
    )
    const url = new URL(href, 'https://x.invalid')
    expect(url.pathname).toBe('/taller/orders')
    expect(url.searchParams.get('group')).toBe('ready')
    expect(url.searchParams.get('return_to')).toBe(back)
    expect(routerPath(href)).toBeNull()
  })

  it('refuses a drill outside the Muelle apps', () => {
    expect(drillHref({ href: 'https://evil.invalid/x' }, back)).toBeNull()
    expect(drillHref({ path: '//evil.invalid/crm/x' }, back)).toBeNull()
    expect(drillHref(null, back)).toBeNull()
  })

  it('a lens row opens its Ventas deal, its customer or the ticket, and comes back to the lens', () => {
    const lens = '/crm/resultados/documentos?tipo=ventas&periodo=hoy'
    const deal = new URL(
      rowRoute(
        { doctype: 'Sales Invoice', name: 'SINV-1', deal: 'CRM-DEAL-1' },
        lens,
      ),
      'https://x.invalid',
    )
    expect(deal.pathname).toBe('/crm/ventas/deal/CRM-DEAL-1')
    expect(deal.searchParams.get('return_to')).toBe(lens)
    const ticket = new URL(
      rowRoute({ doctype: 'Sales Invoice', name: 'SINV 1' }, lens),
      'https://x.invalid',
    )
    expect(ticket.pathname).toBe(
      '/crm/resultados/documento/Sales%20Invoice/SINV%201',
    )
    // The shell's back arrow returns to the lens, not to the board.
    expect(ticket.searchParams.get('list')).toBe(
      '/resultados/documentos?tipo=ventas&periodo=hoy',
    )
    const customer = new URL(
      rowRoute({ doctype: 'Customer', name: 'Ana' }, lens),
      'https://x.invalid',
    )
    expect(customer.pathname).toBe('/crm/contactos/customer/Ana')
  })
})

describe('card states and numbers', () => {
  it('loading, blocked, error, empty and ready', () => {
    expect(cardState(null, { loading: true })).toBe('loading')
    expect(cardState(null)).toBe('empty')
    expect(
      cardState({ key: 'margen', blocked_reason: 'Solo contabilidad' }),
    ).toBe('blocked')
    expect(
      cardState({ key: 'ventas', blocked_reason: 'No cargó', retry: true }),
    ).toBe('error')
    expect(cardState({ key: 'ventas', value: null })).toBe('empty')
    expect(cardState({ key: 'ventas', value: 0 })).toBe('ready')
  })

  it('a missing value is a dash, never a zero', () => {
    expect(formatValue(null, 'money', 'MXN')).toBe('—')
    expect(formatValue(undefined, 'count')).toBe('—')
    expect(formatValue(12, 'count')).toBe((12).toLocaleString())
    expect(formatValue(-5, 'signed_money', 'MXN')).not.toMatch(/^\+/)
    expect(formatValue(5, 'signed_money', 'MXN')).toMatch(/^\+/)
  })

  it('delta chips use points for margin and vanish without a comparison', () => {
    expect(deltaChip({ delta_pct: 6 }, 'anterior')).toMatchObject({
      tone: 'up',
    })
    expect(
      deltaChip({ delta_pct: -1.4, delta_unit: 'pp' }, 'anterior').label,
    ).toMatch(/pp$/)
    expect(deltaChip({ delta_pct: 6 }, 'no')).toBeNull()
    // More returns is bad news: red, though the arrow still points up.
    expect(
      deltaChip({ delta_pct: 20, invert: true }, 'anterior'),
    ).toMatchObject({ tone: 'down', arrow: 'up' })
    expect(
      deltaChip({ delta_pct: -20, invert: true }, 'anterior'),
    ).toMatchObject({ tone: 'up', arrow: 'down' })
    expect(deltaChip({ delta_pct: null }, 'anterior')).toBeNull()
  })

  it('the access request names the card and its reason', () => {
    const text = accessRequest({
      key: 'margen',
      label: 'Margen',
      blocked_reason: 'Solo contabilidad ve el margen.',
    })
    expect(text).toContain('Margen')
    expect(text).toContain('Solo contabilidad ve el margen.')
  })
})

describe('ResultadosCard', () => {
  let app
  afterEach(() => app?.unmount())

  async function mount(props) {
    const router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(ResultadosCard, props) })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await nextTick()
    return root
  }

  it('shows a skeleton while loading', async () => {
    const root = await mount({ cardKey: 'ventas', card: null, loading: true })
    expect(root.querySelector('[data-state="loading"]')).not.toBeNull()
    expect(root.textContent).not.toMatch(/\$|0/)
  })

  it('a blocked card shows its reason and the access request, never a number', async () => {
    const root = await mount({
      cardKey: 'margen',
      card: {
        key: 'margen',
        label: 'Margen',
        blocked_reason: 'Solo contabilidad ve el margen.',
      },
    })
    expect(root.querySelector('[data-testid="guard"]').textContent).toContain(
      'Solo contabilidad ve el margen.',
    )
    expect(root.textContent).toContain('Copy access request')
    expect(root.querySelector('[data-testid="delta"]')).toBeNull()
  })

  it('a card with nothing to measure explains why instead of showing zero', async () => {
    const root = await mount({
      cardKey: 'margen',
      card: {
        key: 'margen',
        label: 'Margen',
        value: null,
        note: 'Ninguna venta del periodo tiene costo todavía.',
      },
    })
    expect(root.querySelector('[data-testid="empty"]').textContent).toContain(
      'Ninguna venta del periodo tiene costo',
    )
    expect(root.textContent).not.toMatch(/0 %/)
  })

  it('a failed card offers a retry for that card only', async () => {
    const onRetry = vi.fn()
    const root = await mount({
      cardKey: 'ventas',
      card: {
        key: 'ventas',
        blocked_reason: 'No pudimos cargar esta tarjeta.',
        retry: true,
      },
      onRetry,
    })
    root.querySelector('button').click()
    expect(onRetry).toHaveBeenCalledWith('ventas')
  })

  it('a ready card links its attention line and its list with the way back', async () => {
    const back = '/crm/resultados?periodo=hoy'
    const root = await mount({
      cardKey: 'reparaciones',
      back,
      card: {
        key: 'reparaciones',
        label: 'Reparaciones',
        format: 'count',
        value: 9,
        delta_pct: null,
        attention: {
          label: '7 listas sin recoger',
          drill: { path: '/taller/orders', query: { group: 'ready' } },
        },
        drill: {
          label: 'Ver órdenes abiertas',
          path: '/taller/orders',
          query: { group: 'open' },
        },
      },
    })
    const attention = root.querySelector('[data-testid="attention"]')
    expect(attention.textContent).toContain('7 listas sin recoger')
    const url = new URL(attention.getAttribute('href'), 'https://x.invalid')
    expect(url.pathname).toBe('/taller/orders')
    expect(url.searchParams.get('return_to')).toBe(back)
    expect(
      root.querySelector('[data-testid="drill"]').getAttribute('href'),
    ).toContain('group=open')
  })
})

describe('board layout helpers', () => {
  it('wide cards span two columns and full cards the row', () => {
    expect(cardSpan('')).toBe('')
    expect(cardSpan('wide')).toBe('sm:col-span-2 lg:col-span-2')
    expect(cardSpan('full')).toBe('sm:col-span-2 lg:col-span-4')
    expect(cardSpan('', 3)).toBe('lg:col-span-3')
  })

  it('weekday 0 is Monday and hours read in the local clock', () => {
    expect(axisLabel('weekday', 0, true)).toBe(
      new Date(2024, 0, 1).toLocaleDateString(undefined, { weekday: 'long' }),
    )
    expect(axisLabel('hour', 13)).toBe(
      new Date(2024, 0, 1, 13).toLocaleTimeString(undefined, {
        hour: 'numeric',
      }),
    )
  })
})

describe('ResultadosChart', () => {
  let app
  afterEach(() => app?.unmount())

  async function mount(props) {
    const router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(ResultadosChart, props) })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await nextTick()
    return root
  }

  it('draws the trend with its comparison, and drops it without one', async () => {
    const chart = {
      type: 'trend',
      points: [
        { date: '2026-10-01', value: 100, tickets: 2 },
        { date: '2026-10-02', value: 300, tickets: 4 },
      ],
      prev: [
        { date: '2026-09-01', value: 50 },
        { date: '2026-09-02', value: 80 },
      ],
    }
    let root = await mount({ chart, currency: 'MXN' })
    expect(
      root.querySelectorAll('[data-testid="chart-trend"] path'),
    ).toHaveLength(3)
    app.unmount()
    root = await mount({ chart, currency: 'MXN', compara: 'no' })
    expect(
      root.querySelectorAll('[data-testid="chart-trend"] path'),
    ).toHaveLength(2)
  })

  it('ranked rows link their record, filter the board, and fold after six', async () => {
    const onFilter = vi.fn()
    const rows = Array.from({ length: 8 }, (_, i) => ({
      label: `Fila ${i}`,
      value: 100 - i,
    }))
    rows[0].drill = { href: '/crm/productos/ABC' }
    rows[1].filter = { tienda: 'T2' }
    const root = await mount({
      chart: { type: 'bars', format: 'money', rows },
      back: '/crm/resultados',
      onFilter,
    })
    const items = root.querySelectorAll('[data-testid="chart-bars"] > li')
    expect(items).toHaveLength(7) // six rows and «Show 2 more»
    const link = items[0].querySelector('a')
    expect(link.getAttribute('href')).toContain('/crm/productos/ABC')
    expect(link.getAttribute('href')).toContain('return_to=')
    const filter = items[1].querySelector('a')
    expect(filter.getAttribute('href')).toBe('/crm/resultados?tienda=T2')
    filter.click()
    expect(onFilter).toHaveBeenCalledWith({ tienda: 'T2' })
    items[6].querySelector('button').click()
    await nextTick()
    expect(
      root.querySelectorAll('[data-testid="chart-bars"] > li'),
    ).toHaveLength(9)
  })

  it('columns highlight the peak; the heatmap has one row per weekday', async () => {
    let root = await mount({
      chart: {
        type: 'columns',
        axis: 'hour',
        format: 'count',
        rows: [
          { key: 9, value: 1 },
          { key: 10, value: 5 },
        ],
      },
    })
    expect(
      root.querySelector('[data-testid="chart-columns"]').textContent,
    ).toContain('5')
    app.unmount()
    root = await mount({
      chart: {
        type: 'heatmap',
        format: 'money',
        hours: [9, 10],
        values: Array.from({ length: 7 }, () => [0, 10]),
      },
    })
    expect(root.querySelectorAll('tbody tr')).toHaveLength(7)
  })
})

describe('shell wiring', () => {
  it('Resultados is hosted under Dinero order and recovers on its own path', () => {
    const keys = hostedModules.map((m) => m.key)
    expect(keys).toContain('resultados')
    expect(keys.indexOf('resultados')).toBe(keys.indexOf('gastos') + 1)
    expect(hostedModules.find((m) => m.key === 'resultados')).toMatchObject({
      icon: 'lucide-chart-column',
      to: '/resultados',
    })
    expect(recoveryModule('/resultados/documentos?tipo=ventas')).toBe(
      'resultados',
    )
  })

  it('Hoy offers one Resultados shortcut, only when the module is on', () => {
    const boot = (enabled) => ({
      modules: {
        resultados: {
          key: 'resultados',
          enabled,
          capabilities: { read: enabled },
        },
      },
    })
    expect(accesos(boot(true)).map((i) => i.key)).toEqual(['resultados.read'])
    expect(accesos(boot(true))[0].to).toBe('/resultados')
    expect(accesos(boot(false))).toEqual([])
  })
})

describe('Resultados: the walk-in customer and es-MX numbers', () => {
  it('reads «Público en general» on the list and the record', () => {
    expect(walkInName('Publico en General')).toBe('Público en general')
    expect(walkInName(' público en general ')).toBe('Público en general')
    expect(walkInName('CellCity')).toBe('CellCity')
    expect(walkInName('')).toBe('')
  })
  it('formats percents and counts in es-MX whatever the browser locale', () => {
    expect(formatValue(1234.56, 'percent')).toBe('1,234.6 %')
    expect(formatValue(2179, 'count')).toBe('2,179')
    expect(deltaChip({ delta_pct: -84.6 }, 'anterior')).toMatchObject({
      label: '−84.6 %',
      tone: 'down',
    })
  })
})

describe('Recomendación (Encuestas) on the board', () => {
  let app
  afterEach(() => app?.unmount())

  it('reads like the Encuestas page: a signed number, no unit', () => {
    expect(formatValue(40, 'signed')).toBe('+40')
    expect(formatValue(-25, 'signed')).toBe('-25')
    expect(formatValue(0, 'signed')).toBe('0')
    expect(formatValue(null, 'signed')).toBe('—')
    expect(cardTitle('encuestas')).toBe('Recommendation')
  })

  it('shows the number, the three groups and opens Encuestas', async () => {
    const router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(ResultadosCard, {
          cardKey: 'encuestas',
          back: '/crm/resultados',
          card: {
            key: 'encuestas',
            label: 'Recomendación',
            format: 'signed',
            value: 40,
            prev: 20,
            delta_pct: 20,
            delta_unit: 'pp',
            facts: [
              { label: 'Contentos (9–10)', value: 6, format: 'count' },
              { label: 'Neutrales (7–8)', value: 2, format: 'count' },
              { label: 'Inconformes (0–6)', value: 2, format: 'count' },
            ],
            note: '% contentos menos % inconformes',
            drill: {
              label: 'Ver respuestas',
              path: '/crm/encuestas',
              query: { view: 'todas' },
            },
          },
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await nextTick()
    const text = root.textContent.replace(/\s+/g, ' ')
    expect(text).toContain('+40')
    expect(text).toContain('before +20')
    expect(root.querySelector('[data-testid="delta"]').textContent).toContain(
      '+20 pp',
    )
    const facts = [...root.querySelectorAll('dl > div')].map((row) => [
      row.querySelector('dt').textContent.trim(),
      row.querySelector('dd').textContent.trim(),
    ])
    expect(facts).toEqual([
      ['Contentos (9–10)', '6'],
      ['Neutrales (7–8)', '2'],
      ['Inconformes (0–6)', '2'],
    ])
    const url = new URL(
      root.querySelector('[data-testid="drill"]').getAttribute('href'),
      'https://x.invalid',
    )
    expect(url.pathname).toBe('/crm/encuestas')
    expect(url.searchParams.get('view')).toBe('todas')
  })
})

describe('a ticket in the lens', () => {
  const sale = {
    doctype: 'Sales Invoice',
    name: 'ACC-SINV-2026-03969',
    title: 'vianey de jesus rojas faustos',
    owner: 'trgc111409',
    posting_time: '16:23',
    amount: 952,
    outstanding: 0,
    status: 'Paid',
    items: [
      { item_code: 'IPN003282', item_name: 'Mica 9D Samsung A16', qty: 1 },
      {
        item_code: 'IPN003707',
        item_name: 'Samsung A16 128GB+4GB Negro',
        qty: 1,
      },
    ],
    items_count: 4,
    payments: [{ mode: 'Cash', amount: 952 }],
  }

  it('the search finds it by what was sold, in any order and without accents', () => {
    expect(lensMatch(sale, 'a16 mica')).toBe(true)
    expect(lensMatch(sale, 'IPN003707')).toBe(true)
    expect(lensMatch(sale, 'vianey')).toBe(true)
    expect(lensMatch(sale, 'iphone')).toBe(false)
  })

  it('reads how it was paid and who rang it', () => {
    expect(saleLine(sale, (m) => (m === 'Cash' ? 'Efectivo' : m))).toBe(
      'Efectivo · trgc111409',
    )
    expect(
      saleLine({ payments: [{ mode: 'Cash' }, { mode: 'Credit Card' }] }),
    ).toBe('Cash + Credit Card')
  })

  it('shows a state only when it changes what the worker does', () => {
    expect(saleState(sale)).toBe(null)
    expect(saleState({ ...sale, outstanding: 200 })).toEqual({
      status: 'Unpaid',
    })
    expect(saleState({ ...sale, return_against: 'X' })).toEqual({
      status: 'Return',
    })
  })

  it('splits the period by payment mode, the biggest first', () => {
    const split = paymentSplit([
      sale,
      { payments: [{ mode: 'Credit Card', amount: 100 }] },
      { payments: [{ mode: 'Cash', amount: 200 }] },
    ])
    expect(split.map((p) => [p.mode, p.amount, p.share])).toEqual([
      ['Cash', 1152, 92],
      ['Credit Card', 100, 8],
    ])
    expect(paymentSplit([])).toEqual([])
  })

  it('a sold item opens its product and comes back to the ticket', () => {
    const back = '/crm/resultados/documento/Sales%20Invoice/X'
    const url = new URL(productHref('IPN 1', back, 'X'), 'https://x.invalid')
    expect(url.pathname).toBe('/crm/productos/IPN%201')
    expect(url.searchParams.get('return_to')).toBe(back)
    expect(productHref('', back)).toBe(null)
  })

  it('posting times read as hours and minutes', () => {
    expect(clockText('16:23:05.123')).toBe('16:23')
    expect(clockText('9:05:00')).toBe('09:05')
    expect(clockText('')).toBe('')
    expect(clockText('nope')).toBe('')
  })
})

describe('the lens answers from memory', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a list read once shows again at once, and its rows seed their tickets', () => {
    const rows = [{ doctype: 'Sales Invoice', name: 'MEM-1', title: 'Ana' }]
    lensToMemory('k', { rows, capped: false, period: {} })
    expect(lensFromMemory('k').rows).toBe(rows)
    expect(rowFromMemory('Sales Invoice', 'MEM-1').title).toBe('Ana')
    expect(lensFromMemory('other')).toBe(null)
  })

  it('a ticket prefetched on press is read once, and kept for the next open', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: { name: 'MEM-2', items: [] } }),
    }))
    vi.stubGlobal('fetch', fetch)
    const first = fetchDocument('Sales Invoice', 'MEM-2')
    const again = fetchDocument('Sales Invoice', 'MEM-2')
    expect(again).toBe(first)
    await first
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(documentFromMemory('Sales Invoice', 'MEM-2').name).toBe('MEM-2')
  })

  it('a failed read is forgotten, so the next open asks again', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    vi.stubGlobal('fetch', fetch)
    await expect(fetchDocument('Sales Invoice', 'MEM-3')).rejects.toBeTruthy()
    await expect(fetchDocument('Sales Invoice', 'MEM-3')).rejects.toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(documentFromMemory('Sales Invoice', 'MEM-3')).toBe(null)
  })
})
