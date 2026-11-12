// CompraSurtido mounted: a list with no products yet (a picture still being
// read, or one that read 0 products) opens the screen instead of a blank page
// (prod 2026-11-11: «Surtir desde una lista» went black on such a list).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ catalogs: [], calls: [] }))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    comprasApi: vi.fn(async (method, args) => {
      state.calls.push([method, args])
      if (method.endsWith('.bootstrap'))
        return { enabled: true, catalogs: state.catalogs, pedidos: [] }
      if (method.endsWith('.plan_page'))
        return { id: args.plan, lines: [], total: 0, owner: false }
      return {}
    }),
  }
})

import CompraSurtido from '@/pages/CompraSurtido.vue'

let app, root
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/compras', name: 'Compras', component: { render: () => null } },
      {
        path: '/compras/niveles',
        name: 'CompraNiveles',
        component: { render: () => null },
      },
      {
        path: '/compras/surtido',
        name: 'CompraSurtido',
        component: CompraSurtido,
      },
    ],
  })
  router.push(`/compras/surtido${query}`)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  const errors = []
  app = createApp(CompraSurtido)
  app.config.errorHandler = (error) => errors.push(error)
  app.config.globalProperties.__ = (text, args) =>
    String(text).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
  app.use(router)
  app.mount(root)
  await settle()
  return errors
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.calls.length = 0
})

describe('Surtido page', () => {
  it('a list with no products yet opens the screen, not a blank page', async () => {
    window.__ = (text) => text
    state.catalogs = [
      {
        name: '9tbus8cpt9',
        title: 'Perfeccel',
        supplier: 'PERFECCEL',
        status: 'Indexado',
        page_count: 1,
        lines: 0,
        modified: '2026-11-10 18:00:00',
      },
    ]
    const errors = await mount('?catalogo=9tbus8cpt9')
    expect(errors).toEqual([])
    expect(root.querySelector('[data-testid="surtido-actual"]')).not.toBeNull()
    expect(root.textContent).toContain('Restock from a list')
    // no facets asked for a list with nothing to read
    expect(state.calls.some(([method]) => method.endsWith('.facets'))).toBe(
      false,
    )
  })

  it("?plan= opens the assistant's buy plan instead of the lists", async () => {
    window.__ = (text) => text
    const errors = await mount('?plan=sp-1')
    // the plan view is its own chunk: wait for its first read
    await vi.waitFor(
      () =>
        expect(state.calls.map(([method]) => method)).toContain(
          'doco.workspaces.surtido_plan.plan_page',
        ),
      { timeout: 15000 },
    )
    expect(errors).toEqual([])
    expect(state.calls.some(([method]) => method.endsWith('.bootstrap'))).toBe(
      false,
    )
  })
})
