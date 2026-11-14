// Surtido opens on its start (Marco 2026-11-11): the drop for a new list, the
// saved lists and the orders made from them. A row continues it, «⋯» copies it
// to start another order (the cart goes with a list's copy) or deletes it while
// it is a draft; what cannot be done says why. Nothing opens by itself.
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ answers: {}, calls: [] }))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    comprasApi: vi.fn(async (method, args) => {
      const name = method.split('.').pop()
      state.calls.push([name, args])
      const answer = state.answers[name]
      return typeof answer === 'function' ? answer(args) : answer ?? {}
    }),
  }
})

import CompraSurtido from '@/pages/CompraSurtido.vue'
import { loadAssistant } from '@/components/assistant/assistantDoor'
import { saveCart, savedCart } from '@/utils/surtidoShop'

const READ = {
  name: 'cat-nov',
  title: 'Perfeccel noviembre',
  supplier: 'PERFECCEL',
  status: 'Listo',
  page_count: 2,
  lines: 88,
  modified: '2026-11-11 10:00:00',
  orders: [{ name: 'ped-1', status: 'Borrador' }],
  blocks: { delete: null, duplicate: null },
}
const SENT = {
  name: 'cat-oct',
  title: 'Perfeccel octubre',
  supplier: 'PERFECCEL',
  status: 'Listo',
  page_count: 1,
  lines: 40,
  modified: '2026-10-11 10:00:00',
  orders: [{ name: 'ped-0', status: 'Enviado' }],
  blocks: {
    delete:
      'Ya hay un pedido enviado de esta lista (ped-0); se queda para el historial.',
    duplicate: null,
  },
}
const DRAFT = {
  name: 'ped-1',
  supplier: 'PERFECCEL',
  status: 'Borrador',
  ceiling: 41300,
  lines: 12,
  lists: ['cat-nov'],
  modified: '2026-11-11 11:00:00',
  blocks: { delete: null, duplicate: null },
}

let app, root, router
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  localStorage.clear()
  state.calls.length = 0
  state.answers = {
    bootstrap: () => ({
      enabled: true,
      owner: true,
      catalogs: [READ, SENT],
      pedidos: [DRAFT],
    }),
  }
})
// CompraSurtido hands its screen to the assistant through a lazy import: the
// file waits for it, so it never loads after the environment is torn down
afterAll(() => loadAssistant().catch(() => {}))

afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

async function mount(query = '') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/compras', name: 'Compras', component: { render: () => null } },
      ...['CompraNiveles', 'CompraLista'].map((name) => ({
        path: `/${name}/:name?`,
        name,
        component: { render: () => null },
      })),
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
  app = createApp(CompraSurtido)
  app.config.globalProperties.__ = window.__
  app.use(router)
  app.mount(root)
  await settle()
}
const called = (name) => state.calls.filter(([method]) => method === name)
const row = (name) =>
  root.querySelector(
    `[data-inicio-lista="${name}"], [data-inicio-pedido="${name}"]`,
  )
async function more(name) {
  row(name).querySelector('[data-testid="inicio-mas"]').click()
  await settle()
}
const action = (key) => document.querySelector(`[data-inicio-accion="${key}"]`)

describe('Surtido’s start', () => {
  it('opens on the start, never on a list by itself', async () => {
    await mount()
    expect(root.querySelector('[data-testid="surtido-actual"]')).toBeNull()
    expect(root.querySelector('[data-testid="surtido-drop"]')).not.toBeNull()
    const start = root.querySelector('[data-testid="surtido-inicio"]')
    expect(start.textContent).toContain('Perfeccel noviembre')
    expect(start.textContent).toContain('Perfeccel octubre')
    expect(row('ped-1').textContent).toContain('12 products')
    expect(row('ped-1').textContent).not.toContain('ped-1')
    expect(called('catalog_lines')).toHaveLength(0)
  })

  it('a list opens by the address, and «All lists» comes back', async () => {
    await mount()
    row('cat-nov').querySelector('[data-testid="inicio-abrir"]').click()
    await settle()
    expect(router.currentRoute.value.query).toEqual({ catalogo: 'cat-nov' })
    expect(root.querySelector('[data-testid="surtido-actual"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="surtido-inicio"]')).toBeNull()

    root.querySelector('[data-testid="surtido-cambiar"]').click()
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(root.querySelector('[data-testid="surtido-actual"]')).toBeNull()
    expect(root.querySelector('[data-testid="surtido-inicio"]')).not.toBeNull()
  })

  it('a copy of a list carries its cart, product by product', async () => {
    saveCart('cat-nov', { 'line-a': 3, 'line-b': 1 })
    state.answers.duplicate_catalog = {
      catalog: 'cat-copy',
      title: 'Perfeccel noviembre (copia)',
      lines: { 'line-a': 'copy-a', 'line-b': 'copy-b' },
    }
    await mount()
    const boots = called('bootstrap').length
    await more('cat-nov')
    action('duplicar').click()
    await settle()
    expect(called('duplicate_catalog')[0][1]).toEqual({ catalog: 'cat-nov' })
    expect(savedCart('cat-copy')).toEqual({ 'copy-a': 3, 'copy-b': 1 })
    expect(savedCart('cat-nov')).toEqual({ 'line-a': 3, 'line-b': 1 })
    expect(called('bootstrap').length).toBeGreaterThan(boots)
  })

  it('a list an order was sent from says why it stays; a draft one asks first', async () => {
    state.answers.delete_catalog = { deleted: 'cat-nov', orders: ['ped-1'] }
    await mount()
    await more('cat-oct')
    expect(action('eliminar').disabled).toBe(true)
    expect(action('eliminar').textContent).toContain(
      'se queda para el historial',
    )

    await more('cat-nov')
    action('eliminar').click()
    await settle()
    expect(called('delete_catalog')).toHaveLength(0)
    const confirm = document.querySelector('[data-testid="documentos-confirm"]')
    expect(confirm.textContent).toContain('Delete the list')
    confirm.click()
    await settle()
    expect(called('delete_catalog')[0][1]).toEqual({ catalog: 'cat-nov' })
    expect(
      document.querySelector('[data-testid="documentos-confirm"]'),
    ).toBeNull()
  })

  it('a draft order is deleted from its row; an order opens by the address', async () => {
    state.answers.delete_pedido = { deleted: 'ped-1' }
    state.answers.pedido_state = {
      pedido: 'ped-1',
      supplier: 'PERFECCEL',
      status: 'Borrador',
      owner: true,
      ceiling: 41300,
      total: 0,
      quote_revision: 0,
      lines: [],
      pending_rows: [],
      new_items: [],
      missing: [],
    }
    await mount()
    await more('ped-1')
    action('eliminar').click()
    await settle()
    document.querySelector('[data-testid="documentos-confirm"]').click()
    await settle()
    expect(called('delete_pedido')[0][1]).toEqual({ pedido: 'ped-1' })

    row('ped-1').querySelector('[data-testid="inicio-abrir"]').click()
    await settle()
    expect(router.currentRoute.value.query).toEqual({
      paso: 'respuesta',
      pedido: 'ped-1',
    })
    expect(called('pedido_state').at(-1)[1]).toEqual({ name: 'ped-1' })
    // The reply step draws (its label once read a step that no longer exists).
    expect(root.querySelector('section[aria-label="Reply"]')).not.toBeNull()
  })
})
