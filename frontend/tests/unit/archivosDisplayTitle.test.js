import { describe, expect, it } from 'vitest'
import {
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

  it('replaces a UUID with the kind and the issuer', () => {
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

  it('replaces a bare file name, and drops the date when there is none', () => {
    const item = {
      title: 'scan_0042.pdf',
      document_kind: 'Receipt',
      counterparty: 'Tienda Norte',
    }
    expect(displayTitle(item)).toBe(`${kindLabel('Receipt')} de Tienda Norte`)
  })

  it('falls back to the kind alone when there is no issuer', () => {
    expect(displayTitle({ title: UUID, document_kind: 'Contract' })).toBe(
      kindLabel('Contract'),
    )
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
