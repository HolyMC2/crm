import { describe, it, expect, vi } from 'vitest'
import { setConfig } from '../../node_modules/frappe-ui/src/utils/config.ts'

vi.mock('frappe-ui', async () => {
  const dates = await import('../../node_modules/frappe-ui/src/utils/dayjs.ts')
  const config =
    await import('../../node_modules/frappe-ui/src/utils/config.ts')
  return {
    dayjsLocal: dates.dayjsLocal,
    dayjs: dates.dayjs,
    getConfig: config.getConfig,
  }
})

import {
  newCaptureDraft,
  newPerson,
  safeSourceUrl,
  capturePayload,
  validateCapture,
  validatePerson,
  canConvertPerson,
  toLocalDatetime,
  toSystemDatetime,
  inquiryError,
  requestGate,
  inquiryNotificationRoute,
} from '@/utils/inquiries'

describe('inquiry input and identity boundaries', () => {
  it('creates independent request IDs without guessing a person', () => {
    const a = newCaptureDraft()
    const b = newCaptureDraft()
    expect(a.client_request_id).not.toBe(b.client_request_id)
    expect(a.people).toEqual([])
    expect(a.source_type).toBe('Manual')
  })

  it('requires a title and source context, validates bounded inputs and explicit roles', () => {
    const draft = newCaptureDraft()
    expect(validateCapture(draft)).toContain('título')
    draft.title = 'Consulta de servicio'
    expect(validateCapture(draft)).toContain('enlace o el texto')
    draft.source_text = 'Contexto público'
    expect(validateCapture(draft)).toBe('')
    draft.people = [
      { ...newPerson(), display_name: '@referente', role: 'Buyer' },
    ]
    expect(validateCapture(draft)).toContain('papel')
    draft.people[0].role = 'Referrer'
    expect(validateCapture(draft)).toBe('')
    draft.source_text = 'x'.repeat(20001)
    expect(validateCapture(draft)).toContain('20000')
    expect(
      validatePerson({
        ...newPerson(),
        display_name: 'Ana',
        phone: '1'.repeat(41),
      }),
    ).toContain('40')
    expect(
      validatePerson({ ...newPerson(), display_name: 'Ana', email: 'bad' }),
    ).toContain('correo')
  })

  it('accepts only http(s) source links without credentials', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,test',
      '//example.com',
      'https://user:pass@example.com',
      'broken',
    ]) {
      expect(safeSourceUrl(value)).toBe('')
    }
    expect(safeSourceUrl(' https://example.com/post?id=1 ')).toBe(
      'https://example.com/post?id=1',
    )
  })

  it('omits forged child and provenance fields and preserves plain text without rendering HTML', () => {
    const payload = capturePayload({
      ...newCaptureDraft(),
      title: ' Captura ',
      source_text: '<b>Original</b>',
      capture_key: 'forged',
      owner: 'someone',
      people: [
        {
          ...newPerson(),
          display_name: ' Persona ',
          lead: 'LEAD-1',
          person_key: 'forged',
        },
      ],
    })
    expect(payload.title).toBe('Captura')
    expect(payload.source_text).toBe('<b>Original</b>')
    expect(payload).not.toHaveProperty('capture_key')
    expect(payload).not.toHaveProperty('owner')
    expect(payload.people).toEqual([
      { display_name: 'Persona', role: 'Requester', email: '', phone: '' },
    ])
  })

  it('blocks referrers, closed inquiries, linked people and redacted conversion receipts', () => {
    expect(canConvertPerson({ role: 'Referrer' }, 'New')).toBe(false)
    expect(canConvertPerson({ role: 'Requester' }, 'Closed')).toBe(false)
    expect(canConvertPerson({ role: 'Requester', lead: 'L-1' }, 'New')).toBe(
      false,
    )
    expect(
      canConvertPerson(
        { role: 'Requester', lead: null, converted_at: '2026-09-09 09:00:00' },
        'New',
      ),
    ).toBe(false)
    expect(canConvertPerson({ role: 'Requester' }, 'New')).toBe(true)
    expect(canConvertPerson({ role: 'Interested Person' }, 'In Progress')).toBe(
      true,
    )
  })
})

describe('inquiry datetime conversion', () => {
  it('roundtrips from site timezone into user local time with seconds', () => {
    setConfig('systemTimezone', 'America/Mazatlan')
    setConfig('localTimezone', 'America/New_York')
    expect(toLocalDatetime('2026-09-09 09:30:15')).toBe('2026-09-09T12:30:15')
    expect(toSystemDatetime('2026-09-09T12:30:15')).toBe('2026-09-09 09:30:15')
    expect(toSystemDatetime('2026-09-09T12:30')).toBe('2026-09-09 09:30:00')
    expect(toSystemDatetime('')).toBeNull()
    expect(toLocalDatetime(null)).toBe('')
  })

  it('uses the local timezone seasonal offset instead of a fixed offset', () => {
    setConfig('systemTimezone', 'America/Mazatlan')
    setConfig('localTimezone', 'America/New_York')
    expect(toLocalDatetime('2026-12-09 09:30:00')).toBe('2026-12-09T11:30:00')
    expect(toSystemDatetime('2026-12-09T11:30')).toBe('2026-12-09 09:30:00')
  })
})

describe('inquiry request and failure handling', () => {
  it('opens inquiry assignment notifications using the native query route', () => {
    expect(
      inquiryNotificationRoute({
        route_name: 'Inquiries',
        reference_name: 'INQ-42',
      }),
    ).toEqual({ name: 'Inquiries', query: { name: 'INQ-42' } })
    expect(
      inquiryNotificationRoute({
        route_name: 'Lead',
        reference_name: 'LEAD-1',
      }),
    ).toBeNull()
    expect(inquiryNotificationRoute({ route_name: 'Inquiries' })).toBeNull()
  })
  it('rejects older requests and responses from a different actor', () => {
    let context = 'actor-a:INQ-1'
    const gate = requestGate(() => context)
    const a = gate.begin()
    const b = gate.begin()
    expect(gate.current(a)).toBe(false)
    expect(gate.current(b)).toBe(true)
    context = 'actor-b:INQ-1'
    expect(gate.current(b)).toBe(false)
    const c = gate.begin()
    gate.invalidate()
    expect(gate.current(c)).toBe(false)
  })

  it('distinguishes permission, concurrency, missing schema and transport errors', () => {
    expect(inquiryError({ exc_type: 'PermissionError' }).kind).toBe(
      'permission',
    )
    expect(inquiryError({ exc_type: 'TimestampMismatchError' }).kind).toBe(
      'conflict',
    )
    expect(
      inquiryError({
        exc_type: 'ValidationError',
        messages: ['Native inquiries are not installed yet.'],
      }).kind,
    ).toBe('unavailable')
    expect(inquiryError(new TypeError('Failed to fetch')).kind).toBe(
      'connection',
    )
    expect(
      inquiryError({
        exc_type: 'ValidationError',
        messages: ['Choose <b>a role</b>.'],
      }).message,
    ).toBe('Choose  a role .')
  })
})
