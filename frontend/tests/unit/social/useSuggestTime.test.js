// W6 B6 — unit coverage for the B2 "Sugerir hora" composable (useSuggestTime).
// Not our file to edit (B2 owns it); we only assert its contract. frappe-ui.call mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: h.call,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { useSuggestTime } from '@/composables/useSuggestTime'

beforeEach(() => {
  h.call.mockReset()
})

describe('useSuggestTime', () => {
  it('defaults fbOnly=true and starts empty/idle', () => {
    const { suggestions, fbOnly, loading } = useSuggestTime()
    expect(fbOnly.value).toBe(true)
    expect(suggestions.value).toEqual([])
    expect(loading.value).toBe(false)
  })

  it('fetch success: calls the planner endpoint, fills suggestions, clears loading', async () => {
    const rows = [{ when: '2026-07-28 19:00:00', score: 0.9, reason: 'buen historial' }]
    h.call.mockResolvedValue({ suggestions: rows, fb_only: false })
    const s = useSuggestTime()
    const ret = await s.fetchSuggestions('Shop A', '2026-07-27 12:00:00')
    expect(h.call).toHaveBeenCalledWith('doco_marketing.api.social_planner.suggest_time', { shop: 'Shop A', after: '2026-07-27 12:00:00' })
    expect(s.suggestions.value).toEqual(rows)
    expect(ret).toEqual(rows)
    expect(s.fbOnly.value).toBe(false) // honored the explicit false
    expect(s.loading.value).toBe(false)
  })

  it('keeps fbOnly=true when the backend omits fb_only', async () => {
    h.call.mockResolvedValue({ suggestions: [] })
    const s = useSuggestTime()
    await s.fetchSuggestions('Shop B')
    expect(s.fbOnly.value).toBe(true)
    expect(s.suggestions.value).toEqual([])
  })

  it('fetch failure: rejects and still clears loading (finally)', async () => {
    h.call.mockRejectedValue(new Error('boom'))
    const s = useSuggestTime()
    await expect(s.fetchSuggestions('Shop C')).rejects.toThrow('boom')
    expect(s.loading.value).toBe(false)
  })
})
