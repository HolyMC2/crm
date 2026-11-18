// Hoy «Ventas de hoy»: Resultados' Ventas card for today, its facts, yesterday
// as context and the drill into the sales list with the return to Hoy. Hoy
// «Credit sales»: the Credito card, what Payjoy pays later, one row per sale.
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(() => Promise.resolve({})),
}))

import { creditToday, salesToday } from '@/composables/useHoy'
import { formatMoney } from '@/utils/display'

const money = (n) => formatMoney(n, 'MXN')

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

const CREDIT = {
  available: true,
  currency: 'MXN',
  label: 'Credit sales',
  format: 'money',
  value: 3041,
  value_label: 'Payjoy pays later',
  facts: [
    { label: 'Sales', value: 2, format: 'count' },
    { label: 'Down payments', value: 769, format: 'money' },
  ],
  items: [
    {
      name: 'ACC-SINV-2026-04095',
      label: 'valeria guadalupe · Payjoy',
      customer: 'valeria guadalupe',
      provider: 'Payjoy',
      href: '/crm/resultados/documento/Sales%20Invoice/ACC-SINV-2026-04095',
      price: 3900,
      charged: 469,
      pays: 3041,
      missing_price: false,
    },
    {
      name: 'ACC-SINV-2026-04096',
      label: 'Cristhian · Payjoy',
      customer: 'Cristhian',
      provider: 'Payjoy',
      href: '/crm/resultados/documento/Sales%20Invoice/ACC-SINV-2026-04096',
      price: 0,
      charged: 300,
      pays: null,
      missing_price: true,
    },
  ],
  attention: {
    label: '1 without their credit price: upload the provider’s receipt',
    drill: {
      path: '/crm/resultados/documentos',
      query: { tipo: 'credito', periodo: 'hoy' },
    },
  },
  drill: {
    label: 'See credit sales',
    path: '/crm/resultados/documentos',
    query: { tipo: 'credito', periodo: 'hoy' },
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

  it('writes money as the shell does, whatever the phone’s locale', () => {
    const sales = salesToday({ ...SECTION, value: 5695, prev: 4280 })
    expect(sales.total).toBe('$5,695.00')
    expect(sales.yesterday).toBe('Yesterday $4,280.00')
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

  it('lists today’s credit sales with what the provider pays later', () => {
    const credit = creditToday(CREDIT)
    expect(credit.empty).toBe(false)
    expect(credit.label).toBe('Credit sales')
    expect(credit.total).toBe('$3,041.00')
    expect(credit.totalLabel).toBe('Payjoy pays later')
    expect(credit.facts).toEqual(['Sales 2', 'Down payments $769.00'])
    expect(credit.rows).toEqual([
      {
        name: 'ACC-SINV-2026-04095',
        title: 'valeria guadalupe',
        detail: 'Payjoy · Price $3,900.00 · Down payment $469.00',
        pays: '$3,041.00',
        missing: false,
        to: '/resultados/documento/Sales%20Invoice/ACC-SINV-2026-04095?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
      },
      {
        name: 'ACC-SINV-2026-04096',
        title: 'Cristhian',
        detail: 'Payjoy · Down payment $300.00',
        pays: '',
        missing: true,
        to: '/resultados/documento/Sales%20Invoice/ACC-SINV-2026-04096?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
      },
    ])
    expect(credit.attention.to).toBe(
      '/resultados/documentos?tipo=credito&periodo=hoy&return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
    expect(credit.to).toBe(
      '/resultados/documentos?tipo=credito&periodo=hoy&return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
  })

  it('without margin access: the sales, never what the provider pays', () => {
    const credit = creditToday({
      ...CREDIT,
      format: 'count',
      value: 2,
      value_label: 'sales',
      items: CREDIT.items.map(({ pays, ...item }) => item),
    })
    expect(credit.total).toBe('')
    expect(credit.rows.map((row) => row.pays)).toEqual(['', ''])
  })

  it('is empty on a day without credit sales and off when the section is', () => {
    expect(creditToday({ ...CREDIT, items: [] }).empty).toBe(true)
    expect(creditToday({ available: false })).toBe(null)
    expect(
      creditToday({
        ...CREDIT,
        items: [{ ...CREDIT.items[0], href: 'https://evil.example/x' }],
      }).rows[0].to,
    ).toBe(null)
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
      'Credit sales',
      'No credit sales today.',
      'No credit price',
      'Price {0}',
      'Down payment {0}',
      '{0} pays {1}',
      'Credit provider',
    ])
      expect(po, text).toMatch(
        new RegExp(
          `msgid "${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\nmsgstr "[^"]+"`,
        ),
      )
  })
})
