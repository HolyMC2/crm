import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  HOY_CACHE_MAX_AGE_MS,
  HOY_CACHE_PREFIX,
  readCachedHoy,
  writeCachedHoy,
} from '@/utils/hoyCache'

const SCOPE = 'muelle.test:ana%40example.test:abc123'
const answer = (extra = {}) => ({
  user: 'ana@example.test',
  continuar: { available: true },
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
})

describe('Hoy keeps its last answer per site, user and roles scope', () => {
  it('the saved answer comes back for the same scope', () => {
    writeCachedHoy(SCOPE, answer({ full_name: 'Ana' }))
    expect(readCachedHoy(SCOPE)).toMatchObject({ full_name: 'Ana' })
  })

  it('another user, or the same user after a roles change, does not see it', () => {
    writeCachedHoy(SCOPE, answer())
    expect(readCachedHoy('muelle.test:otro%40example.test:abc123')).toBeNull()
    expect(readCachedHoy('muelle.test:ana%40example.test:xyz789')).toBeNull()
  })

  it('a write under a new roles scope drops the same user’s older copies', () => {
    writeCachedHoy('muelle.test:ana%40example.test:old111', answer())
    writeCachedHoy(SCOPE, answer())
    expect(readCachedHoy('muelle.test:ana%40example.test:old111')).toBeNull()
    expect(localStorage.length).toBe(1)
  })

  it('a copy older than the window is not painted', () => {
    writeCachedHoy(SCOPE, answer())
    const key = localStorage.key(0)
    localStorage.setItem(
      key,
      JSON.stringify({
        at: Date.now() - HOY_CACHE_MAX_AGE_MS - 1,
        answer: answer(),
      }),
    )
    expect(readCachedHoy(SCOPE)).toBeNull()
  })

  it('a copy saved under an older answer shape is never painted', () => {
    localStorage.setItem(
      HOY_CACHE_PREFIX + 'v0:' + SCOPE,
      JSON.stringify({ at: Date.now(), answer: answer() }),
    )
    expect(readCachedHoy(SCOPE)).toBeNull()
  })

  it('unreadable storage reads as no copy, and a write that fails is silent', () => {
    localStorage.setItem(HOY_CACHE_PREFIX + 'v1:' + SCOPE, '{not json')
    expect(readCachedHoy(SCOPE)).toBeNull()
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      expect(() => writeCachedHoy(SCOPE, answer())).not.toThrow()
    } finally {
      Storage.prototype.setItem = setItem
    }
  })

  it('sign-out sweeps the saved Hoy answer with the other per-user shell keys', () => {
    const session = readFileSync(
      resolve(__dirname, '../../src/stores/session.js'),
      'utf8',
    )
    expect(session).toContain("k.startsWith('muelle:hoy:')")
  })

  it('the page paints the saved answer before its read, and saves each answer', () => {
    const page = readFileSync(
      resolve(__dirname, '../../src/pages/Hoy.vue'),
      'utf8',
    )
    expect(page).toContain('readCachedHoy(currentScope())')
    expect(page).toContain('writeCachedHoy(currentScope(), answer)')
  })
})
