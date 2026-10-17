import { describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

const {
  actionLabel,
  activeEntry,
  avisosQuery,
  avisosState,
  badgeLabel,
  entryState,
  listEntries,
  metaLine,
  openTarget,
  deskPath,
  useAvisosActions,
} = await import('@/composables/useAvisos')

const page = { render: () => null }
const router = createRouter({
  history: createMemoryHistory('/crm'),
  routes: [
    { path: '/avisos', component: page },
    { path: '/contactos/:source/:name', component: page },
    { path: '/deals/:dealId', component: page },
    { path: '/notifications', redirect: () => ({ path: '/avisos' }) },
    { path: '/:invalidpath', component: page },
  ],
})

describe('Avisos list state', () => {
  it('reads the URL and falls back to the inbox for unknown values', () => {
    expect(avisosState({})).toEqual({ view: 'inbox', category: 'all', q: '' })
    expect(avisosState({ view: 'history', category: 'alerts' })).toEqual({
      view: 'history',
      category: 'all',
      q: '',
    })
    expect(avisosState({ category: 'messages', q: 'trato' })).toEqual({
      view: 'inbox',
      category: 'messages',
      q: 'trato',
    })
    expect(avisosState({ view: 'evil', category: ['direct'] }).category).toBe(
      'direct',
    )
  })

  it('round-trips sidebar entries through the query', () => {
    for (const entry of listEntries()) {
      const state = entryState(entry.value, 'x')
      expect(activeEntry(avisosState(avisosQuery(state)))).toBe(entry.value)
    }
    expect(avisosQuery({ view: 'inbox', category: 'all', q: '' })).toEqual({})
  })

  it('shows unread group counts on the inbox and category entries', () => {
    const entries = listEntries({ direct: 2, alerts: 1 })
    expect(entries[0].label).toBe('To review · 3')
    expect(entries.find((e) => e.value === 'direct').label).toBe('For you · 2')
    expect(entries.find((e) => e.value === 'system').label).toBe('System')
  })

  it('caps the bell at 99+', () => {
    expect(badgeLabel({ count: 0 })).toBe('')
    expect(badgeLabel({ count: 7 })).toBe('7')
    expect(badgeLabel({ count: 140 })).toBe('99+')
    expect(badgeLabel({ count: 99, capped: true })).toBe('99+')
  })
})

describe('Avisos targets', () => {
  it('opens a known SPA record with return_to back to the caller', () => {
    const where = openTarget(
      {
        target: {
          route: '/deals/DEAL-1#whatsapp',
          desk: '/app/crm-deal/DEAL-1',
        },
      },
      router,
      '/crm/avisos?category=messages',
    )
    expect(where.kind).toBe('route')
    const url = new URL(where.to, 'https://x.invalid')
    expect(url.pathname).toBe('/deals/DEAL-1')
    expect(url.hash).toBe('#whatsapp')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/avisos?category=messages',
    )
    expect(url.searchParams.get('return_label')).toBe('Avisos')
  })

  it('falls back to Desk when this build has no page for the route', () => {
    const where = openTarget(
      {
        target: {
          route: '/pendientes/todo/T-1',
          desk: '/app/todo/T-1',
        },
      },
      router,
      '/crm/avisos',
    )
    expect(where).toEqual({ kind: 'desk', href: '/desk/todo/T-1' })
  })

  it('never builds a link without a target and keeps the reason', () => {
    expect(
      openTarget({ target: { reason: 'No record' } }, router, '/crm/avisos'),
    ).toEqual({ kind: 'none', reason: 'No record' })
  })

  it('drops an external return_to', () => {
    const where = openTarget(
      { target: { route: '/contactos/customer/C-1' } },
      router,
      'https://evil.invalid/x',
    )
    expect(where.to).toBe('/contactos/customer/C-1')
  })

  it('redirects the old notifications page to Avisos', async () => {
    await router.push('/notifications')
    expect(router.currentRoute.value.path).toBe('/avisos')
  })
})

