// composables/useReorder.js on a phone: a finger on a row's grip drags at
// once (Personalizar, the sections sheet), the rest of the row still needs a
// hold so a swipe scrolls, and a finger held near the scroller's edge scrolls
// it, only toward where the finger went.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import {
  LONG_PRESS,
  edgeStep,
  scrollerOf,
  useReorder,
} from '@/composables/useReorder'

const ROW = 48
const GAP = 4
const KEYS = ['a', 'b', 'c', 'd']

let app, host, drops, frames
// happy-dom lays nothing out: each row reports its slot in a 4 px-gap list.
function layOut() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function () {
      const key = this.dataset?.reorderKey
      const index = KEYS.indexOf(key)
      const top = index >= 0 ? 100 + index * (ROW + GAP) : 0
      const height = index >= 0 ? ROW : 400
      return { top, bottom: top + height, height, left: 0, right: 300 }
    },
  )
}

function mount() {
  drops = []
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      const scroller = ref(null)
      useReorder(scroller, { onDrop: (drop) => drops.push(drop) })
      return () =>
        h('div', { ref: scroller }, [
          h(
            'ul',
            { 'data-reorder-list': 'more' },
            KEYS.map((key) =>
              h('li', { key, 'data-reorder-key': key }, [
                h('button', { 'data-drag-handle': '', id: `grip-${key}` }),
                h('span', { id: `name-${key}` }, key),
              ]),
            ),
          ),
        ])
    },
  })
  app.mount(host)
}

function touch(type, target, y) {
  const point = { identifier: 1, target, clientX: 20, clientY: y }
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [point],
    changedTouches: [point],
  })
  target.dispatchEvent(event)
}

beforeEach(() => {
  vi.useFakeTimers()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  layOut()
  mount()
})
afterEach(() => {
  app.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useReorder on touch', () => {
  it('drags from the grip without a hold', async () => {
    await nextTick()
    const grip = document.getElementById('grip-a')
    touch('touchstart', grip, 124)
    touch('touchmove', grip, 180)
    touch('touchmove', grip, 240)
    touch('touchend', grip, 240)
    expect(drops).toHaveLength(1)
    expect(drops[0]).toMatchObject({ list: 'more', key: 'a', from: 0, to: 2 })
    expect(drops[0].keys).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves nothing on a tap on the grip', async () => {
    await nextTick()
    const grip = document.getElementById('grip-b')
    touch('touchstart', grip, 176)
    touch('touchmove', grip, 178)
    touch('touchend', grip, 178)
    vi.advanceTimersByTime(LONG_PRESS * 2)
    expect(drops).toEqual([])
  })

  it('leaves a quick swipe on the name to the page', async () => {
    await nextTick()
    const name = document.getElementById('name-a')
    touch('touchstart', name, 124)
    touch('touchmove', name, 150)
    touch('touchmove', name, 182)
    touch('touchend', name, 182)
    vi.advanceTimersByTime(LONG_PRESS * 2)
    expect(drops).toEqual([])
  })

  it('drags from the name after a hold', async () => {
    await nextTick()
    const name = document.getElementById('name-d')
    touch('touchstart', name, 280)
    vi.advanceTimersByTime(LONG_PRESS + 10)
    touch('touchmove', name, 228)
    touch('touchend', name, 228)
    expect(drops[0]?.keys).toEqual(['a', 'b', 'd', 'c'])
  })

  it('lands a row held against the list end at the end', async () => {
    await nextTick()
    const grip = document.getElementById('grip-a')
    touch('touchstart', grip, 124)
    touch('touchmove', grip, 400)
    touch('touchend', grip, 400)
    expect(drops[0]?.keys).toEqual(['b', 'c', 'd', 'a'])
  })

  it('lands a row held against the list top at the top', async () => {
    await nextTick()
    const grip = document.getElementById('grip-c')
    touch('touchstart', grip, 228)
    touch('touchmove', grip, 20)
    touch('touchend', grip, 20)
    expect(drops[0]?.keys).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('edgeStep', () => {
  it('scrolls faster the deeper into the band, and not outside it', () => {
    expect(edgeStep(300, 0, 600)).toBe(0)
    expect(edgeStep(590, 0, 600)).toBeGreaterThan(edgeStep(560, 0, 600))
    expect(edgeStep(560, 0, 600)).toBeGreaterThan(0)
    expect(edgeStep(5, 0, 600)).toBeLessThan(edgeStep(40, 0, 600))
    expect(edgeStep(40, 0, 600)).toBeLessThan(0)
  })
})

describe('scrollerOf', () => {
  const box = (overflowY, scrollHeight, clientHeight) => {
    const el = document.createElement('div')
    el.style.overflowY = overflowY
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight })
    Object.defineProperty(el, 'clientHeight', { value: clientHeight })
    return el
  }

  it('finds the box that scrolls the list (a sheet body)', () => {
    const body = box('auto', 1400, 400)
    // A clipping box whose content fits does not count.
    const clip = box('auto', 900, 900)
    const list = document.createElement('ul')
    clip.append(list)
    body.append(clip)
    document.body.append(body)
    expect(scrollerOf(list)).toBe(body)
    body.remove()
  })
})
