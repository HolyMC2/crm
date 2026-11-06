// The page key a frame gives a routed page: path for stableKey pages, the
// split key when a page declares one, the full path otherwise.
import { describe, expect, it } from 'vitest'
import { routeKey } from '@/utils/routeKey'

const route = (path, query = {}, meta = {}) => ({
  path,
  fullPath: Object.keys(query).length
    ? `${path}?${new URLSearchParams(query)}`
    : path,
  query,
  meta,
})

describe('routeKey', () => {
  it('keeps a stableKey page on its path when only the query changes', () => {
    const a = routeKey(route('/ventas/deal/A', {}, { stableKey: true }))
    const b = routeKey(
      route('/ventas/deal/A', { tab: 'overview' }, { stableKey: true }),
    )
    expect(a).toBe('/ventas/deal/A')
    expect(b).toBe(a)
    expect(routeKey(route('/ventas/deal/B', {}, { stableKey: true }))).not.toBe(
      a,
    )
  })
  it('remounts other pages on their full path', () => {
    expect(routeKey(route('/deals', { view: 'kanban' }))).toBe(
      '/deals?view=kanban',
    )
    expect(routeKey(route('/deals', { view: 'kanban' }))).not.toBe(
      routeKey(route('/deals')),
    )
  })
  it('lets a split page name its own key', () => {
    const meta = { splitKey: (r) => `split:${r.path.split('/')[1]}` }
    expect(routeKey(route('/documentos/facturas/F-1', {}, meta))).toBe(
      'split:documentos',
    )
  })
})
