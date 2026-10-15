import { afterEach, describe, expect, it, vi } from 'vitest'
import { recoverChunk, resetChunkRecoveryForTests } from '@/utils/silentUpdate'
import { refused } from '@/composables/muelleShell'

// A chunk that vanished in a deploy: reload the same route when safe, else
// tell the worker why their action did nothing (D5). Never a silent no-op.
afterEach(() => resetChunkRecoveryForTests())

const watcher = (safe) => ({ recoverChunkError: vi.fn(() => safe) })

describe('recoverChunk', () => {
  it('reloads silently on the target route when the swap is safe', () => {
    const w = watcher(true)
    const notify = vi.fn()
    expect(recoverChunk(w, '/crm/deals/D-1', notify)).toBe('reload')
    expect(w.recoverChunkError).toHaveBeenCalledWith('/crm/deals/D-1')
    expect(notify).not.toHaveBeenCalled()
    // the second report of the same failure does not restart anything
    expect(recoverChunk(w, '/crm/deals', notify)).toBe('reload')
    expect(w.recoverChunkError).toHaveBeenCalledTimes(1)
  })

  it('offers «Recargar» on the same route when the swap is blocked', () => {
    const w = watcher(false)
    const notify = vi.fn()
    expect(recoverChunk(w, '/crm/deals?view=mine', notify)).toBe('prompt')
    expect(notify).toHaveBeenCalledWith('/crm/deals?view=mine')
  })

  it('one failure reported twice prompts once, with the first target', () => {
    const w = watcher(false)
    const notify = vi.fn()
    recoverChunk(w, '/crm/deals/D-1', notify)
    recoverChunk(w, '/crm/deals', notify)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(w.recoverChunkError).toHaveBeenCalledTimes(1)
  })
})

describe('shell boot errors', () => {
  it('only a refusal counts as no permission; a deploy blip does not', () => {
    expect(refused({ status: 403 })).toBe(true)
    expect(refused({ exc_type: 'PermissionError' })).toBe(true)
    expect(refused({ status: 502 })).toBe(false)
    expect(refused(new TypeError('Failed to fetch'))).toBe(false)
  })
})
