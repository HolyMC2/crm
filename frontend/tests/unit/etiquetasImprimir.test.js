// Etiquetas › printing from the browser: the hidden frame that holds the
// labels must outlive the browser's own print window, because Chromium's
// «Print using system dialog» opens the system dialog for that frame after
// its preview has already closed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { printHtml } from '@/composables/useEtiquetas'

function fakeDocument() {
  const frames = []
  const makeFrame = () => {
    const attributes = new Map()
    const listeners = {}
    const printWindow = {
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: (type, fn) => {
        listeners[`win:${type}`] = fn
      },
    }
    const frame = {
      style: {},
      srcdoc: '',
      contentWindow: printWindow,
      removed: false,
      setAttribute: (name, value) => attributes.set(name, value),
      hasAttribute: (name) => attributes.has(name),
      addEventListener: (type, fn) => {
        listeners[type] = fn
      },
      remove: () => {
        frame.removed = true
        frames.splice(frames.indexOf(frame), 1)
      },
      fire: (type) => listeners[type]?.(),
      fireAfterprint: () => listeners['win:afterprint']?.(),
    }
    return frame
  }
  return {
    frames,
    body: {
      appendChild: (frame) => {
        frames.push(frame)
        queueMicrotask(() => frame.fire('load'))
      },
    },
    createElement: () => makeFrame(),
    querySelectorAll: (selector) => {
      const name = /\[([^\]]+)\]/.exec(selector)?.[1]
      return frames.filter((frame) => frame.hasAttribute(name))
    },
  }
}

describe('Etiquetas › printing from the browser', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the labels frame after the print window closes, so a system dialog opened from it stays open', async () => {
    const doc = fakeDocument()
    const printing = printHtml('<html>labels</html>', { doc })
    await vi.advanceTimersByTimeAsync(0)
    const [frame] = doc.frames
    expect(frame.contentWindow.print).toHaveBeenCalledTimes(1)

    frame.fireAfterprint()
    await expect(printing).resolves.toEqual({ ok: true })
    await vi.advanceTimersByTimeAsync(60_000)

    expect(frame.removed).toBe(false)
    expect(doc.frames).toEqual([frame])
  })

  it('the next print removes the previous frame, so frames never pile up', async () => {
    const doc = fakeDocument()
    const first = printHtml('<html>first</html>', { doc })
    await vi.advanceTimersByTimeAsync(0)
    await first
    const [old] = doc.frames

    const second = printHtml('<html>second</html>', { doc })
    await vi.advanceTimersByTimeAsync(0)
    await second

    expect(old.removed).toBe(true)
    expect(doc.frames).toHaveLength(1)
    expect(doc.frames[0].srcdoc).toContain('second')
  })
})
