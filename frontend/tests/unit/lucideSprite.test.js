import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureLucideSprite } from '@/utils/lucideSprite'

// Offline (or mid-deploy) the lazy sprite chunk can fail to load. That must
// not surface as an unhandled page error, nor leave the tab without icons.
afterEach(() => document.getElementById('lucide-sprite')?.remove())

describe('lucide sprite loader', () => {
  it('a failed chunk load resolves quietly and the next call retries', async () => {
    const failing = vi.fn(() =>
      Promise.reject(
        new TypeError('Failed to fetch dynamically imported module'),
      ),
    )
    await expect(ensureLucideSprite(failing)).resolves.toBeUndefined()
    const working = vi.fn(async () => ({
      default: '<svg><symbol id="check" /></svg>',
    }))
    await ensureLucideSprite(working)
    expect(working).toHaveBeenCalledTimes(1)
    expect(document.querySelector('#lucide-sprite symbol#check')).not.toBeNull()
    // Already in the document: the module is not fetched again.
    await ensureLucideSprite(working)
    expect(working).toHaveBeenCalledTimes(1)
  })
})
