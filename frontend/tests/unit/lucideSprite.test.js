// Icons draw from one sprite element. The subset the source names comes first;
// the whole sprite replaces it once for a name outside it or for a picker.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SUBSET = '<svg><defs><symbol id="inbox" /></defs></svg>'
const FULL =
  '<svg><defs><symbol id="inbox" /><symbol id="rocket" /></defs></svg>'

const loaders = ({ subset = SUBSET, full = FULL } = {}) => ({
  subset: vi.fn(async () => ({ default: subset })),
  full: vi.fn(async () => ({ default: full })),
})
const symbols = () =>
  [...document.querySelectorAll('#lucide-sprite symbol')].map((s) => s.id)

let ensureLucideSprite

beforeEach(async () => {
  // The loader remembers what it fetched: a fresh module per case.
  vi.resetModules()
  ;({ ensureLucideSprite } = await import('@/utils/lucideSprite'))
})
afterEach(() => document.getElementById('lucide-sprite')?.remove())

describe('lucide sprite loader', () => {
  it('a name the subset carries loads the subset only, once', async () => {
    const load = loaders()
    await ensureLucideSprite('inbox', load)
    expect(load.subset).toHaveBeenCalledTimes(1)
    expect(load.full).not.toHaveBeenCalled()
    expect(symbols()).toEqual(['inbox'])
    await ensureLucideSprite('inbox', load)
    expect(load.subset).toHaveBeenCalledTimes(1)
  })

  it('a name outside the subset brings the whole sprite in its place', async () => {
    const load = loaders()
    await ensureLucideSprite('rocket', load)
    expect(load.subset).toHaveBeenCalledTimes(1)
    expect(load.full).toHaveBeenCalledTimes(1)
    expect(symbols()).toEqual(['inbox', 'rocket'])
    // Complete: no name asks for anything more.
    await ensureLucideSprite('ship', load)
    await ensureLucideSprite(undefined, load)
    expect(load.full).toHaveBeenCalledTimes(1)
    expect(load.subset).toHaveBeenCalledTimes(1)
  })

  it('no name asks for the whole sprite: the picker, the desktop warm-up', async () => {
    const load = loaders()
    await ensureLucideSprite(undefined, load)
    expect(load.subset).not.toHaveBeenCalled()
    expect(load.full).toHaveBeenCalledTimes(1)
    expect(symbols()).toEqual(['inbox', 'rocket'])
  })

  it('a name no sprite can draw fetches nothing', async () => {
    const load = loaders()
    await ensureLucideSprite('Hola mundo', load)
    expect(load.subset).not.toHaveBeenCalled()
    expect(load.full).not.toHaveBeenCalled()
  })

  // Offline (or mid-deploy) the lazy sprite chunk can fail to load. That must
  // not surface as an unhandled page error, nor leave the tab without icons.
  it('a failed chunk load resolves quietly and the next call retries', async () => {
    const failing = loaders()
    failing.full = vi.fn(() =>
      Promise.reject(
        new TypeError('Failed to fetch dynamically imported module'),
      ),
    )
    await expect(
      ensureLucideSprite(undefined, failing),
    ).resolves.toBeUndefined()
    const working = loaders()
    await ensureLucideSprite(undefined, working)
    expect(working.full).toHaveBeenCalledTimes(1)
    expect(symbols()).toContain('inbox')
    // Already in the document: the module is not fetched again.
    await ensureLucideSprite(undefined, working)
    expect(working.full).toHaveBeenCalledTimes(1)
  })
})
