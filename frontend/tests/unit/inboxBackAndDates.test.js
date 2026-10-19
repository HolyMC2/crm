import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatDateTime } from '@/utils'
import { mobileBackOr } from '@/utils/historyBack'

describe('thread timestamps are es-MX', () => {
  it('formats a Frappe timestamp without English month or am/pm', () => {
    const out = formatDateTime('2026-10-15 10:32:30.534991')
    expect(out).not.toMatch(/Oct|am|pm/)
    expect(out).toMatch(/15/)
    expect(out).toMatch(/oct/i)
  })

  it('is empty for a missing value', () => {
    expect(formatDateTime(null)).toBe('')
  })
})

describe('mobileBackOr', () => {
  afterEach(() => vi.restoreAllMocks())

  it('pops history when vue-router left a back entry', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({
      back: '/crm/inbox',
    })
    const fallback = vi.fn()
    mobileBackOr(fallback)
    expect(back).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses the fallback on a deep link with no history entry', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    vi.spyOn(window.history, 'state', 'get').mockReturnValue(null)
    const fallback = vi.fn()
    mobileBackOr(fallback)
    expect(back).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
