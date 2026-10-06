// Real vue-router navigation through the Ventas legacy guard and the deal
// record's return link: what callers send is what the worker gets back.
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  dealReturnLink,
  legacyDealRedirect,
  legacyVentasRoute,
} from '@/utils/ventasRoutes'
import { conversionQueueReturn } from '@/utils/salesQueueContext'

const page = { render: () => null }

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Home', component: page },
      { path: '/leads', name: 'Leads List', component: page },
      { path: '/deals', name: 'Deals List', component: page },
      { path: '/call-logs', name: 'Calls List', component: page },
      { path: '/deals/view/:viewType?', name: 'Deals', component: page },
      { path: '/leads/view/:viewType?', name: 'Leads', component: page },
      { path: '/deals/:dealId', name: 'Deal', component: page },
      { path: '/ventas/deal/:dealId', name: 'Deal 360', component: page },
      { path: '/deal/:dealId', redirect: legacyDealRedirect },
      { path: '/reports', name: 'Reports', component: page },
      { path: '/forms/:name?', name: 'Forms', component: page },
    ],
  })
  // the same decision router.js makes with the addon installed
  router.beforeEach((to, from) => legacyVentasRoute(to, true, from) || true)
  return router
}

describe('legacy lists keep working flows', () => {
  it('«Vista clásica» stays on the classic list with all its filters', async () => {
    const router = makeRouter()
    await router.push('/deals')
    await router.push({ path: '/deals/view', query: { classic: '1' } })
    expect(router.currentRoute.value.name).toBe('Deals')
    // working inside the classic list (layout, filters) never bounces out
    await router.push({ name: 'Deals', params: { viewType: 'kanban' } })
    expect(router.currentRoute.value.name).toBe('Deals')
    await router.push({
      name: 'Deals',
      params: { viewType: 'list' },
      query: { status: 'Open' },
    })
    expect(router.currentRoute.value.name).toBe('Deals')
  })

  it('a saved upstream view link opens that view, not a silent default', async () => {
    const router = makeRouter()
    await router.push('/deals/view/list?view=VIEW-7')
    expect(router.currentRoute.value.name).toBe('Deals')
    expect(router.currentRoute.value.query.view).toBe('VIEW-7')
    await router.push('/leads/view/kanban?view=Mine')
    expect(router.currentRoute.value.name).toBe('Leads')
  })

  it('a plain legacy list link still lands on the redesigned list', async () => {
    const router = makeRouter()
    await router.push('/deals/view/kanban?status=Open')
    expect(router.currentRoute.value.name).toBe('Deals List')
    expect(router.currentRoute.value.query).toEqual({
      status: 'Open',
      layout: 'board',
    })
  })
})

describe('the deal record returns to its caller', () => {
  const open = async (location) => {
    const router = makeRouter()
    await router.push(location)
    const route = router.currentRoute.value
    expect(route.name).toBe('Deal 360')
    return dealReturnLink(route.query)
  }

  it('reports', async () => {
    const back = await open({
      name: 'Deal',
      params: { dealId: 'D-1' },
      query: { returnTo: '/reports?report=funnel' },
    })
    expect(back).toEqual({
      to: '/reports?report=funnel',
      label: 'Return to report',
    })
  })

  it('form submissions', async () => {
    const back = await open({
      name: 'Deal',
      params: { dealId: 'D-1' },
      query: { returnTo: '/forms/Contacto?tab=submissions' },
    })
    expect(back.to).toBe('/forms/Contacto?tab=submissions')
    expect(back.label).toBe('Return to form submissions')
  })

  it('lead conversion (through the old /deal/ path too)', async () => {
    const returnTo = conversionQueueReturn({
      fullPath: '/leads?status=New',
      query: {},
    })
    for (const location of [
      { name: 'Deal', params: { dealId: 'D-1' }, query: { returnTo } },
      `/deal/D-1?returnTo=${encodeURIComponent(returnTo)}`,
    ]) {
      const back = await open(location)
      expect(back).toEqual({ to: returnTo, label: 'Return to queue' })
    }
  })

  it('shell return_to wins; junk falls back to the deals list', async () => {
    expect(
      dealReturnLink({
        return_to: '/crm/contactos/C-1',
        return_label: 'Ana',
        returnTo: '/reports',
      }).to,
    ).toBe('/contactos/C-1')
    expect(dealReturnLink({ returnTo: 'https://evil.example/' })).toEqual({
      to: { name: 'Deals List' },
      label: 'Back to deals',
    })
  })
})
