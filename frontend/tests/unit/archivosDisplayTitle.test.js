import { describe, expect, it } from 'vitest'
import {
  browseKindLabel,
  displayTitle,
  formatDay,
  issuerName,
  kindLabel,
} from '@/composables/useArchivos'

const UUID = '9F60C154-AE77-4A3D-8F41-5C9EB07D4A11'

describe('a file title a worker can read', () => {
  it('keeps a real title as stored', () => {
    const item = { title: 'Factura 4417 de mayo', document_kind: 'Invoice' }
    expect(displayTitle(item)).toBe('Factura 4417 de mayo')
  })

  it('replaces a UUID on a managed document with the kind, issuer and date', () => {
    const item = {
      title: UUID,
      document_kind: 'Invoice',
      counterparty: 'REFACCIONES FICTICIAS DEL NORTE SA DE C.V.',
      document_date: '2026-03-03',
    }
    expect(displayTitle(item)).toBe(
      `${kindLabel('Invoice')} de Refacciones Ficticias del Norte SA de C.V. · ${formatDay('2026-03-03', 'es-MX')}`,
    )
  })

  it('replaces a UUID on a browse item with its kind, issuer and date', () => {
    const item = {
      title: UUID,
      kind: 'factura',
      counterparty: 'REFACCIONES FICTICIAS DEL NORTE SA DE C.V.',
      date: '2026-03-03',
    }
    expect(displayTitle(item)).toBe(
      `${browseKindLabel('factura')} de Refacciones Ficticias del Norte SA de C.V. · ${formatDay('2026-03-03', 'es-MX')}`,
    )
  })

  it('replaces a CFDI named «{UUID}.xml» with the kind, issuer and date', () => {
    const item = {
      title: `${UUID}.xml`,
      document_kind: 'Invoice',
      counterparty: 'REFACCIONES FICTICIAS DEL NORTE SA DE C.V.',
      document_date: '2026-03-03',
    }
    expect(displayTitle(item)).toBe(
      `${kindLabel('Invoice')} de Refacciones Ficticias del Norte SA de C.V. · ${formatDay('2026-03-03', 'es-MX')}`,
    )
  })

  it('keeps a file name that only contains an ID-like part', () => {
    const named = {
      title: 'ticket-baterias17fdd795c6b4.jpeg',
      kind: 'ticket',
      date: '2026-09-30',
    }
    expect(displayTitle(named)).toBe('ticket-baterias17fdd795c6b4.jpeg')
    expect(
      displayTitle({ title: 'factura-fixoem-sep.pdf', kind: 'factura' }),
    ).toBe('factura-fixoem-sep.pdf')
  })

  it('keeps a native attachment’s file name, which is its useful title', () => {
    const item = {
      title: 'ticket-baterias.jpeg',
      kind: 'ticket',
      counterparty: 'Tienda Norte',
      date: '2026-09-30',
    }
    expect(displayTitle(item)).toBe('ticket-baterias.jpeg')
  })

  it('falls back to the kind alone, or to the attached record when there is no type', () => {
    expect(displayTitle({ title: UUID, document_kind: 'Contract' })).toBe(
      kindLabel('Contract'),
    )
    expect(
      displayTitle({ title: UUID, attached_to: { title: 'Pedido 12' } }),
    ).toBe('Pedido 12')
  })
})

describe('an issuer as written', () => {
  it('is title cased only when the whole name is upper case', () => {
    expect(issuerName('REFACCIONES DEL NORTE')).toBe('Refacciones del Norte')
    expect(issuerName('Tienda Norte')).toBe('Tienda Norte')
  })

  it('keeps legal forms and RFC-like codes as written', () => {
    expect(issuerName('S.A. DE C.V.')).toBe('S.A. de C.V.')
    expect(issuerName('ABC DISTRIBUIDORA S. DE R.L.')).toBe(
      'Abc Distribuidora S. de R.L.',
    )
    expect(issuerName('XAXX010101000')).toBe('XAXX010101000')
  })
})
