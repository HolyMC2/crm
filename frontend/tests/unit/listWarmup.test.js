import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  pendientes: vi.fn(),
  compras: vi.fn(),
  comprasBoot: vi.fn(),
}))
vi.mock('@/composables/usePendientes', async (original) => ({
  ...(await original()),
  pendientesApi: api.pendientes,
}))
vi.mock('@/composables/useCompras', async (original) => ({
  ...(await original()),
  comprasApi: api.compras,
  loadComprasBoot: api.comprasBoot,
}))

import { WARMERS, warmLists } from '@/utils/listWarmup'
import { listKey, readCachedList, writeCachedList } from '@/utils/listCache'

const page = (name) => ({ rows: [{ name }], has_more: false })

beforeEach(() => {
  // currentScope() reads the page boot's scope and the user cookie.
  window.site_name = 'muelle.test'
  window.shell_scope = 'abc123'
  document.cookie = 'user_id=ana%40example.test'
  localStorage.clear()
  Object.values(api).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  delete navigator.connection
})

describe('the main lists are warmed once in idle time', () => {
  it('reads each default list and saves it under the key the page reads', async () => {
    api.pendientes.mockResolvedValue(page('TODO-1'))
    api.comprasBoot.mockResolvedValue({ enabled: true })
    api.compras.mockResolvedValue(page('PUR-ORD-1'))
    const warmed = await warmLists(['hoy', 'pendientes', 'compras'])
    expect(warmed).toEqual(['pendientes', 'compras'])
    // Pendientes: segment, source, priority, from, to (pages/Pendientes.vue).
    expect(
      readCachedList(listKey('pendientes', ['mine', 'all', '', '', ''])),
    ).toEqual(page('TODO-1'))
    expect(api.pendientes).toHaveBeenCalledWith(
      'queue',
      expect.objectContaining({ segment: 'mine', start: 0, page_length: 30 }),
    )
    // Compras: usePowerList's filters, [segment, q].
    expect(readCachedList(listKey('compras', ['por-comprar', '']))).toEqual(
      page('PUR-ORD-1'),
    )
  })

  it('skips the list on screen, a fresh copy and a module the worker cannot use', async () => {
    writeCachedList(
      listKey('pendientes', ['mine', 'all', '', '', '']),
      page('x'),
    )
    api.comprasBoot.mockResolvedValue({ enabled: false })
    expect(await warmLists(['pendientes', 'compras'])).toEqual([])
    expect(api.pendientes).not.toHaveBeenCalled()
    expect(api.compras).not.toHaveBeenCalled()

    localStorage.clear()
    api.pendientes.mockResolvedValue(page('TODO-1'))
    expect(await warmLists(['pendientes'], { except: 'pendientes' })).toEqual(
      [],
    )
    expect(api.pendientes).not.toHaveBeenCalled()
  })

  it('data saver or a 2g line warms nothing', async () => {
    navigator.connection = { saveData: true }
    expect(await warmLists(['pendientes'])).toEqual([])
    navigator.connection = { effectiveType: '2g' }
    expect(await warmLists(['pendientes'])).toEqual([])
    expect(api.pendientes).not.toHaveBeenCalled()
  })

  it('a failure is ignored; the next module still warms', async () => {
    const warmers = {
      a: async () => ({
        list: 'a:[]',
        read: () => Promise.reject(new Error('x')),
      }),
      b: async () => ({ list: 'b:[]', read: () => Promise.resolve(page('B')) }),
    }
    expect(await warmLists(['a', 'b'], { warmers })).toEqual(['b'])
    expect(readCachedList('b:[]')).toEqual(page('B'))
  })

  it('a user switch while reading saves nothing', async () => {
    const warmers = {
      a: async () => ({
        list: 'a:[]',
        read: async () => {
          document.cookie = 'user_id=beto%40example.test'
          return page('A')
        },
      }),
    }
    expect(await warmLists(['a'], { warmers })).toEqual([])
    document.cookie = 'user_id=ana%40example.test'
    expect(readCachedList('a:[]')).toBeNull()
  })

  it('every warmer names a shell module', () => {
    expect(Object.keys(WARMERS).sort()).toEqual([
      'compras',
      'pendientes',
      'productos',
    ])
  })
})
