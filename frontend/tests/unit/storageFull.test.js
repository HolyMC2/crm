// A full site storage (the browser's ~5 MB) never leaves an older copy to be
// painted later: Hoy and the lists make room from the oldest saved lists, and a
// copy that still does not fit forgets the older one.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { readCachedHoy, writeCachedHoy } from '@/utils/hoyCache'
import { readCachedList, writeCachedList } from '@/utils/listCache'

// The site's storage holds `room` characters; setItem throws past it. Installed
// before the file touches localStorage: happy-dom keeps the method it first saw.
let room = Infinity
const used = (except) => {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key !== except)
      total += key.length + String(localStorage.getItem(key)).length
  }
  return total
}
const real = Storage.prototype.setItem
const limit = vi
  .spyOn(Storage.prototype, 'setItem')
  .mockImplementation(function (key, value) {
    if (used(key) + key.length + String(value).length > room)
      throw new DOMException('full', 'QuotaExceededError')
    return real.call(this, key, value)
  })
afterAll(() => limit.mockRestore())

const SCOPE = 'muelle.test:ana%40example.test:abc123'
const answer = (extra = {}) => ({ user: 'ana@example.test', ...extra })

beforeEach(() => {
  room = Infinity
  window.site_name = 'muelle.test'
  window.shell_scope = 'abc123'
  document.cookie = 'user_id=ana%40example.test'
  localStorage.clear()
})

describe('Hoy on a full storage', () => {
  it('saved lists make room, the oldest first', () => {
    writeCachedList('a', { rows: ['x'.repeat(3000)] })
    writeCachedList('b', { rows: ['y'.repeat(3000)] })
    room = used() + 100 // a Hoy answer needs more than that
    writeCachedHoy(SCOPE, answer({ ventas: { available: true, value: 3180 } }))
    expect(readCachedHoy(SCOPE).ventas.value).toBe(3180)
    expect(readCachedList('a')).toBeNull()
    expect(readCachedList('b')).not.toBeNull()
  })

  it('when the answer never fits, the older copy goes instead of staying', () => {
    writeCachedHoy(SCOPE, answer({ ventas: { available: true, value: 1880 } }))
    room = 300
    writeCachedHoy(
      SCOPE,
      answer({
        ventas: { available: true, value: 3180 },
        big: 'z'.repeat(1000),
      }),
    )
    expect(readCachedHoy(SCOPE)).toBeNull()
  })
})

describe('a list on a full storage', () => {
  it('older lists make room for the one just read', () => {
    writeCachedList('a', { rows: ['x'.repeat(3000)] })
    writeCachedList('b', { rows: ['y'.repeat(3000)] })
    room = used() + 1000
    writeCachedList('c', { rows: ['w'.repeat(2000)] })
    expect(readCachedList('c')).not.toBeNull()
    expect(readCachedList('a')).toBeNull()
  })

  it('a list that never fits forgets its older copy', () => {
    writeCachedList('a', { rows: ['old'] })
    room = used() + 50
    writeCachedList('a', { rows: ['n'.repeat(5000)] })
    expect(readCachedList('a')).toBeNull()
  })
})
