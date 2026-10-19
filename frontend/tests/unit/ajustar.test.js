// «Ajustar existencia» helpers: the typed quantity in es-MX and the Motivo
// line that goes to the draft's Actividad.
import { describe, expect, it } from 'vitest'
import { ajusteComment, parseQty } from '@/components/productos/ajustar'

describe('ajustar', () => {
  it('reads es-MX quantities of 0 or more, never a negative or text', () => {
    expect(parseQty('48')).toBe(48)
    expect(parseQty(' 1,250.5 ')).toBe(1250.5)
    expect(parseQty('0')).toBe(0)
    expect(parseQty('.5')).toBe(0.5)
    expect(parseQty('-3')).toBeNull()
    expect(parseQty('')).toBeNull()
    expect(parseQty('tres')).toBeNull()
  })

  it('says the motivo, with the note after it; «Otro» is the note itself', () => {
    expect(ajusteComment('correccion', '')).toBe('Motivo: Corrección')
    expect(ajusteComment('danado', ' se cayó ')).toBe(
      'Motivo: Dañado · se cayó',
    )
    expect(ajusteComment('otro', 'Muestra para cliente')).toBe(
      'Motivo: Muestra para cliente',
    )
    expect(ajusteComment('otro', '')).toBe('')
  })
})
