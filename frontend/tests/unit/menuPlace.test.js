// The bolt's menu on wider screens (AccionesMenu) opens toward the side that
// has room: a record's bolt follows its name, so a short name puts it next to
// the rail, where a menu hung from its right edge left the page.
import { describe, expect, it } from 'vitest'
import { menuPlace } from '@/components/documentos/menuPlace'

const page = { left: 60, right: 1500 }

describe('menuPlace', () => {
  it('hangs from the right edge of the bolt when the menu fits on its left', () => {
    expect(menuPlace({ left: 1400, right: 1448 }, page)).toEqual({
      right: '0px',
      transformOrigin: 'top right',
    })
  })

  it('opens to the right of a bolt that sits next to the rail', () => {
    // Marco's product: the bolt at 294–342, the page from 60.
    expect(menuPlace({ left: 294, right: 342 }, page)).toEqual({
      left: '0px',
      transformOrigin: '24px top',
    })
  })

  it('is pushed back inside a page narrower than both sides', () => {
    // A pane of 400: neither edge of the bolt leaves 320 of room.
    const place = menuPlace(
      { left: 250, right: 298 },
      { left: 100, right: 500 },
    )
    // 500 − 8 − 320 = 172: the menu's left edge, 78 left of the bolt's.
    expect(place.left).toBe('-78px')
    expect(place.transformOrigin).toBe('102px top')
  })

  it('narrows to a pane that cannot hold its width', () => {
    const place = menuPlace({ left: 150, right: 198 }, { left: 0, right: 300 })
    expect(place.width).toBe('284px')
    expect(place.left).toBe('-142px')
  })

  it('keeps its usual place where nothing is laid out', () => {
    expect(menuPlace()).toEqual({ right: '0px', transformOrigin: 'top right' })
    expect(menuPlace({ left: 0, right: 0 }, { left: 0, right: 0 })).toEqual({
      right: '0px',
      transformOrigin: 'top right',
    })
  })
})
