// Opening a conversation scrolls its message list to the latest message and
// nothing else: scrollIntoView also scrolled the shell's page and the document,
// which lifted the whole Bandeja off the screen (2026-11-12).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollParent, scrollWithin } from '@/utils/scrollWithin'

afterEach(() => {
  document.body.replaceChildren()
})

function box(el, { top, height, scrollHeight = height, scrollTop = 0 }) {
  el.getBoundingClientRect = () => ({ top, height, bottom: top + height })
  Object.defineProperty(el, 'clientHeight', {
    value: height,
    configurable: true,
  })
  Object.defineProperty(el, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  })
  el.scrollTop = scrollTop
  el.scrollTo = vi.fn()
  return el
}
// page (scrolls) > list (scrolls) > message
function layout() {
  const page = document.createElement('div')
  page.style.overflowY = 'auto'
  const list = document.createElement('div')
  list.style.overflowY = 'auto'
  const message = document.createElement('div')
  list.append(message)
  page.append(list)
  document.body.append(page)
  box(page, { top: 0, height: 800, scrollHeight: 1200 })
  box(list, { top: 300, height: 200, scrollHeight: 1000, scrollTop: 100 })
  // 700 px down the list's content: 300 + 700 - 100 on screen
  message.getBoundingClientRect = () => ({ top: 900, height: 60, bottom: 960 })
  message.scrollIntoView = vi.fn()
  return { page, list, message }
}

describe('scrollWithin', () => {
  it('scrolls the message list to the latest message, never the page', () => {
    const { page, list, message } = layout()
    expect(scrollParent(message)).toBe(list)
    expect(scrollWithin(message, { block: 'end' })).toBe(true)
    // the message's bottom (700 + 60) at the list's bottom (200 tall)
    expect(list.scrollTo).toHaveBeenCalledWith({
      top: 560,
      behavior: 'smooth',
    })
    expect(page.scrollTo).not.toHaveBeenCalled()
    expect(message.scrollIntoView).not.toHaveBeenCalled()
  })

  it('puts a quoted message at the top of the list', () => {
    const { list, message } = layout()
    scrollWithin(message)
    expect(list.scrollTo).toHaveBeenCalledWith({
      top: 700,
      behavior: 'smooth',
    })
  })

  it('leaves everything in place when the list has nothing to scroll', () => {
    const { page, list, message } = layout()
    Object.defineProperty(list, 'scrollHeight', { value: 200 })
    Object.defineProperty(page, 'scrollHeight', { value: 800 })
    expect(scrollWithin(message, { block: 'end' })).toBe(false)
    expect(list.scrollTo).not.toHaveBeenCalled()
    expect(page.scrollTo).not.toHaveBeenCalled()
  })
})
