// Pure input guard for the Coaching notes composer (spec 7.4). No Vue/i18n/clock —
// just the empty/oversized submit gate the send button binds :disabled to.
import { describe, it, expect } from 'vitest'
import { canSubmitNote, MAX_NOTE_LEN } from '@/utils/coachingFormat'

describe('canSubmitNote', () => {
  it('accepts a normal note', () => {
    expect(canSubmitNote('aquí ofrece el combo')).toBe(true)
  })

  it('rejects empty / whitespace-only input', () => {
    expect(canSubmitNote('')).toBe(false)
    expect(canSubmitNote('   ')).toBe(false)
    expect(canSubmitNote('\n\t ')).toBe(false)
  })

  it('rejects null / undefined without throwing', () => {
    expect(canSubmitNote(null)).toBe(false)
    expect(canSubmitNote(undefined)).toBe(false)
  })

  it('counts the trimmed length against the cap', () => {
    expect(canSubmitNote('a'.repeat(MAX_NOTE_LEN))).toBe(true)
    expect(canSubmitNote('a'.repeat(MAX_NOTE_LEN + 1))).toBe(false)
    // surrounding whitespace does not count toward the cap
    expect(canSubmitNote('  ' + 'a'.repeat(MAX_NOTE_LEN) + '  ')).toBe(true)
  })
})
