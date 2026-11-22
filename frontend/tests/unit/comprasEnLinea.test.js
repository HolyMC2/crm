// Compras › En línea: what the worker reads of an online purchase and what a tap sends.
import { describe, expect, it } from 'vitest'

import {
  acceptableCount,
  formFrom,
  normalizeState,
  purchaseSubtitle,
  purchaseTitle,
  shopArgs,
  stateChip,
} from '@/composables/useComprasEnLinea'

const READING = {
  compra_mp: 'MPC-2026-10492',
  tienda: 'Mercado Libre',
  total: 194.97,
  moneda: 'MXN',
  articulos: [
    {
      nombre: 'Batería Para Redmi Note 12 Pro Bp4k',
      cantidad: 1,
      precio: 194.97,
      catalogo: null,
      nuevo: {
        nombre: 'Bateria para Xiaomi Redmi Note 12 Pro - BP4K',
        grupo: 'Baterías',
      },
    },
    {
      nombre: 'Funda Galaxy A27',
      cantidad: 2,
      precio: 50,
      catalogo: { articulo: 'IPN000123', nombre: 'Funda Galaxy A27' },
    },
  ],
}

describe('the list', () => {
  it('names a purchase by its lines, else by what Mercado Pago called it', () => {
    expect(
      purchaseTitle({ articulos: [{ titulo: 'A' }, { titulo: 'B' }] }),
    ).toBe('A; B')
    expect(purchaseTitle({ concepto: 'Suscripción a Meli+' })).toBe(
      'Suscripción a Meli+',
    )
    expect(
      purchaseSubtitle({
        vendedor: 'GADGETTROOPSMXF',
        fecha: '2026-11-21 20:51',
      }),
    ).toBe('GADGETTROOPSMXF, 2026-11-21')
  })
  it('a row reads its state as a chip, and an unknown state falls back', () => {
    expect(stateChip('por revisar').tone).toBe('warning')
    expect(stateChip('registrada').tone).toBe('success')
    expect(normalizeState('perdidas')).toBe('por_revisar')
    expect(normalizeState('todas')).toBe('todas')
  })
})

describe('registering for the shop', () => {
  it('a line keeps its catalog match, else the name and group a new item gets', () => {
    const form = formFrom(READING)
    expect(form.lineas[0]).toMatchObject({
      articulo: '',
      nombre: 'Bateria para Xiaomi Redmi Note 12 Pro - BP4K',
      grupo: 'Baterías',
    })
    expect(form.lineas[1]).toMatchObject({ articulo: 'IPN000123', cantidad: 2 })
  })
  it('sends the purchase, its lines, the store, repairs and deals', () => {
    const form = formFrom(READING)
    form.almacen = 'Tienda Centro - GD'
    form.reparaciones.push({ value: 'RO-00812', label: 'Redmi Note 12 Pro' })
    form.tratos.push({ value: 'CRM-DEAL-2026-00044', label: 'Ana López' })
    const args = shopArgs(READING, form)
    expect(args).toMatchObject({
      compra_mp: 'MPC-2026-10492',
      tienda: 'Mercado Libre',
      almacen: 'Tienda Centro - GD',
      reparaciones: ['RO-00812'],
      tratos: ['CRM-DEAL-2026-00044'],
    })
    expect(args.lineas[0]).toMatchObject({
      nombre: 'Bateria para Xiaomi Redmi Note 12 Pro - BP4K',
      grupo: 'Baterías',
      cantidad: 1,
    })
    expect(args.lineas[1]).toMatchObject({ articulo: 'IPN000123', cantidad: 2 })
  })
  it('the card applies only when a line is acceptable', () => {
    expect(acceptableCount([{ error: 'ya está registrada' }])).toBe(0)
    expect(acceptableCount([{ label: 'Factura' }, { error: 'x' }])).toBe(1)
  })
})
