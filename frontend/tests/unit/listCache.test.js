import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  createListCache,
  LIST_CACHE_MAX_AGE_MS,
  LIST_CACHE_MAX_CHARS,
  LIST_CACHE_MAX_ENTRIES,
  LIST_CACHE_PREFIX,
  listKey,
  readCachedList,
  writeCachedList,
} from '@/utils/listCache'

const SCOPE = 'muelle.test:ana%40example.test:abc123'

beforeEach(() => {
  // currentScope() reads the page boot's scope and the user cookie.
  window.site_name = 'muelle.test'
  window.shell_scope = 'abc123'
  document.cookie = 'user_id=ana%40example.test'
})
const LIST = listKey('compras', ['por-recibir', ''])
const page = (extra = {}) => ({
  rows: [{ name: 'PUR-ORD-0001' }],
  has_more: false,
  counts: { 'por-recibir': 1 },
  ...extra,
})
const stored = () =>
  Object.keys(localStorage).filter(
    (key) => key.startsWith(LIST_CACHE_PREFIX) && !key.endsWith('index'),
  )

beforeEach(() => {
  localStorage.clear()
})

describe('a shell list keeps its last answer per scope, module and filters', () => {
  it('the saved answer comes back for the same list and scope', () => {
    writeCachedList(LIST, page(), SCOPE)
    expect(readCachedList(LIST, SCOPE)).toMatchObject({
      rows: [{ name: 'PUR-ORD-0001' }],
      counts: { 'por-recibir': 1 },
    })
  })

  it('another filter, user or roles scope does not see it', () => {
    writeCachedList(LIST, page(), SCOPE)
    expect(
      readCachedList(listKey('compras', ['historial', '']), SCOPE),
    ).toBeNull()
    expect(
      readCachedList(LIST, 'muelle.test:otro%40example.test:abc123'),
    ).toBeNull()
    expect(
      readCachedList(LIST, 'muelle.test:ana%40example.test:xyz789'),
    ).toBeNull()
  })

  it('a write under a new roles scope drops the same user’s older copies', () => {
    writeCachedList(LIST, page(), 'muelle.test:ana%40example.test:old111')
    writeCachedList(listKey('gastos', []), page(), SCOPE)
    expect(
      readCachedList(LIST, 'muelle.test:ana%40example.test:old111'),
    ).toBeNull()
    expect(stored()).toHaveLength(1)
  })

  it('past the cap the least recently saved lists go', () => {
    for (let i = 0; i < LIST_CACHE_MAX_ENTRIES + 3; i++)
      writeCachedList(listKey('m', [i]), page(), SCOPE)
    expect(stored()).toHaveLength(LIST_CACHE_MAX_ENTRIES)
    expect(readCachedList(listKey('m', [0]), SCOPE)).toBeNull()
    expect(
      readCachedList(listKey('m', [LIST_CACHE_MAX_ENTRIES + 2]), SCOPE),
    ).not.toBeNull()
  })

  it('a too big answer is not kept, and drops the older copy of that list', () => {
    writeCachedList(LIST, page(), SCOPE)
    writeCachedList(
      LIST,
      page({ rows: [{ name: 'x'.repeat(LIST_CACHE_MAX_CHARS) }] }),
      SCOPE,
    )
    expect(readCachedList(LIST, SCOPE)).toBeNull()
  })

  it('a copy older than the window is not painted', () => {
    writeCachedList(LIST, page(), SCOPE)
    const [key] = stored()
    localStorage.setItem(
      key,
      JSON.stringify({
        at: Date.now() - LIST_CACHE_MAX_AGE_MS - 1,
        answer: page(),
      }),
    )
    expect(readCachedList(LIST, SCOPE)).toBeNull()
  })

  it('a copy saved under an older shape is never painted', () => {
    localStorage.setItem(
      LIST_CACHE_PREFIX + 'v0:' + SCOPE + '|' + LIST,
      JSON.stringify({ at: Date.now(), answer: page() }),
    )
    expect(readCachedList(LIST, SCOPE)).toBeNull()
  })

  it('logout sweeps the saved lists with the other per-user copies', () => {
    const session = readFileSync(
      resolve(__dirname, '../../src/stores/session.js'),
      'utf8',
    )
    expect(session).toContain("k.startsWith('muelle:list:')")
  })
})

describe('a page paints its list’s last answer once, then the read replaces it', () => {
  function page(filters) {
    let current = filters
    const shown = []
    const cache = createListCache('cobranza', () => current)
    return {
      cache,
      shown,
      show: (answer) => shown.push(answer),
      move: (next) => (current = next),
    }
  }

  it('nothing saved: nothing painted, the page waits for its read', () => {
    const p = page(['vencidas'])
    expect(p.cache.paint(p.show)).toBe(false)
    expect(p.shown).toEqual([])
    expect(p.cache.showing()).toBe(false)
  })

  it('a saved answer paints once; a second paint of the same list is a no-op', () => {
    const first = page(['vencidas'])
    first.cache.save(first.cache.key(), { rows: [{ name: 'A' }] })
    const visit = page(['vencidas'])
    expect(visit.cache.paint(visit.show)).toBe(true)
    expect(visit.cache.paint(visit.show)).toBe(true)
    expect(visit.shown).toEqual([{ rows: [{ name: 'A' }] }])
    expect(visit.cache.showing()).toBe(true)
  })

  it('the fresh answer ends the copy, and is what the next visit paints', () => {
    const p = page(['vencidas'])
    p.cache.save(p.cache.key(), { rows: [{ name: 'old' }] })
    p.cache.paint(p.show)
    p.cache.save(p.cache.key(), { rows: [{ name: 'new' }] })
    expect(p.cache.showing()).toBe(false)
    const next = page(['vencidas'])
    next.cache.paint(next.show)
    expect(next.shown).toEqual([{ rows: [{ name: 'new' }] }])
  })

  it('a search is not kept', () => {
    const p = page(null)
    expect(p.cache.key()).toBeNull()
    p.cache.save(p.cache.key(), { rows: [{ name: 'X' }] })
    expect(stored()).toHaveLength(0)
    expect(p.cache.paint(p.show)).toBe(false)
  })

  it('a copy painted for one filter is stale once the filter moves', () => {
    const p = page(['vencidas'])
    p.cache.save(p.cache.key(), { rows: [] })
    p.cache.paint(p.show)
    p.move(['por-vencer'])
    expect(p.cache.stale()).toBe(true)
    expect(p.cache.showing()).toBe(false)
  })
})
