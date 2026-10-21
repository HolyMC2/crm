// The arrow's second case: a page opened from another page of this origin goes back to that page.
import { describe, expect, it } from 'vitest'
import { canReturnToReferrer } from '@/utils/historyBack'

const HERE = { origin: 'https://muelle.test', historyLength: 3 }
const from = (referrer, extra) =>
  canReturnToReferrer({ ...HERE, referrer, ...extra })

describe('canReturnToReferrer', () => {
  it('goes back to the page of this origin that opened this one', () => {
    expect(from('https://muelle.test/desk')).toBe(true)
  })
  it('has no referrer for a typed address or a bookmark', () => {
    expect(from('')).toBe(false)
  })
  it('does not go back in a window with one entry (opened from a page)', () => {
    expect(from('https://muelle.test/desk', { historyLength: 1 })).toBe(false)
  })
  it('does not go back to another site', () => {
    expect(from('https://mail.example.com/inbox')).toBe(false)
  })
  it('does not go back to the sign-in step', () => {
    expect(from('https://muelle.test/login?redirect-to=/crm/impresion')).toBe(
      false,
    )
  })
})
