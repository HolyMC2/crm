// Hoy «Ventas de hoy»: Resultados' Ventas card for today, its facts, yesterday
// as context and the drill into the sales list with the return to Hoy.
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(() => Promise.resolve({})),
}))

import { salesToday } from '@/composables/useHoy'

const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'MXN',
  }).format(n)

const SECTION = {
  available: true,
  currency: 'MXN',
  value: 1520.5,
  prev: 980,
  facts: [
    { label: 'Without VAT', value: 1310.78, format: 'money' },
    { label: 'Tickets', value: 12, format: 'count' },
  ],
  attention: {
    label: '1 cancelled · $200.00',
    drill: {
      path: '/crm/resultados/documentos',
      query: { tipo: 'canceladas', periodo: 'hoy' },
    },
  },
  drill: {
    label: 'See sales',
    path: '/crm/resultados/documentos',
    query: { tipo: 'ventas', periodo: 'hoy', compara: 'anterior', tienda: '' },
  },
}

describe('salesToday', () => {
  it('shows the total, the facts and yesterday as a whole-day total', () => {
    const sales = salesToday(SECTION)
    expect(sales.empty).toBe(false)
    expect(sales.total).toBe(money(1520.5))
    expect(sales.facts).toEqual([`Without VAT ${money(1310.78)}`, 'Tickets 12'])
    expect(sales.yesterday).toBe(`Yesterday ${money(980)}`)
  })

  it('opens the Resultados sales list for today and comes back to Hoy', () => {
    const sales = salesToday(SECTION)
    expect(sales.to).toBe(
      '/resultados/documentos?tipo=ventas&periodo=hoy&compara=anterior&return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
    expect(sales.attention).toEqual({
      label: '1 cancelled · $200.00',
      to: '/resultados/documentos?tipo=canceladas&periodo=hoy&return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    })
  })

  it('is empty before the first sale and off when the section is', () => {
    const none = salesToday({
      ...SECTION,
      value: 0,
      prev: 0,
      attention: null,
      facts: [{ label: 'Tickets', value: 0, format: 'count' }],
    })
    expect(none.empty).toBe(true)
    expect(none.facts).toEqual([])
    expect(none.yesterday).toBe('')
    expect(none.attention).toBe(null)
    expect(salesToday({ available: false })).toBe(null)
    expect(salesToday(undefined)).toBe(null)
  })

  it('never links outside the shell', () => {
    const sales = salesToday({
      ...SECTION,
      drill: { path: 'https://evil.example/x' },
      attention: { label: 'x', drill: { path: '//evil.example' } },
    })
    expect(sales.to).toBe(null)
    expect(sales.attention.to).toBe(null)
  })

  it('its strings are in the es-MX catalog', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, resolve } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    for (const text of [
      'Today’s sales',
      'See sales',
      'No sales yet today.',
      'Yesterday {0}',
    ])
      expect(po, text).toMatch(
        new RegExp(
          `msgid "${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\nmsgstr "[^"]+"`,
        ),
      )
  })
})
