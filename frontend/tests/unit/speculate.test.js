// Prefetch of the next full page load (utils/speculate.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset,
  installLinkPrefetch,
  prefetchDocument,
} from '@/utils/speculate'

const rules = () =>
  [...document.head.querySelectorAll('script[type="speculationrules"]')].map(
    (script) => JSON.parse(script.textContent),
  )

describe('speculate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.HTMLScriptElement.supports = (type) =>
      type === 'speculationrules'
  })
  afterEach(() => {
    _reset()
    vi.useRealTimers()
    delete globalThis.HTMLScriptElement.supports
  })

  it('prefetches a same-origin path once, then drops the rule', () => {
    expect(prefetchDocument('/taller/orders/RO-1')).toBe(true)
    expect(prefetchDocument('/taller/orders/RO-1')).toBe(false)
    expect(rules()).toEqual([
      { prefetch: [{ source: 'list', urls: ['/taller/orders/RO-1'] }] },
    ])
    vi.advanceTimersByTime(30000)
    expect(rules()).toEqual([])
    expect(prefetchDocument('/taller/orders/RO-1')).toBe(true)
  })

  it('never prefetches another origin', () => {
    for (const href of ['//evil.invalid/x', 'https://evil.invalid', '/\\evil'])
      expect(prefetchDocument(href)).toBe(false)
    expect(rules()).toEqual([])
  })

  it('caps the pages kept at once', () => {
    for (let i = 0; i < 10; i++) prefetchDocument(`/desk/todo/T-${i}`)
    expect(rules()).toHaveLength(6)
  })

  it('does nothing where the browser has no speculation rules', () => {
    delete globalThis.HTMLScriptElement.supports
    expect(prefetchDocument('/desk')).toBe(false)
    expect(installLinkPrefetch()).toBe(false)
    expect(rules()).toEqual([])
  })

  it('installs the hover rule for marked links once', () => {
    expect(installLinkPrefetch()).toBe(true)
    expect(installLinkPrefetch()).toBe(false)
    expect(rules()).toEqual([
      {
        prefetch: [
          {
            source: 'document',
            where: {
              selector_matches: 'a[data-muelle-prefetch], a[data-sibling]',
            },
            eagerness: 'moderate',
          },
        ],
      },
    ])
  })
})