describe('Avisos rows', () => {
  it('summarizes count, record and time in one line', () => {
    const line = metaLine(
      {
        count: 3,
        category: 'messages',
        docname: 'DEAL-1',
        target: { label: 'Juan Pérez' },
        latest: '2026-10-05 10:00:00',
      },
      {
        lang: 'en',
        timezone: { system: 'UTC' },
        now: Date.UTC(2026, 9, 5, 10, 5),
      },
    )
    expect(line).toBe('3 identical avisos · Juan Pérez · newest 5 minutes ago')
  })

  it('does not repeat a record the title already names', () => {
    const line = metaLine(
      {
        count: 1,
        category: 'direct',
        title: 'Ana assigned you «Avisar equipo listo»',
        target: { label: 'Avisar equipo listo' },
        latest: '2026-10-05 10:00:00',
      },
      {
        lang: 'en',
        timezone: { system: 'UTC' },
        now: Date.UTC(2026, 9, 5, 10, 5),
      },
    )
    expect(line).toBe('5 minutes ago')
  })

  it('names no record whose id is only a hash', () => {
    const at = {
      lang: 'en',
      timezone: { system: 'UTC' },
      now: Date.UTC(2026, 9, 5, 10, 5),
    }
    const group = {
      count: 1,
      category: 'alerts',
      title: 'Pago al SAT confirmado',
      latest: '2026-10-05 10:00:00',
    }
    expect(metaLine({ ...group, docname: '4vv6e0b4bu' }, at)).toBe(
      '5 minutes ago',
    )
    expect(metaLine({ ...group, docname: 'SAT-2026-08' }, at)).toBe(
      'SAT-2026-08 · 5 minutes ago',
    )
  })

  it('names the action that resolves the aviso, or none for a dead end', () => {
    expect(
      actionLabel({
        target: {
          href: '/contador/global',
          action: 'Issue the global invoice',
        },
      }),
    ).toBe('Issue the global invoice')
    expect(actionLabel({ target: { desk: '/app/error-log' } })).toBe('Open')
    expect(actionLabel({ target: { reason: 'Ask your manager' } })).toBe('')
  })
})

describe('Avisos sibling-app targets', () => {
  it('opens Taller or Contador with return_to back to Avisos', () => {
    const where = openTarget(
      {
        target: { href: '/taller/orders/RO-1', desk: '/app/repair-order/RO-1' },
      },
      router,
      '/crm/avisos?category=direct',
    )
    expect(where.kind).toBe('app')
    const url = new URL(where.href, 'https://x.invalid')
    expect(url.pathname).toBe('/taller/orders/RO-1')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/avisos?category=direct',
    )
  })

  it('refuses an href that leaves the site', () => {
    for (const href of [
      '//evil.invalid/x',
      'https://evil.invalid',
      '/\\evil',
    ]) {
      expect(
        openTarget(
          { target: { href, desk: '/app/x/1' } },
          router,
          '/crm/avisos',
        ),
      ).toEqual({ kind: 'desk', href: '/desk/x/1' })
    }
  })

  it('prefers a route this build knows over the sibling app', () => {
    const where = openTarget(
      { target: { route: '/deals/D-1', href: '/taller/orders/RO-1' } },
      router,
      '',
    )
    expect(where).toEqual({ kind: 'route', to: '/deals/D-1' })
  })
})

describe('Avisos open without waiting', () => {
  it('links Desk at /desk so the click skips the /app 301', () => {
    expect(deskPath('/app/sales-invoice/SI-1')).toBe('/desk/sales-invoice/SI-1')
    expect(deskPath('/app?x=1')).toBe('/desk?x=1')
    expect(deskPath('/app')).toBe('/desk')
    expect(deskPath('/apps/x')).toBe('/apps/x')
    expect(deskPath('/taller/app/1')).toBe('/taller/app/1')
    const where = openTarget(
      { target: { href: '/app/asistencia?v=ausencias&request=HR-1' } },
      router,
      '/crm/avisos',
    )
    const url = new URL(where.href, 'https://x.invalid')
    expect(url.pathname).toBe('/desk/asistencia')
    expect(url.searchParams.get('request')).toBe('HR-1')
  })

  it('leaves for a sibling app at once and marks read with a keepalive request', async () => {
    const calls = []
    const assign = vi.fn()
    vi.stubGlobal('fetch', (url, init) => {
      calls.push({ url, init })
      return new Promise(() => {}) // the server never answers before we leave
    })
    vi.stubGlobal('window', { csrf_token: 'tok', location: { assign } })
    const closed = vi.fn()
    const actions = useAvisosActions(router, {
      returnTo: () => '/crm/avisos',
      onNavigate: closed,
    })
    await actions.open({
      key: 'k1',
      unread: true,
      target: { href: '/taller/orders/RO-1' },
    })
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign.mock.calls[0][0]).toMatch(/^\/taller\/orders\/RO-1\?/)
    expect(closed).toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/method/crm.api.avisos.mark_read')
    expect(calls[0].init.keepalive).toBe(true)
    expect(calls[0].init.headers['X-Frappe-CSRF-Token']).toBe('tok')
    expect(new URLSearchParams(calls[0].init.body).get('keys')).toBe('["k1"]')
    vi.unstubAllGlobals()
  })

  it('does not mark an already read aviso', async () => {
    const fetchSpy = vi.fn(() => new Promise(() => {}))
    const assign = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('window', { location: { assign } })
    await useAvisosActions(router).open({
      key: 'k2',
      unread: false,
      target: { desk: '/app/todo/T-1' },
    })
    expect(assign).toHaveBeenCalledWith('/desk/todo/T-1')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
