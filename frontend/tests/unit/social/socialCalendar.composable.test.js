// W6 B6 — unit coverage for useSocialCalendar()'s computed logic + drag flow.
// frappe-ui is mocked: createResource returns a *reactive* stub so the composable's
// computeds recompute when a test sets `.data`; call/toast are hoisted spies. No network.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

const h = vi.hoisted(() => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  resources: [],
}))

vi.mock('frappe-ui', async () => {
  const { reactive } = await import('vue')
  return {
    createResource: (opts) => {
      const r = reactive({ data: null, loading: false, reload: vi.fn(), fetch: vi.fn(), _opts: opts })
      h.resources.push(r)
      return r
    },
    call: h.call,
    toast: h.toast,
    FileUploadHandler: class {},
  }
})

import { useSocialCalendar } from '@/composables/socialCalendar'

// Fresh instance + handles to the internally-created resources (found by url fragment).
function setup() {
  h.resources.length = 0
  const sc = useSocialCalendar()
  const byUrl = (frag) => h.resources.find((r) => (r._opts?.url || '').includes(frag))
  return { sc, cal: byUrl('get_calendar'), seasons: byUrl('get_seasons') }
}

const names = (byDay) => Object.values(byDay).flat().map((p) => p.name)

beforeEach(() => {
  h.call.mockReset()
  h.toast.success.mockReset()
  h.toast.error.mockReset()
  h.toast.info.mockReset()
  localStorage.clear()
})

describe('postsByDay', () => {
  it('buckets scheduled posts by their stored date string (tz-naive)', () => {
    const { sc, cal } = setup()
    cal.data = {
      scheduled: [
        { name: 'A', scheduled_time: '2026-07-15 10:00:00', post_kind: 'Producto', status: 'Scheduled', channels: [] },
        { name: 'B', scheduled_time: '2026-07-15 14:00:00', post_kind: 'Servicio', status: 'Scheduled', channels: [] },
        { name: 'C', scheduled_time: '2026-07-16 09:00:00', post_kind: 'Producto', status: 'Published', channels: [] },
      ],
      drafts: [],
    }
    const pbd = sc.postsByDay.value
    expect(pbd['2026-07-15'].map((p) => p.name)).toEqual(['A', 'B'])
    expect(pbd['2026-07-16'].map((p) => p.name)).toEqual(['C'])
  })
})

describe('filters + counts', () => {
  function seeded() {
    const s = setup()
    s.cal.data = {
      scheduled: [
        { name: 'A', scheduled_time: '2026-07-15 10:00:00', post_kind: 'Producto', status: 'Scheduled', channels: [{ channel: 'FB Feed', status: 'Scheduled' }] },
        { name: 'C', scheduled_time: '2026-07-16 09:00:00', post_kind: 'Producto', status: 'Published', channels: [{ channel: 'IG Feed', status: 'Published' }] },
        { name: 'D', scheduled_time: '2026-07-17 09:00:00', post_kind: 'Servicio', status: 'Scheduled', channels: [{ channel: 'FB Reel', status: 'Scheduled' }, { channel: 'IG Reel', status: 'Pending' }] },
      ],
      drafts: [{ name: 'E', post_kind: 'Producto', status: 'Draft', channels: [] }],
    }
    return s
  }

  it('counts over the whole window (scheduled + drafts), family = has ≥1 channel', () => {
    const { sc } = seeded()
    const c = sc.filterCounts.value
    expect(c.kinds).toEqual({ Producto: 3, Servicio: 1 })
    expect(c.statuses).toEqual({ Scheduled: 2, Published: 1, Draft: 1 })
    expect(c.families).toEqual({ FB: 2, IG: 2 })
  })

  it('pillar filter narrows scheduled + drafts', () => {
    const { sc } = seeded()
    sc.toggleFilter('kind', 'Servicio')
    expect(names(sc.postsByDay.value)).toEqual(['D'])
    expect(sc.visibleDrafts.value).toEqual([]) // E is Producto → filtered out
  })

  it('status filter is OR within the facet', () => {
    const { sc } = seeded()
    sc.toggleFilter('status', 'Published')
    expect(names(sc.postsByDay.value)).toEqual(['C'])
  })

  it('family filter matches any channel in the family', () => {
    const { sc } = seeded()
    sc.toggleFilter('family', 'IG')
    expect(names(sc.postsByDay.value).sort()).toEqual(['C', 'D'])
  })

  it('facets combine with AND (Producto AND FB → only A)', () => {
    const { sc } = seeded()
    sc.toggleFilter('kind', 'Producto')
    sc.toggleFilter('family', 'FB')
    expect(names(sc.postsByDay.value)).toEqual(['A'])
    expect(sc.activeFilterCount.value).toBe(2)
    sc.clearFilters()
    expect(sc.activeFilterCount.value).toBe(0)
    expect(names(sc.postsByDay.value).sort()).toEqual(['A', 'C', 'D'])
  })
})

