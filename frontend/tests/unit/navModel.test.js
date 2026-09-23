// Suite app quick access (composables/navModel.js): the sibling-app links the
// profile panel and mobile drawer render, gated per tenant by installed app.
import { describe, it, expect } from 'vitest'
import {
  navItemsBottom,
  routeGroup,
  suiteApps,
  visibleSuiteApps,
} from '@/composables/navModel'

const installed = (apps) => (name) => apps.includes(name)
const keys = (list) => list.map((app) => app.key)

describe('navModel: suiteApps', () => {
  it('links the muelle routes (Desk at /desk, POS web entry at /posapp)', () => {
    const routes = Object.fromEntries(
      suiteApps.map((app) => [app.key, app.route]),
    )
    expect(routes).toEqual({
      mercado: '/mercado/',
      taller: '/taller/',
      pos: '/posapp',
      desk: '/desk',
    })
  })

  it('shows every app on a full-suite tenant, in menu order', () => {
    const full = installed([
      'frappe',
      'erpnext',
      'crm',
      'mercado',
      'taller',
      'posawesome',
    ])
    expect(keys(visibleSuiteApps(full))).toEqual([
      'mercado',
      'taller',
      'pos',
      'desk',
    ])
  })

  it('hides apps the tenant does not have (no dead links)', () => {
    const clinic = installed([
      'frappe',
      'erpnext',
      'crm',
      'posawesome',
      'healthcare',
    ])
    expect(keys(visibleSuiteApps(clinic))).toEqual(['pos', 'desk'])
  })

  it('keeps Desk while the capability lookup is pending or unknown', () => {
    const pending = () => false
    expect(keys(visibleSuiteApps(pending))).toEqual(['desk'])
  })
})

// Pipeline Analysis had a route but no way in (gaps doc §Gap 3). It is now a
// bottom-rail entry with its OWN nav group, so opening the funnel no longer
// lights up Leads.
describe('navModel: funnel entry', () => {
  it('puts «Embudo» in the bottom rail pointing at /pipeline-analysis', () => {
    const funnel = navItemsBottom.find((item) => item.key === 'funnel')
    expect(funnel).toBeTruthy()
    expect(funnel.to).toBe('/pipeline-analysis')
    expect(funnel.group).toBe('funnel')
    expect(funnel.icon).toBeTruthy()
  })

  it('lights the funnel group, not leads, on /pipeline-analysis', () => {
    expect(routeGroup('/pipeline-analysis')).toBe('funnel')
    expect(routeGroup('/pipeline-analysis/')).toBe('funnel')
  })

  it('leaves the other leads-family routes on the leads group', () => {
    expect(routeGroup('/leads')).toBe('leads')
    expect(routeGroup('/pipeline')).toBe('leads')
    expect(routeGroup('/stage-scripts')).toBe('leads')
    expect(routeGroup('/enrichment')).toBe('leads')
  })
})
