import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CUBETAS,
  cubetaChips,
  cubetaLabel,
  triajeLine,
} from '@/components/correo/correo'

describe('the assistant buckets in the mail queue', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {}
    window.sysdefaults = { currency: 'MXN', number_format: '#,###.##' }
  })
  afterEach(() => {
    delete window.sysdefaults
  })

  it('shows only buckets with mail, «Todo» first, in the queue order', () => {
    const chips = cubetaChips({ noise: 14, action: 3, money: 2 })
    expect(chips.map((c) => c.value)).toEqual(['', 'action', 'money', 'noise'])
    expect(chips[1]).toMatchObject({ label: 'Te necesita', count: 3 })
  })

  it('shows no chips before anything was sorted', () => {
    expect(cubetaChips({})).toEqual([])
    expect(cubetaChips()).toEqual([])
  })

  it('names every bucket the server sends', () => {
    for (const value of [
      'action',
      'waiting',
      'agenda',
      'papers',
      'money',
      'security',
      'later',
      'noise',
    ])
      expect(cubetaLabel(value)).not.toBe('')
    expect(CUBETAS).toHaveLength(8)
    expect(cubetaLabel('unknown')).toBe('')
  })

  it('puts the bucket, the money and what to do on one line', () => {
    const now = new Date('2026-11-16T12:00:00')
    const line = triajeLine(
      {
        cubeta: 'money',
        monto: 899,
        vence: '2026-11-28',
        accion: 'Pagar el recibo de Telcel',
        resumen: 'Telcel: recibo por pagar',
      },
      { now },
    )
    expect(line.startsWith('Dinero · ')).toBe(true)
    expect(line).toContain('899')
    expect(line).toContain('vence')
    expect(line.endsWith('— Pagar el recibo de Telcel')).toBe(true)
  })

  it('falls back to the summary and stays empty without a sorting', () => {
    expect(triajeLine({ cubeta: 'later', resumen: 'Boletín de Medium' })).toBe(
      'Leer luego — Boletín de Medium',
    )
    expect(triajeLine(null)).toBe('')
  })
})
