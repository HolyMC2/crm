// W6 B6 — unit coverage for the pure formatters exported by socialCalendar.js.
// These have no network/reactive deps; we only stub frappe-ui so the module import
// (which pulls createResource/call/toast) resolves under the test runner.
import { describe, it, expect, vi } from 'vitest'

vi.mock('frappe-ui', () => ({
  createResource: vi.fn(),
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  FileUploadHandler: class {},
}))

import {
  chip, chanIcons, chLabel, toDtLocal, fromDtLocal, blankForm,
  pillarChip, statusDot, channelBadges,
} from '@/composables/socialCalendar'

describe('chip', () => {
  it('maps known statuses to their token classes', () => {
    expect(chip('Published')).toBe('bg-surface-green-2 text-ink-green-3')
    expect(chip('Failed')).toBe('bg-surface-red-1 text-ink-red-4')
    expect(chip('Cancelado')).toContain('line-through')
  })
  it('falls back to a neutral gray for an unknown status', () => {
    expect(chip('Nope')).toBe('bg-surface-gray-2 text-ink-gray-6')
  })
})

describe('chanIcons (dict + legacy string tolerance)', () => {
  it('resolves FB/IG emoji from {channel,status} dicts', () => {
    expect(chanIcons([{ channel: 'FB Feed', status: 'Published' }, { channel: 'IG Reel', status: 'Pending' }])).toBe('🟦🟪')
  })
  it('still resolves from bare channel strings', () => {
    expect(chanIcons(['FB Reel'])).toBe('🟦')
    expect(chanIcons(['IG Feed'])).toBe('🟪')
  })
  it('is empty for no channels / unknown families', () => {
    expect(chanIcons([])).toBe('')
    expect(chanIcons(null)).toBe('')
    expect(chanIcons([{ channel: 'TikTok Reel' }])).toBe('')
  })
})

describe('channelBadges', () => {
  it('emits one badge per channel with emoji + status dot, preserving the dict', () => {
    const out = channelBadges([{ channel: 'FB Feed', status: 'Published' }, { channel: 'IG Story', status: 'Failed' }])
    expect(out).toEqual([
      { channel: 'FB Feed', status: 'Published', emoji: '🟦', dot: statusDot('Published') },
      { channel: 'IG Story', status: 'Failed', emoji: '🟪', dot: statusDot('Failed') },
    ])
  })
  it('tolerates a bare string (status empty, generic bullet for unknown family)', () => {
    expect(channelBadges(['IG Reel'])).toEqual([{ channel: 'IG Reel', status: '', emoji: '🟪', dot: statusDot('') }])
    expect(channelBadges([{ channel: 'X Post' }])[0].emoji).toBe('•')
  })
})

describe('statusDot / pillarChip', () => {
  it('status dots carry an explicit dark: pair and a gray fallback', () => {
    expect(statusDot('Published')).toBe('bg-green-500 dark:bg-green-400')
    expect(statusDot('Failed')).toBe('bg-red-500 dark:bg-red-400')
    expect(statusDot('???')).toBe('bg-gray-300 dark:bg-gray-600')
  })
  it('pillarChip maps each post_kind, unclassified → neutral default', () => {
    expect(pillarChip('Producto')).toBe('bg-surface-blue-2 text-ink-blue-3')
    expect(pillarChip('Temporada')).toBe('bg-surface-amber-2 text-ink-amber-3')
    expect(pillarChip('')).toBe('bg-surface-gray-2 text-ink-gray-6')
    expect(pillarChip('Weird')).toBe('bg-surface-gray-2 text-ink-gray-6')
  })
})

describe('chLabel', () => {
  it('picks the platform verb by channel family', () => {
    expect(chLabel('IG Feed')).toBe('Ver en Instagram')
    expect(chLabel('FB Reel')).toBe('Ver en Facebook')
  })
})

describe('toDtLocal / fromDtLocal round-trip', () => {
  it('converts a site datetime to the <input type=datetime-local> form and back', () => {
    expect(toDtLocal('2026-07-15 09:30:00')).toBe('2026-07-15T09:30')
    expect(fromDtLocal('2026-07-15T09:30')).toBe('2026-07-15 09:30:00')
    const src = '2026-07-15 09:30:00'
    expect(fromDtLocal(toDtLocal(src))).toBe(src)
  })
  it('handles empties on both sides', () => {
    expect(toDtLocal('')).toBe('')
    expect(toDtLocal(null)).toBe('')
    expect(fromDtLocal('')).toBe(null)
    expect(fromDtLocal(null)).toBe(null)
  })
})

describe('blankForm', () => {
  it('returns a pristine composer form with the WhatsApp CTA default', () => {
    const f = blankForm()
    expect(Object.keys(f).sort()).toEqual(
      ['captions', 'channelStates', 'channels', 'cta_link', 'cta_type', 'media', 'name', 'scheduled_time', 'shop', 'status', 'title'].sort(),
    )
    expect(f.cta_type).toBe('WhatsApp')
    expect(f.channels).toEqual([])
    expect(f.captions).toEqual({})
    expect(f.media).toEqual([])
    // each call is a fresh object (no shared reference between forms)
    expect(blankForm().channels).not.toBe(f.channels)
  })
})
