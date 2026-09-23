import { describe, expect, it } from 'vitest'
import {
  aboutLine,
  deskHref,
  displayPhone,
  recordRoute,
  relativeAge,
} from '@/utils/reviewCardFormat'

describe('review card phone display', () => {
  it('groups the local ten digits and keeps whatever prefix the data carries', () => {
    expect(displayPhone('5216951131449')).toBe('+521 695 113 1449')
    expect(displayPhone('526951131449')).toBe('+52 695 113 1449')
    expect(displayPhone('+1 (415) 555-0100')).toBe('+1 415 555 0100')
    expect(displayPhone('6951131449')).toBe('695 113 1449')
  })
  it('leaves short or empty values untouched', () => {
    expect(displayPhone('12345')).toBe('12345')
    expect(displayPhone(null)).toBe('')
  })
})

describe('review card links', () => {
  it('routes deals to Deal 360 and leads to the lead page', () => {
    expect(recordRoute('CRM Deal', 'CRM-DEAL-2026-00407')).toEqual({
      name: 'Deal 360',
      params: { dealId: 'CRM-DEAL-2026-00407' },
    })
    expect(recordRoute('CRM Lead', 'CRM-LEAD-1')).toEqual({
      name: 'Lead',
      params: { leadId: 'CRM-LEAD-1' },
    })
    expect(recordRoute('Repair Order', 'RO-00255')).toBeNull()
    expect(recordRoute('CRM Deal', '')).toBeNull()
  })
  it('falls back to the contact behind the number when the reference has no page', () => {
    expect(recordRoute('Repair Order', 'RO-00255', 'Pablo Hernández')).toEqual({
      name: 'Contact',
      params: { contactId: 'Pablo Hernández' },
    })
    expect(recordRoute('CRM Deal', 'CRM-DEAL-1', 'Pablo')).toEqual({
      name: 'Deal 360',
      params: { dealId: 'CRM-DEAL-1' },
    })
  })
  it('builds Desk links with the slug convention and encodes the name', () => {
    expect(deskHref('Repair Order', 'RO-00255')).toBe(
      '/app/repair-order/RO-00255',
    )
    expect(deskHref('CRM Deal', 'A B')).toBe('/app/crm-deal/A%20B')
    expect(deskHref('', 'X')).toBeNull()
  })
})

describe('review card identity line', () => {
  it('joins repair type, device, title and organization without repeats', () => {
    expect(
      aboutLine({
        repair_type: 'Cambio de pantalla',
        device: 'iPhone 12',
        title: 'cambio de pantalla',
      }),
    ).toBe('Cambio de pantalla · iPhone 12')
    expect(
      aboutLine({ device: ' ', title: 'Reparación', organization: 'Acme' }),
    ).toBe('Reparación · Acme')
    expect(aboutLine({})).toBe('')
  })
  it('drops a deal title that only restates the phone or the device — customer pair', () => {
    expect(
      aboutLine({
        repair_type: 'twip test',
        device: 'TWIP DEV',
        title: '+5215555550000',
        customer_phone: '+5215555550000',
      }),
    ).toBe('twip test · TWIP DEV')
    expect(
      aboutLine({
        repair_type: 'Quitar Virus',
        device: 'Realme C63',
        title: 'Realme C63 — Test Orders',
        customer_name: 'Test Orders',
      }),
    ).toBe('Quitar Virus · Realme C63')
    expect(
      aboutLine({
        device: 'Realme C63',
        title: 'Pantalla rota, urge',
        customer_name: 'Ana',
      }),
    ).toBe('Realme C63 · Pantalla rota, urge')
  })
})

describe('review card age', () => {
  const now = new Date('2026-09-15T12:00:00').getTime()
  it('scales from minutes to days', () => {
    expect(relativeAge('2026-09-15 11:59:40', now)).toBe('ahora')
    expect(relativeAge('2026-09-15 11:48:00', now)).toBe('12m')
    expect(relativeAge('2026-09-15 09:00:00', now)).toBe('3h')
    expect(relativeAge('2026-09-08 12:00:00', now)).toBe('7d')
  })
  it('is empty for missing or broken timestamps', () => {
    expect(relativeAge('', now)).toBe('')
    expect(relativeAge('not a date', now)).toBe('')
  })
})
