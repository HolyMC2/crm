import { afterEach, describe, expect, it } from 'vitest'
import { keyboardOpen, measureKeyboard } from '@/composables/keyboard'

function viewport(inner, visual, width = 390) {
  Object.defineProperty(window, 'innerHeight', {
    value: inner,
    configurable: true,
  })
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(window, 'visualViewport', {
    value: { height: visual, addEventListener() {} },
    configurable: true,
  })
}

describe('on-screen keyboard', () => {
  afterEach(() => (keyboardOpen.value = false))

  it('opens when the content resizes with the keyboard (resizes-content)', () => {
    viewport(844, 844)
    expect(measureKeyboard()).toBe(false)
    // innerHeight shrinks together with the visual viewport
    viewport(480, 480)
    expect(measureKeyboard()).toBe(true)
    viewport(844, 844)
    expect(measureKeyboard()).toBe(false)
  })

  it('opens when only the visual viewport shrinks (older browsers)', () => {
    viewport(844, 844)
    measureKeyboard()
    viewport(844, 470)
    expect(measureKeyboard()).toBe(true)
  })

  it('a rotation starts a new baseline instead of reading as a keyboard', () => {
    viewport(844, 844)
    measureKeyboard()
    viewport(390, 390, 844)
    expect(measureKeyboard()).toBe(false)
  })
})
