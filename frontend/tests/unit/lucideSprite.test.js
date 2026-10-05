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
    const install = vi.fn(() => {
      const el = document.createElement('div')
      el.id = 'lucide-sprite'
      document.body.append(el)
    })
    const working = vi.fn(async () => ({ spritePlugin: { install } }))
    await ensureLucideSprite(working)
    expect(working).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledTimes(1)
    expect(document.getElementById('lucide-sprite')).not.toBeNull()
  })
})
