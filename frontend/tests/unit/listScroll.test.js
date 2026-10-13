import { describe, expect, it, vi } from 'vitest'
import {
  captureScroll,
  readScroll,
  scrollTarget,
  settleScroll,
  writeScroll,
} from '@/utils/listScroll'

// A scroller the way the browser treats it: scrollTop is clamped to
// scrollHeight - clientHeight, and rows sit at fixed offsets in the content.
function fakeScroller({
  height = 400,
  content = 400,
  top = 0,
  rows = [],
} = {}) {
  const listeners = {}
  const el = {
    clientHeight: height,
    scrollHeight: content,
    _top: top,
    boxTop: 100,
    rows: rows.map(([key, offset, rowHeight = 56]) => ({
      key,
      offset,
      rowHeight,
    })),
    get scrollTop() {
      return this._top
    },
    set scrollTop(value) {
      const max = Math.max(0, this.scrollHeight - this.clientHeight)
      this._top = Math.min(Math.max(0, value), max)
    },
    // what the browser does to scrollTop when the box resizes
    reclamp() {
      this.scrollTop = this._top
    },
    getBoundingClientRect() {
      return { top: this.boxTop, bottom: this.boxTop + this.clientHeight }
    },
    querySelectorAll() {
      return this.rows.map((row) => ({
        getAttribute: (name) => (name === 'data-scroll-key' ? row.key : null),
        getBoundingClientRect: () => ({
          top: el.boxTop + row.offset - el._top,
          bottom: el.boxTop + row.offset + row.rowHeight - el._top,
        }),
      }))
    },
    addEventListener(type, fn) {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn)
    },
    fire(type) {
      for (const fn of [...(listeners[type] || [])]) fn()
    },
    listeners,
  }
  return el
}

// Animation frames driven by the test; `now` advances 16 ms per frame.
function frames() {
  let queue = []
  let clock = 0
  return {
    raf: (fn) => (queue.push(fn), queue.length),
    caf: () => (queue = []),
    now: () => clock,
    step(times = 1) {
      for (let i = 0; i < times; i++) {
        clock += 16
        const run = queue
        queue = []
        run.forEach((fn) => fn())
      }
    },
    pending: () => queue.length,
  }
}

describe('list scroll memory', () => {
  it('remembers the first visible row and how far it is scrolled past', () => {
    const el = fakeScroller({
      content: 1000,
      top: 120,
      rows: [
        ['ToDoa', 0],
        ['ToDob', 56],
        ['ToDoc', 112],
        ['ToDod', 168],
      ],
    })
    expect(captureScroll(el)).toEqual({ top: 120, key: 'ToDoc', offset: -8 })
  })

  it('puts the remembered row back at the same place, else the raw position', () => {
    const el = fakeScroller({
      content: 1000,
      rows: [
        ['ToDoa', 0],
        ['ToDob', 56],
        // a row above it was completed elsewhere: ToDoc moved up 56 px
        ['ToDoc', 56 + 56],
      ],
    })
    expect(scrollTarget(el, { top: 176, key: 'ToDoc', offset: -8 })).toBe(120)
    expect(scrollTarget(el, { top: 176, key: 'gone', offset: 0 })).toBe(176)
    expect(scrollTarget(el, null)).toBe(0)
  })

  it('reads the old plain-number entries and survives blocked storage', () => {
    const store = new Map([['k', '98']])
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    }
    expect(readScroll(storage, 'k')).toEqual({ top: 98, key: null, offset: 0 })
    writeScroll(storage, 'k', { top: 120, key: 'ToDoc', offset: -8 })
    expect(readScroll(storage, 'k')).toEqual({
      top: 120,
      key: 'ToDoc',
      offset: -8,
    })
    expect(readScroll(storage, 'missing')).toBe(null)
    const blocked = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readScroll(blocked, 'k')).toBe(null)
    expect(() => writeScroll(blocked, 'k', { top: 1 })).not.toThrow()
  })
})

describe('settleScroll', () => {
  it('waits for the rows to render instead of landing short (P1)', () => {
    // Back from a record: the list was at 120/120. Right after the data
    // arrives the rows are not laid out yet, so a one-shot restore clamps.
    const el = fakeScroller({ height: 447, content: 447 })
    const f = frames()
    settleScroll(el, () => 120, f)
    expect(el.scrollTop).toBe(0) // clamped: nothing to scroll yet
    el.scrollHeight = 545 // sections rendered, 22 px short of the end
    f.step()
    expect(el.scrollTop).toBe(98)
    el.scrollHeight = 567 // last section grows
    f.step()
    expect(el.scrollTop).toBe(120)
    f.step(30)
    expect(el.scrollTop).toBe(120)
    expect(f.pending()).toBe(0) // settled and stopped
  })

  it('keeps the position while the phone header slides away', () => {
    const el = fakeScroller({ height: 399, content: 567 })
    const f = frames()
    settleScroll(el, () => 120, f)
    expect(el.scrollTop).toBe(120)
    // the header hides over a few frames: the list grows by 48 px
    for (const height of [415, 431, 447]) {
      el.clientHeight = height
      el.reclamp()
      f.step()
    }
    f.step(30)
    expect(el.scrollTop).toBe(120)
    expect(f.pending()).toBe(0)
  })

  it('stops as soon as the worker scrolls or taps', () => {
    const el = fakeScroller({ height: 447, content: 447 })
    const f = frames()
    const done = vi.fn()
    settleScroll(el, () => 300, { ...f, onDone: done })
    el.fire('touchstart')
    el.scrollHeight = 1200
    f.step(5)
    expect(el.scrollTop).toBe(0)
    expect(done).toHaveBeenCalledOnce()
    expect(Object.values(el.listeners).flat()).toHaveLength(0)
  })

  it('gives up on a position the list can no longer reach', () => {
    const el = fakeScroller({ height: 447, content: 500 })
    const f = frames()
    const done = vi.fn()
    settleScroll(el, () => 400, { ...f, onDone: done })
    f.step(200)
    expect(el.scrollTop).toBe(53)
    expect(done).toHaveBeenCalledOnce()
    expect(f.pending()).toBe(0)
  })

  it('can be cancelled by the caller', () => {
    const el = fakeScroller({ height: 447, content: 447 })
    const f = frames()
    const stop = settleScroll(el, () => 120, f)
    stop()
    el.scrollHeight = 1000
    f.step(3)
    expect(el.scrollTop).toBe(0)
  })
})
