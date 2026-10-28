// «Acciones» on a document list: one bolt holds what the worker can do with
// the whole list. Every list gets sort, views and select; a profile adds its
// own kinds of new document and shortcuts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { listActionsFor } from '@/documentos/acciones'
import { genericProfile } from '@/documentos/profiles/_generic'
import stockEntry from '@/documentos/profiles/stock_entry'
import salesInvoice from '@/documentos/profiles/sales_invoice'
import { shellBoot } from '@/composables/muelleShell'

const api = vi.hoisted(() => ({ docApi: vi.fn() }))
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: (...args) => api.docApi(...args),
}))

import DocumentosList from '@/pages/DocumentosList.vue'

const ON = { enabled: true }
const labels = (group) => group.items.map((item) => item.label)
const group = (groups, key) => groups.find((g) => g.key === key)

describe('listActionsFor', () => {
  it('gives every list sort, views and select, and says why select waits', () => {
    const groups = listActionsFor(
      { ...genericProfile, sorts: [{ value: '', label: 'Más recientes' }] },
      { rows: 0, vistas: true },
    )
    expect(groups.map((g) => g.key)).toEqual(['lista'])
    expect(labels(groups[0])).toEqual(['Vistas', 'Seleccionar varios'])
    const select = groups[0].items[1]
    expect(select.allowed).toBe(false)
    expect(select.reason).toContain('La lista está vacía')
  })

  it('folds the sorts into one dropdown with the current one checked', () => {
    const [lista] = listActionsFor(salesInvoice, {
      rows: 3,
      sort: 'due_date asc',
      hasFilters: true,
    })
    const sort = lista.items[0]
    expect(sort.label).toBe('Ordenar')
    expect(sort.hint).toBe('Vencen primero')
    expect(sort.options.filter((o) => o.selected)).toEqual([
      { value: 'due_date asc', label: 'Vencen primero', selected: true },
    ])
    expect(labels(lista)).toContain('Quitar filtros')
  })

  it('opens each kind of stock entry with its type picked, only for who may create', () => {
    const createTo = { path: '/inventario/entradas/nuevo' }
    const groups = listActionsFor(stockEntry, {
      createTo,
      modules: { inventario: ON },
      rows: 1,
    })
    const crear = group(groups, 'crear')
    expect(crear.tiles).toBe(true)
    expect(labels(crear)).toEqual(['Entrada', 'Salida', 'Traspaso'])
    expect(crear.items[2].to).toEqual({
      path: '/inventario/entradas/nuevo',
      query: { stock_entry_type: 'Material Transfer' },
    })
    expect(labels(group(groups, 'atajos'))).toEqual([
      'Movimientos por producto',
    ])

    const reader = listActionsFor(stockEntry, { modules: {}, rows: 1 })
    expect(reader.map((g) => g.key)).toEqual(['lista'])
  })
})

let app, root, width
beforeEach(() => {
  width = window.innerWidth
  shellBoot.value = {
    modules: {
      inventario: {
        enabled: true,
        capabilities: { doctypes: ['Stock Entry'], create: ['Stock Entry'] },
      },
    },
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  api.docApi.mockReset()
  shellBoot.value = null
  setWidth(width)
  document.body.innerHTML = ''
})

function setWidth(value) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value,
  })
  window.dispatchEvent(new Event('resize'))
}

async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
}

const ROW = {
  name: 'MAT-STE-1',
  docstatus: 1,
  fields: { purpose: 'Material Receipt', to_warehouse: 'Centro - D' },
}

async function mount(path) {
  api.docApi.mockImplementation(async (method) => {
    if (method === 'views') return { views: [], can_publish: false }
    if (method === 'rows') return { rows: [ROW], has_more: false }
    if (method === 'counts') return {}
    return null
  })
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/inventario', component: { template: '<p>hub</p>' } },
      { path: '/inventario/movimientos', component: { template: '<p>k</p>' } },
      {
        path: '/inventario/:slug/nuevo',
        component: { template: '<p>new</p>' },
      },
      { path: '/inventario/:slug', component: DocumentosList },
      { path: '/inventario/:slug/:name', component: { template: '<p>r</p>' } },
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

async function openAcciones() {
  const bolt = root.querySelector('[data-testid="documentos-acciones"]')
  bolt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  bolt.click()
  for (let i = 0; i < 50; i++) {
    await settle(1)
    if (document.querySelector('[data-testid="acciones"]')) return
  }
}
const accion = (key) => document.querySelector(`[data-accion="${key}"]`)

describe('the bolt on a list', () => {
  it('starts a traspaso with its type already picked', async () => {
    setWidth(400)
    const router = await mount('/inventario/entradas')
    // The bolt replaces the sort and select icons in the bar.
    expect(root.querySelector('[aria-label="Ordenar"]')).toBeNull()
    expect(root.querySelector('[aria-label="Seleccionar"]')).toBeNull()
    await openAcciones()
    expect(document.body.textContent).toContain('Entradas y traspasos')
    accion('crear:traspaso').click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe(
      '/inventario/entradas/nuevo?stock_entry_type=Material+Transfer',
    )
  })

  it('sorts from the dropdown and starts selecting from the menu', async () => {
    const router = await mount('/inventario/entradas')
    await openAcciones()
    accion('ordenar').click()
    await settle()
    document.querySelector('[data-accion-option="total_amount desc"]').click()
    await settle()
    expect(router.currentRoute.value.query.orden).toBe('total_amount desc')
    expect(api.docApi).toHaveBeenLastCalledWith(
      'rows',
      expect.objectContaining({ order_by: 'total_amount desc' }),
    )

    await openAcciones()
    accion('seleccionar').click()
    await settle()
    expect(
      root.querySelectorAll('[data-testid="documentos-row-check"]'),
    ).toHaveLength(1)
  })
})