describe('seasonByDay (map + clip)', () => {
  it('marks in-range days with isStart on the span start, and clips a pre-range start', () => {
    const { sc, seasons } = setup()
    sc.cursor.value = new Date(2020, 0, 1) // Jan 2020 — no day is "today"
    seasons.data = [
      { name: 'InRange', label: '🎉 InRange', emoji: '🎉', start: '2020-01-10', end: '2020-01-12' },
      { name: 'ClipStart', label: '🎄 ClipStart', emoji: '🎄', start: '2019-12-01', end: '2020-01-02' },
    ]
    const sbd = sc.seasonByDay.value
    expect(sbd['2020-01-10'].find((s) => s.name === 'InRange').isStart).toBe(true)
    expect(sbd['2020-01-11'].find((s) => s.name === 'InRange').isStart).toBe(false)
    expect(sbd['2020-01-12'].some((s) => s.name === 'InRange')).toBe(true)
    expect(sbd['2020-01-13']?.some((s) => s.name === 'InRange')).toBeFalsy()
    // start (2019-12-01) is before the grid → any covered in-grid day is isStart=false
    expect(sbd['2020-01-01'].find((s) => s.name === 'ClipStart').isStart).toBe(false)
  })
})

describe('agendaDays', () => {
  it('lists only in-range days that have posts', () => {
    const { sc, cal } = setup()
    sc.cursor.value = new Date(2020, 0, 1)
    cal.data = { scheduled: [{ name: 'A', scheduled_time: '2020-01-15 10:00:00', status: 'Scheduled', channels: [] }], drafts: [] }
    const ad = sc.agendaDays.value
    const keys = ad.map((d) => d.key)
    expect(keys).toContain('2020-01-15')
    expect(keys).not.toContain('2020-01-16')
    expect(ad.find((d) => d.key === '2020-01-15').label).toBeTruthy()
  })
})

describe('view persistence', () => {
  it('writes calView to localStorage and a fresh instance re-reads it', async () => {
    const { sc } = setup()
    expect(sc.calView.value).toBe('month') // default when storage empty
    sc.calView.value = 'week'
    await nextTick()
    expect(localStorage.getItem('social:calView')).toBe('week')
    const sc2 = useSocialCalendar()
    expect(sc2.calView.value).toBe('week')
  })
})

describe('reschedulePost', () => {
  it('success: calls reschedule (time preserved), moves optimistically, toasts + reloads', async () => {
    const { sc, cal } = setup()
    h.call.mockResolvedValue({})
    const post = { name: 'SP-1', scheduled_time: '2030-07-10 09:30:00' }
    await sc.reschedulePost(post, '2030-07-15')
    expect(h.call).toHaveBeenCalledWith('doco_marketing.api.social.reschedule', { name: 'SP-1', scheduled_time: '2030-07-15 09:30:00' })
    expect(post.scheduled_time).toBe('2030-07-15 09:30:00')
    expect(h.toast.success).toHaveBeenCalled()
    expect(cal.reload).toHaveBeenCalled()
  })

  it('defaults the slot time to 10:00 when the post had none', async () => {
    const { sc } = setup()
    h.call.mockResolvedValue({})
    const post = { name: 'SP-3', scheduled_time: '' }
    await sc.reschedulePost(post, '2030-07-15')
    expect(h.call).toHaveBeenCalledWith('doco_marketing.api.social.reschedule', { name: 'SP-3', scheduled_time: '2030-07-15 10:00:00' })
  })

  it('guard throw: reverts the optimistic move and surfaces the es-MX message', async () => {
    const { sc } = setup()
    h.call.mockRejectedValue({ messages: ['Esta publicación ya fue entregada a Meta y no se puede reprogramar aquí.'] })
    const post = { name: 'SP-2', scheduled_time: '2030-07-10 09:30:00' }
    await sc.reschedulePost(post, '2030-07-20')
    expect(post.scheduled_time).toBe('2030-07-10 09:30:00') // reverted
    expect(h.toast.error).toHaveBeenCalledWith('Esta publicación ya fue entregada a Meta y no se puede reprogramar aquí.')
    expect(h.toast.success).not.toHaveBeenCalled()
  })

  it('past days are not droppable — no API call, no move', async () => {
    const { sc } = setup()
    const post = { name: 'SP-4', scheduled_time: '2030-07-10 09:30:00' }
    await sc.reschedulePost(post, '2000-01-01')
    expect(h.call).not.toHaveBeenCalled()
    expect(post.scheduled_time).toBe('2030-07-10 09:30:00')
  })
})
