import { describe, expect, it } from 'vitest'
import {
  isOverdue,
  prospectArgs,
  prospectRoute,
  sourceTheme,
  waitingLabel,
} from '@/utils/prospects'

describe('Prospectos helpers (CRM-S3.4)', () => {
  it('opens a lead on its page and an inquiry in Consultas', () => {
    expect(prospectRoute({ kind: 'lead', name: 'CRM-LEAD-1' })).toEqual({
      name: 'Lead',
      params: { leadId: 'CRM-LEAD-1' },
    })
    expect(prospectRoute({ kind: 'inquiry', name: 'abc' })).toEqual({
      name: 'Inquiries',
      query: { name: 'abc' },
    })
  })

  it('says how long a prospect has waited, in Spanish', () => {
    const now = new Date('2026-10-15T12:00:00').getTime()
    expect(waitingLabel('2026-10-15 11:59:30', now)).toBe('hace 1 min')
    expect(waitingLabel('2026-10-15 11:20:00', now)).toBe('hace 40 min')
    expect(waitingLabel('2026-10-15 09:00:00', now)).toBe('hace 3 h')
    expect(waitingLabel('2026-10-14 12:00:00', now)).toBe('hace 1 día')
    expect(waitingLabel('2026-10-10 12:00:00', now)).toBe('hace 5 días')
    expect(waitingLabel('', now)).toBe('')
  })

  it('flags a past next action as overdue', () => {
    const now = new Date('2026-10-15T12:00:00').getTime()
    expect(isOverdue({ next_action_at: '2026-10-15 10:00:00' }, now)).toBe(true)
    expect(isOverdue({ next_action_at: '2026-10-16 10:00:00' }, now)).toBe(
      false,
    )
    expect(isOverdue({}, now)).toBe(false)
  })

  it('sends only the filters in use', () => {
    expect(prospectArgs({ kind: '', source: '', q: '  ' })).toEqual({
      start: 0,
      page_length: 30,
    })
    expect(
      prospectArgs({ kind: 'lead', source: 'tienda', q: ' ana ', start: 30 }),
    ).toEqual({
      start: 30,
      page_length: 30,
      kind: 'lead',
      source: 'tienda',
      q: 'ana',
    })
  })

  it('gives every source a chip color', () => {
    expect(sourceTheme('whatsapp')).toBe('green')
    expect(sourceTheme('desconocido')).toBe('gray')
    const supported = ['gray', 'blue', 'green', 'orange', 'red', 'violet']
    for (const key of [
      'whatsapp',
      'facebook',
      'instagram',
      'tienda',
      'web',
      'mostrador',
      'llamada',
      'correo',
      'referido',
      'manual',
      'otro',
    ])
      expect(supported).toContain(sourceTheme(key))
  })
})
