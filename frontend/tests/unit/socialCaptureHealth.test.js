import { describe, expect, it } from 'vitest'
import { captureHealthLabel, newCaptureHealthRequests } from '../../src/utils/socialCaptureHealth'

describe('social capture evidence', () => {
  it('does not turn an existing subscription into a delivery guarantee', () => {
    expect(captureHealthLabel('subscription_present_delivery_unverified')).toContain('recepción sin comprobar')
    expect(captureHealthLabel('surprise_state')).toBe('Conexión sin verificar')
    expect(captureHealthLabel('missing_mention_subscription')).toContain('Falta')
  })

  it('rejects an old provider response after branch change, logout or unmount', () => {
    const requests = newCaptureHealthRequests()
    const oldBranch = requests.invalidate()
    const newBranch = requests.invalidate()
    expect(requests.current(oldBranch)).toBe(false)
    expect(requests.current(newBranch)).toBe(true)
    requests.invalidate()
    expect(requests.current(newBranch)).toBe(false)
  })
})
