import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn(), toast: {} }))

const { accionOf, blockedText, boltGroupsOf } = await import(
  '@/composables/useInmobiliaria'
)

const ficha = {
  acciones: [
    {
      id: 'expediente',
      etiqueta: 'Expediente del cliente',
      tipo: 'default',
      habilitada: true,
      url: '/crm/inmobiliaria/expediente/X',
    },
    {
      id: 'cancelar',
      etiqueta: 'Cancelar venta',
      tipo: 'danger',
      habilitada: true,
    },
    {
      id: 'firmar',
      etiqueta: 'Firmar promesa',
      tipo: 'primary',
      habilitada: true,
    },
    {
      id: 'renta',
      etiqueta: 'Facturar la renta del mes',
      tipo: 'default',
      habilitada: false,
      motivo: 'Las rentas las factura administración.',
      solucion: 'Pide a administración que facture la renta del mes.',
    },
  ],
}

describe('the record bolt of Inmobiliaria', () => {
  it('lists the next step first, the other steps after it and the cancels in their own group last', () => {
    const [pasos, otras] = boltGroupsOf(ficha)
    expect(pasos.title).toBe('Siguiente paso')
    expect(pasos.items.map((i) => i.label)).toEqual([
      'Firmar promesa',
      'Expediente del cliente',
      'Facturar la renta del mes',
    ])
    expect(otras.title).toBe('Cancelar o deshacer')
    expect(otras.items.map((i) => i.label)).toEqual(['Cancelar venta'])
  })

  it('keeps a blocked action in its place and says why and what to do', () => {
    const renta = boltGroupsOf(ficha)[0].items[2]
    expect(renta.allowed).toBe(false)
    expect(renta.reason).toBe(
      'Las rentas las factura administración. Pide a administración que facture la renta del mes.',
    )
    expect(
      blockedText({
        motivo: 'Falta el RFC.',
        solucion: { etiqueta: 'Captúralo.' },
      }),
    ).toBe('Falta el RFC. Captúralo.')
  })

  it('a pick names its action by id; anything else is no action', () => {
    expect(accionOf(ficha, 'accion:firmar').etiqueta).toBe('Firmar promesa')
    expect(accionOf(ficha, 'accion:nada')).toBeNull()
    expect(accionOf(ficha, 'editar')).toBeNull()
  })

  it('a record without actions has no bolt groups', () => {
    expect(boltGroupsOf({ acciones: [] })).toEqual([])
    expect(boltGroupsOf(null)).toEqual([])
  })
})
