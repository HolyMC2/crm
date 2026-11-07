import { describe, expect, it } from 'vitest'
import { contactColumns, followupWhen, formatDay } from '@/utils/contactos'

// The Contactos desktop table: what its next-action cell says and which
// columns a narrow list keeps.
const day = { lang: 'es', now: new Date('2026-11-06T12:00:00Z') }

describe('followupWhen', () => {
  it('says an overdue follow-up is overdue, with its day', () => {
    expect(followupWhen({ date: '2026-11-03' }, '2026-11-06', day)).toBe(
      `Vencido, ${formatDay('2026-11-03', day)}`,
    )
  })
  it('says «Hoy» for today and the bare day for later', () => {
    expect(followupWhen({ date: '2026-11-06' }, '2026-11-06', day)).toBe('Hoy')
    expect(followupWhen({ date: '2026-11-13' }, '2026-11-06', day)).toBe(
      formatDay('2026-11-13', day),
    )
  })
  it('says «Sin fecha» for an undated follow-up', () => {
    expect(followupWhen({ date: null }, '2026-11-06', day)).toBe('Sin fecha')
  })
})

describe('contactColumns', () => {
  const all = ['roles', 'phone', 'company', 'next']
  it('keeps every column where the list has room, or before it is measured', () => {
    expect(contactColumns(all, 1200)).toEqual(all)
    expect(contactColumns(all, 0)).toEqual(all)
  })
  it('keeps the name, the way to reach them and the follow-up in a narrow list', () => {
    expect(contactColumns(all, 808)).toEqual(['phone', 'next'])
  })
  it('keeps a column the worker added that is not roles or company', () => {
    expect(contactColumns(['phone', 'saldo', 'company'], 700)).toEqual([
      'phone',
      'saldo',
    ])
  })
})
