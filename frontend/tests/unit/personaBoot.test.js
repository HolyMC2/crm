import { afterEach, describe, expect, it } from 'vitest'
import { bootPersonaCaptured } from '@/utils/personaBoot'

describe('the persona answer in the page boot', () => {
  afterEach(() => {
    delete window.persona_captured
  })
  it('is unknown when the page boot does not carry it', () => {
    expect(bootPersonaCaptured()).toBeUndefined()
    window.persona_captured = null
    expect(bootPersonaCaptured()).toBeUndefined()
  })
  it('reads the Check field as a boolean', () => {
    window.persona_captured = 1
    expect(bootPersonaCaptured()).toBe(true)
    window.persona_captured = 0
    expect(bootPersonaCaptured()).toBe(false)
    window.persona_captured = true
    expect(bootPersonaCaptured()).toBe(true)
  })
})
