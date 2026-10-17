import { describe, expect, it } from 'vitest'
import {
  defaultSurvivor,
  differingFields,
  linkLabel,
  linkSummary,
  mergePayload,
  reasonLabel,
  STRENGTH,
} from '@/utils/duplicateReview'

describe('duplicate review helpers (CRM-S3.2)', () => {
  it('names linked records in Spanish, singular and plural', () => {
    expect(linkLabel('CRM Deal', 1)).toBe('1 trato')
    expect(linkLabel('CRM Deal', 7)).toBe('7 tratos')
    expect(linkLabel('Repair Order', 2)).toBe('2 órdenes de reparación')
    expect(linkLabel('Unknown Doctype', 3)).toBe('3 Unknown Doctype')
  })

  it('summarizes business records first and caps the list', () => {
    const links = {
      Comment: 5,
      'Sales Invoice': 3,
      'CRM Deal': 7,
      Customer: 1,
      'Repair Order': 1,
    }
    expect(linkSummary(links)).toBe(
      '7 tratos · 1 orden de reparación · 3 facturas · 5 comentarios · 1 tipo más',
    )
    // a card names the two that matter, without a vague tail
    expect(linkSummary(links, 2, false)).toBe(
      '7 tratos · 1 orden de reparación',
    )
    expect(linkSummary({})).toBe('Sin registros vinculados')
    expect(linkSummary({ 'CRM Deal': 0 })).toBe('Sin registros vinculados')
  })

  it('keeps by default the record with the customer work, then the oldest', () => {
    const a = { name: 'A', creation: '2025-01-01', links: { Comment: 1 } }
    const b = { name: 'B', creation: '2026-01-01', links: { 'CRM Deal': 7 } }
    const c = { name: 'C', creation: '2024-01-01', links: { Comment: 1 } }
    expect(defaultSurvivor([a, b]).name).toBe('B')
    expect(defaultSurvivor([a, c]).name).toBe('C')
  })

  it('asks only about fields that really differ', () => {
    const keep = { fields: { first_name: 'Ana', last_name: 'López' } }
    const drop = {
      fields: { first_name: 'Ana', last_name: 'Lopez Ruiz', designation: '' },
    }
    expect(
      differingFields(['first_name', 'last_name', 'designation'], keep, drop),
    ).toEqual(['last_name'])
  })

  it('sends only the duplicate values the person chose, with both versions', () => {
    const keep = { name: 'K', modified: '2026-10-15 10:00:00' }
    const drop = { name: 'D', modified: '2026-10-14 09:00:00' }
    expect(
      mergePayload(keep, drop, { last_name: 'source', first_name: 'target' }),
    ).toEqual({
      source: 'D',
      target: 'K',
      expected: {
        source: '2026-10-14 09:00:00',
        target: '2026-10-15 10:00:00',
      },
      keep: { last_name: 'source' },
      confirmed: true,
    })
  })

  it('labels reasons and strengths in Spanish', () => {
    expect(reasonLabel({ kind: 'phone', label: '669 123 4567' })).toBe(
      'Mismo teléfono: 669 123 4567',
    )
    expect(reasonLabel({ kind: 'email', label: 'ana@gmail.com' })).toBe(
      'Mismo correo: ana@gmail.com',
    )
    expect(STRENGTH.shared_phone.label).toMatch(/nombres no coinciden/)
  })
})
