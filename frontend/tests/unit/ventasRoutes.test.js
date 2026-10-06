import { describe, expect, it } from 'vitest'
import {
  dealTab,
  dealTabFromHash,
  legacyVentasRoute,
} from '@/utils/ventasRoutes'
import { GATED_ROUTES, gateRoute } from '@/utils/crmCapabilities'

describe('legacyVentasRoute', () => {
  it('sends the legacy Deal page to the one deal record, hash → section', () => {
    expect(
      legacyVentasRoute(
        {
          name: 'Deal',
          params: { dealId: 'CRM-DEAL-1' },
          query: { a: '1' },
          hash: '#orders',
        },
        true,
      ),
    ).toEqual({
      name: 'Deal 360',
      params: { dealId: 'CRM-DEAL-1' },
      query: { a: '1', tab: 'items' },
    })
    expect(
      legacyVentasRoute(
        { name: 'Deal', params: { dealId: 'D' }, hash: '#tasks' },
        true,
      ).query,
    ).toEqual({ tab: 'activity' })
    // an explicit valid tab wins over the hash; an unknown hash adds nothing
    expect(
      legacyVentasRoute(
        {
          name: 'Deal',
          params: { dealId: 'D' },
          query: { tab: 'repair' },
          hash: '#notes',
        },
        true,
      ).query.tab,
    ).toBe('repair')
    expect(
      legacyVentasRoute(
        { name: 'Deal', params: { dealId: 'D' }, hash: '#nope' },
        true,
      ).query,
    ).toEqual({})
  })

  it('folds the upstream list families into the redesigned lists', () => {
    expect(
      legacyVentasRoute(
        {
          name: 'Deals',
          params: { viewType: 'kanban' },
          query: { view: 'Mine', owner: 'me' },
        },
        true,
      ),
    ).toBe(null)
    // a saved upstream view stays on the classic list; plain links fold
    expect(
      legacyVentasRoute(
        {
          name: 'Deals',
          params: { viewType: 'kanban' },
          query: { owner: 'me' },
        },
        true,
      ),
    ).toEqual({ name: 'Deals List', query: { owner: 'me', layout: 'board' } })
    expect(
      legacyVentasRoute({ name: 'Leads', params: { viewType: 'list' } }, true),
    ).toEqual({ name: 'Leads List', query: {} })
    expect(
      legacyVentasRoute({ name: 'Call Logs', params: {}, query: {} }, true),
    ).toEqual({ name: 'Calls List', query: {} })
  })

  it('never redirects without the addon (native pages are the product)', () => {
    for (const to of [
      { name: 'Deal', params: { dealId: 'D' } },
      { name: 'Deals', params: {} },
      { name: 'Leads', params: {} },
      { name: 'Call Logs', params: {} },
    ])
      expect(legacyVentasRoute(to, false)).toBe(null)
    expect(
      legacyVentasRoute({ name: 'Deal 360', params: { dealId: 'D' } }, true),
    ).toBe(null)
  })

  it('cannot loop with the capability gate', () => {
    // without the addon the gate sends Deal 360 → Deal and legacy stays put
    const gated = gateRoute(
      { name: 'Deal 360', params: { dealId: 'D' }, query: {} },
      false,
    )
    expect(gated.name).toBe('Deal')
    expect(legacyVentasRoute(gated, false)).toBe(null)
    // with the addon the gate lets Deal 360 through and legacy redirects to it
    expect(gateRoute({ name: 'Deal 360', params: { dealId: 'D' } }, true)).toBe(
      null,
    )
    for (const [name, target] of Object.entries(GATED_ROUTES)) {
      if (typeof target === 'function' || target.name === 'Home') continue
      const back = legacyVentasRoute(
        { name: target.name, params: {}, query: {} },
        true,
      )
      if (back) expect(back.name).toBe(name)
    }
  })
})

describe('deal sections', () => {
  it('accepts only known sections', () => {
    expect(dealTab('items')).toBe('items')
    expect(dealTab('desk')).toBe(null)
    expect(dealTabFromHash('#WhatsApp')).toBe('conversation')
    expect(dealTabFromHash('')).toBe(null)
  })
})
