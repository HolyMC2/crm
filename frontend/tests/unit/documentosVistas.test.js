// «Vistas» on a document list: a saved view is the list's URL query under a
// name; the title shows the view the list is on and opens the sheet to switch,
// save or delete one.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  activeView,
  describeView,
  normalQuery,
  sameQuery,
  suggestName,
} from '@/documentos/vistas'
import profile from '@/documentos/profiles/sales_invoice'

const api = vi.hoisted(() => ({ docApi: vi.fn() }))
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: (...args) => api.docApi(...args),
}))

import DocumentosList from '@/pages/DocumentosList.vue'

const VENCIDAS = {
  name: '7',
  label: 'Vencidas de devoluciones',
  query: { estado: 'vencidas', f_is_return: '1' },
  public: false,
  mine: true,
  can_change: true,
}
const EQUIPO = {
  name: '8',
  label: 'Deben más',
  query: { orden: 'outstanding_amount desc' },
  public: true,
  mine: false,
  can_change: false,
}

describe('vistas helpers', () => {
  it('compares queries without order or empty values', () => {
    expect(normalQuery({ q: '', orden: 'x', estado: 'a' })).toEqual({
      estado: 'a',
      orden: 'x',
    })
    expect(sameQuery({ a: '1', b: '2' }, { b: '2', a: '1', c: '' })).toBe(true)
    expect(sameQuery({ a: '1' }, {})).toBe(false)
    expect(
      activeView([VENCIDAS, EQUIPO], { f_is_return: '1', estado: 'vencidas' }),
    ).toBe(VENCIDAS)
    expect(activeView([VENCIDAS], {})).toBeNull()
  })

  it('says what a view shows in the worker’s words', () => {
    const query = {
      estado: 'vencidas',
      f_is_return: '1',
      q: 'acme',
      orden: 'due_date asc',
    }
    expect(describeView(query, profile)).toBe(
      'Vencidas · Tipo: Devoluciones · “acme” · Vencen primero',
    )
    expect(describeView({ de: '[]', de_label: 'Pedido 12' }, profile)).toBe(
      'Pedido 12',
    )
    expect(suggestName({ q: 'x'.repeat(80) })).toHaveLength(60)
  })
})

let app, root
afterEach(() => {
  app?.unmount()
  root?.remove()
  api.docApi.mockReset()
})

async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
}

async function mount(path) {
  api.docApi.mockImplementation(async (method) => {
    if (method === 'views')
      return { views: [VENCIDAS, EQUIPO], can_publish: false }
    if (method === 'rows') return { rows: [], has_more: false }
    if (method === 'counts') return {}
    if (method === 'save_view')
      return {
        views: [
          VENCIDAS,
          EQUIPO,
          {
            ...VENCIDAS,
            name: '9',
            label: 'Pagadas',
            query: { estado: 'pagadas' },
          },
        ],
        can_publish: false,
      }
    return null
  })
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/documentos', component: { template: '<p>hub</p>' } },
      { path: '/documentos/:slug', component: DocumentosList },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await settle()
  return router
}

// The sheet and its BottomSheet load on the first open.
async function openSheet() {
  root.querySelector('[aria-haspopup="dialog"]').click()
  for (let i = 0; i < 50; i++) {
    await settle()
    if (document.querySelector('[data-testid="vistas-list"]')) return
  }
}

const title = () => root.querySelector('[data-appbar-title]').textContent

describe('a list on a saved view', () => {
  it('names the view in the title and goes back to the list from the sheet', async () => {
    const router = await mount(
      '/documentos/facturas?estado=vencidas&f_is_return=1',
    )
    expect(title()).toContain('Vencidas de devoluciones')
    expect(api.docApi).toHaveBeenCalledWith('views', {
      doctype: 'Sales Invoice',
    })

    await openSheet()
    const rows = [...document.querySelectorAll('[data-testid="vistas-view"]')]
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Vencidas de devoluciones'),
      expect.stringContaining('Del equipo · Deben más'),
    ])
    // Only the worker's own view can be deleted, and only on a second tap.
    expect(
      document.querySelectorAll('[data-testid="vistas-delete"]'),
    ).toHaveLength(1)
    // Already saved: the sheet says so instead of offering the form.
    expect(document.body.textContent).toContain(
      'Ya la tienes guardada como «Vencidas de devoluciones»',
    )

    document.querySelector('[data-testid="vistas-all"]').click()
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(title()).toContain('Facturas')
  })

  it('saves the list as it is under a name', async () => {
    await mount('/documentos/facturas?estado=pagadas')
    expect(title()).toContain('Facturas')
    await openSheet()
    const name = document.querySelector('[data-testid="vistas-name"]')
    expect(name.value).toBe('Pagadas')
    expect(document.querySelector('[data-testid="vistas-team"]')).toBeNull()
    document.querySelector('[data-testid="vistas-save"]').click()
    await settle()
    expect(api.docApi).toHaveBeenCalledWith('save_view', {
      doctype: 'Sales Invoice',
      label: 'Pagadas',
      query: { estado: 'pagadas' },
      public: 0,
    })
    expect(title()).toContain('Pagadas')
  })
})
