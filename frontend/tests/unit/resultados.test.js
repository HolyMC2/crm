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
  boardHref,
  cardState,
  deltaChip,
  drillHref,
  formatValue,
  readLensQuery,
  readQuery,
  routerPath,
  rowRoute,
  toQuery,
} from '../../src/composables/useResultados.js'
import { accesos } from '../../src/composables/useHoy.js'
import { hostedModules } from '../../src/composables/muelleShell.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import ResultadosCard from '../../src/components/resultados/ResultadosCard.vue'

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
