// Frontend error telemetry (spec 3.6): pure scrubbing/hash/sampling logic plus
// the send path (mocked sendBeacon). No frappe-ui import, so no mock hooks — the
// vitest-4 rejected-promise-through-a-spy trap doesn't apply here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  djb2,
  scrubUrl,
  capStack,
  isNoise,
  topFrame,
  hashError,
  buildPayload,
  shouldSend,
  encodeBody,
  reportError,
  _onError,
  _onRejection,
  _resetSession,
  initTelemetry,
} from '@/composables/telemetry'

const ENDPOINT = '/api/method/doco_marketing.api.client_error.report'

let beacon

beforeEach(() => {
  _resetSession()
  beacon = vi.fn(() => true)
  Object.defineProperty(globalThis.navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('djb2', () => {
  it('is stable for the same input', () => {
    expect(djb2('TypeError: x')).toBe(djb2('TypeError: x'))
  })
  it('differs for different input', () => {
    expect(djb2('a')).not.toBe(djb2('b'))
  })
  it('handles null/empty without throwing', () => {
    expect(typeof djb2(null)).toBe('string')
    expect(typeof djb2('')).toBe('string')
  })
})

describe('scrubUrl', () => {
  it('strips the query string', () => {
    expect(scrubUrl('https://x.com/crm/inbox?deal=D-1&q=juan')).toBe('https://x.com/crm/inbox')
  })
  it('strips the fragment', () => {
    expect(scrubUrl('https://x.com/crm/leads#L-9')).toBe('https://x.com/crm/leads')
  })
  it('leaves a clean url alone', () => {
    expect(scrubUrl('https://x.com/crm/inbox')).toBe('https://x.com/crm/inbox')
  })
  it('cuts at the earliest of ? or #', () => {
    expect(scrubUrl('https://x.com/p?a=1#f')).toBe('https://x.com/p')
    expect(scrubUrl('https://x.com/p#f?a=1')).toBe('https://x.com/p')
  })
})

describe('capStack', () => {
  it('truncates to the cap', () => {
    expect(capStack('y'.repeat(9000)).length).toBe(4000)
  })
  it('leaves short stacks intact', () => {
    expect(capStack('at foo (a.js:1:1)')).toBe('at foo (a.js:1:1)')
  })
})

describe('isNoise', () => {
  it('flags ResizeObserver loop notifications', () => {
    expect(isNoise('ResizeObserver loop limit exceeded')).toBe(true)
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
  })
  it('flags opaque cross-origin "Script error"', () => {
    expect(isNoise('Script error.')).toBe(true)
  })
  it('does not flag a real error', () => {
    expect(isNoise('TypeError: x is undefined')).toBe(false)
  })
  it('treats empty as not noise', () => {
    expect(isNoise('')).toBe(false)
  })
})

describe('topFrame', () => {
  it('picks the first "at ..." frame after the message line', () => {
    const stack = 'TypeError: boom\n    at foo (app.js:10:5)\n    at bar (app.js:20:1)'
    expect(topFrame(stack)).toBe('at foo (app.js:10:5)')
  })
  it('picks a file:line:col frame when there is no "at "', () => {
    expect(topFrame('boom\napp.js:10:5')).toBe('app.js:10:5')
  })
  it('is empty for an empty stack', () => {
    expect(topFrame('')).toBe('')
  })
})

describe('hashError', () => {
  it('same message + same top frame → same hash', () => {
    const a = hashError('boom', 'x\nat foo (a.js:1:1)')
    const b = hashError('boom', 'x\nat foo (a.js:1:1)')
    expect(a).toBe(b)
  })
  it('same message, different frame → different hash', () => {
    const a = hashError('boom', 'x\nat foo (a.js:1:1)')
    const b = hashError('boom', 'x\nat bar (b.js:2:2)')
    expect(a).not.toBe(b)
  })
})

describe('buildPayload', () => {
  it('assembles hash/message/stack/url/release and scrubs the url', () => {
    const p = buildPayload('TypeError: boom', 'at foo (a.js:1:1)', '/crm/inbox?deal=D-1')
    expect(p.hash).toBe(hashError('TypeError: boom', 'at foo (a.js:1:1)'))
    expect(p.message).toBe('TypeError: boom')
    expect(p.url).toBe('/crm/inbox')
    expect(typeof p.release).toBe('string') // '' under vitest (no __BUILD_ID__)
  })
  it('caps the message length', () => {
    const p = buildPayload('z'.repeat(2000), '', '/crm')
    expect(p.message.length).toBe(500)
  })
})

describe('shouldSend (session sampling)', () => {
  it('always sends the first sighting of a hash', () => {
    expect(shouldSend('h1', () => 0.99)).toBe(true)
  })
  it('samples repeats within the session at 10%', () => {
    shouldSend('h2', () => 0) // first: seen
    expect(shouldSend('h2', () => 0.5)).toBe(false) // repeat above the gate
    expect(shouldSend('h2', () => 0.05)).toBe(true) // repeat under the gate
  })
  it('_resetSession forgets prior sightings', () => {
    shouldSend('h3', () => 0)
    _resetSession()
    expect(shouldSend('h3', () => 0.99)).toBe(true) // first again after reset
  })
})

describe('encodeBody', () => {
  it('form-encodes the payload under a single "payload" field', () => {
    const body = encodeBody({ hash: 'h', message: 'm' })
    const parsed = new URLSearchParams(body)
    expect(JSON.parse(parsed.get('payload'))).toEqual({ hash: 'h', message: 'm' })
  })
})

describe('reportError (send path)', () => {
  it('sends a real error via sendBeacon to the endpoint', () => {
    reportError('TypeError: boom', 'at foo (a.js:1:1)', '/crm/inbox?deal=D-1')
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(beacon.mock.calls[0][0]).toBe(ENDPOINT)
  })
  it('drops noise without sending', () => {
    reportError('ResizeObserver loop limit exceeded', '', '/crm')
    expect(beacon).not.toHaveBeenCalled()
  })
  it('sends the first repeat only, then samples', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // repeats above the 10% gate
    reportError('TypeError: boom', 'at foo (a.js:1:1)', '/crm')
    reportError('TypeError: boom', 'at foo (a.js:1:1)', '/crm')
    expect(beacon).toHaveBeenCalledTimes(1) // second repeat gated out
  })
  it('never throws even if the payload build hits a bad url', () => {
    expect(() => reportError('boom', null, undefined)).not.toThrow()
  })
})

describe('window handlers', () => {
  it('_onError reports from ev.message + ev.error.stack', () => {
    _onError({ message: 'TypeError: boom', error: { stack: 'at foo (a.js:1:1)' } })
    expect(beacon).toHaveBeenCalledTimes(1)
  })
  it('_onRejection reports from ev.reason', () => {
    _onRejection({ reason: { message: 'rejected', stack: 'at g (b.js:2:2)' } })
    expect(beacon).toHaveBeenCalledTimes(1)
  })
  it('_onRejection tolerates a string reason', () => {
    _onRejection({ reason: 'plain string reason' })
    expect(beacon).toHaveBeenCalledTimes(1)
  })
  it('handlers never throw on a malformed event', () => {
    expect(() => _onError(undefined)).not.toThrow()
    expect(() => _onRejection(undefined)).not.toThrow()
  })
})

describe('initTelemetry', () => {
  it('is inert under vitest (no wiring) and never throws', () => {
    expect(() => initTelemetry()).not.toThrow()
    expect(initTelemetry()).toBeUndefined()
  })
})
