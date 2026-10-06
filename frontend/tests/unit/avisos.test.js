import { describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

const {
  activeEntry,
  avisosQuery,
  avisosState,
  badgeLabel,
  entryState,
  listEntries,
  metaLine,
  openTarget,
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
    expect(where).toEqual({ kind: 'desk', href: '/app/todo/T-1' })
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
    expect(line).toBe('×3 · Juan Pérez · 5 minutes ago')
  })
})
