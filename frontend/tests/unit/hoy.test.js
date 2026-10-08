// Hoy (/crm/hoy): agenda now/next, continuation cards with the return to Hoy,
// drafts kept in this tab, quick actions from the boot, and pull-to-refresh.
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(() => Promise.resolve({})),
}))

import {
  ACCESOS_LIMIT,
  accesos,
  agendaPlan,
  continuarCards,
  dayTitle,
  dueMore,
  dueRows,
  eventLink,
  greeting,
  landingOptions,
  scanDrafts,
  withReturn,
} from '@/composables/useHoy'
import { PULL_THRESHOLD, pullDistance } from '@/composables/usePullRefresh'
import { prefetchHoy, takeHoy } from '@/utils/hoyPrefetch'
import { call } from 'frappe-ui'

const at = (iso) => Date.parse(iso)
const event = (id, start, end, extra = {}) => ({
  id,
  source: 'Event',
  title: id,
  start,
  end,
  status: 'Open',
  ...extra,
})

describe('agendaPlan', () => {
  const events = [
    event('done', '2026-10-08T14:00:00Z', '2026-10-08T15:00:00Z'),
    event('now', '2026-10-08T16:00:00Z', '2026-10-08T17:00:00Z'),
    event('late', '2026-10-08T21:00:00Z', '2026-10-08T22:00:00Z'),
    event('soon', '2026-10-08T18:00:00Z', '2026-10-08T18:30:00Z'),
    event('cancelled', '2026-10-08T19:00:00Z', '2026-10-08T19:30:00Z', {
      status: 'Cancelled',
    }),
    event('all', '2026-10-08T06:00:00Z', '2026-10-09T06:00:00Z', {
      allDay: true,
    }),
  ]

  it('marks Ahora and Siguiente and only counts what already ended', () => {
    const plan = agendaPlan(events, at('2026-10-08T16:30:00Z'))
    expect(plan.rows.map((row) => [row.id, row.state])).toEqual([
      ['now', 'now'],
      ['soon', 'next'],
      ['late', 'later'],
      ['all', 'allday'],
    ])
    expect(plan.earlier).toBe(1)
    expect(plan.total).toBe(5)
  })

  it('has no Siguiente once the day is over', () => {
    const plan = agendaPlan(events, at('2026-10-08T23:00:00Z'))
    expect(plan.rows.map((row) => row.id)).toEqual(['all'])
    expect(plan.earlier).toBe(4)
  })
})

describe('links back to Hoy', () => {
  it('adds the return protocol to any local path', () => {
    expect(withReturn('/posapp/')).toBe(
      '/posapp/?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
    expect(withReturn('/compras/nueva?x=1')).toContain('x=1&return_to=')
  })

  it('opens an event in the Agenda day view with the calendars Hoy read', () => {
    const link = eventLink(
      { source: 'Patient Appointment', id: 'APP-1' },
      '2026-10-08',
      ['Event', 'Patient Appointment'],
    )
    const url = new URL(link, 'https://x.invalid')
    expect(url.pathname).toBe('/agenda')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: 'day',
      date: '2026-10-08',
      event: 'Patient Appointment:APP-1',
      cal: 'Event,Patient Appointment',
      return_to: '/crm/hoy',
      return_label: 'Hoy',
    })
    expect(eventLink(null, '2026-10-08', ['Event'])).not.toContain('cal=')
  })
})

describe('Para ahora', () => {
  it('lists overdue before due today and knows when there is more', () => {
    const section = {
      available: true,
      overdue: { rows: [{ name: 'A' }], has_more: false },
      today: { rows: [{ name: 'B' }], has_more: true },
    }
    expect(dueRows(section).map((row) => row.name)).toEqual(['A', 'B'])
    expect(dueMore(section)).toBe(true)
    expect(dueRows({ available: false })).toEqual([])
  })
})

describe('continuarCards', () => {
  it('turns each reported source into a card that opens its app and comes back', () => {
    const cards = continuarCards(
      {
        items: [
          {
            key: 'pos',
            opened_at: '2026-10-08T15:05:00Z',
            pos_profile: 'Mostrador',
            url: '/posapp/',
          },
          {
            key: 'taller',
            count: 2,
            capped: false,
            url: '/taller/orders',
            rows: [
              {
                name: 'RO-1',
                title: 'iPhone 13 · Pantalla',
                status: 'En Trabajo',
                url: '/taller/orders/RO-1',
              },
            ],
          },
          { key: 'clinica', waiting: 1, active: 3, url: '/clinica/reception' },
        ],
        sources: [
          {
            key: 'taller.unassigned_repairs',
            label: 'Reparaciones sin asignar',
            count: 4,
            url: '/taller/monitor',
            rows: [
              { name: 'RO-9', title: 'Moto G', url: '/taller/orders/RO-9' },
            ],
            action: { label: 'Asignar', method: 'taller.api.hoy.assign' },
          },
        ],
      },
      {
        drafts: [{ key: 'k', title: 'New contact', to: '/contactos?create=1' }],
        timeZone: 'America/Mazatlan',
        locale: 'es-MX',
      },
    )
    expect(cards.map((card) => card.key)).toEqual([
      'pos',
      'taller',
      'clinica',
      'taller.unassigned_repairs',
      'drafts',
    ])
    expect(cards[0].href).toBe(withReturn('/posapp/'))
    expect(cards[0].detail).toContain('Mostrador')
    expect(cards[1].rows[0].href).toBe(withReturn('/taller/orders/RO-1'))
    expect(cards[3].source.action.method).toBe('taller.api.hoy.assign')
    expect(cards[4].rows[0].to).toBe('/contactos?create=1')
  })

  it('a source with nothing to do draws no card', () => {
    expect(
      continuarCards({
        items: [],
        sources: [{ key: 'q', label: 'Cola', count: 0, rows: [] }],
      }),
    ).toEqual([])
  })

  it('draws nothing for sources the server did not report', () => {
    expect(continuarCards({ items: [], sources: [] })).toEqual([])
    expect(continuarCards(null)).toEqual([])
  })
})

describe('scanDrafts', () => {
  const storage = (entries) => {
    const map = new Map(Object.entries(entries))
    return Object.assign(Object.fromEntries(map), {
      getItem: (key) => map.get(key) ?? null,
    })
  }

  it('lists dirty Contactos drafts and my Compras drafts, newest first', () => {
    const rows = scanDrafts(
      storage({
        'contactos:s|ana:draft:note:customer:CUST-1': JSON.stringify({
          dirty: true,
          savedAt: 1,
        }),
        'contactos:s|ana:draft:identity:new:new': JSON.stringify({
          dirty: true,
          savedAt: 3,
        }),
        'contactos:s|ana:draft:tag:customer:CUST-2': JSON.stringify({
          dirty: false,
        }),
        'contactos:s|otro:draft:note:customer:CUST-3': JSON.stringify({
          dirty: true,
        }),
        'muelle:compras:draft:ana@x:PO-1': JSON.stringify({ at: 2, form: {} }),
        'muelle:compras:draft:otro@x:PO-2': JSON.stringify({ at: 9, form: {} }),
        'muelle:compras:draft:ana@x:broken': '{',
      }),
      { scope: 's|ana', user: 'ana@x' },
    )
    expect(rows.map((row) => row.to)).toEqual([
      '/contactos?create=1',
      '/compras/orden/PO-1',
      '/contactos/customer/CUST-1',
    ])
  })
})

describe('accesos', () => {
  const boot = (modules) => ({ modules })
  const on = (capabilities) => ({ enabled: true, capabilities })

  it('offers only what the boot allows, at most six', () => {
    const items = accesos(
      boot({
        pendientes: on({ read: true, create: true }),
        agenda: on({ read: true, create: false }),
        contactos: on({ read: true, create: true }),
        compras: { enabled: false, capabilities: { create: true } },
      }),
    )
    expect(items.map((item) => item.key)).toEqual([
      'pendientes.create',
      'contactos.create',
    ])
    expect(items[0].to).toContain('return_to=%2Fcrm%2Fhoy')
    const all = Object.fromEntries(
      [
        'pendientes',
        'agenda',
        'contactos',
        'compras',
        'garantias',
        'cobranza',
        'gastos',
        'archivos',
      ].map((key) => [key, on({ read: true, create: true })]),
    )
    expect(accesos(boot(all))).toHaveLength(ACCESOS_LIMIT)
    expect(accesos(null)).toEqual([])
  })
})

describe('where Muelle opens', () => {
  it('offers automatic, Hoy and the modules the worker has', () => {
    const options = landingOptions([
      { key: 'hoy', label: 'Hoy' },
      { key: 'pendientes', label: 'Pendientes' },
      { key: 'avisos', label: 'Avisos' },
      { key: 'ventas', label: 'Ventas' },
    ])
    expect(options.map((option) => option.value)).toEqual([
      '',
      'hoy',
      'pendientes',
      'ventas',
    ])
  })
})

describe('header copy', () => {
  it('greets by the shop clock and names the day', () => {
    expect(greeting(new Date('2026-10-08T15:00:00Z'), 'America/Mazatlan')).toBe(
      'Good morning',
    )
    expect(greeting(new Date('2026-10-09T03:00:00Z'), 'America/Mazatlan')).toBe(
      'Good evening',
    )
    expect(dayTitle('2026-10-08', 'es-MX')).toBe('jueves, 8 de octubre')
    expect(dayTitle('bad', 'es-MX')).toBe('')
  })
})

describe('pull-to-refresh', () => {
  it('resists the finger and needs the threshold', () => {
    expect(pullDistance(-10)).toBe(0)
    expect(pullDistance(100)).toBe(50)
    expect(pullDistance(1000)).toBeLessThanOrEqual(96)
    expect(pullDistance(2 * PULL_THRESHOLD)).toBe(PULL_THRESHOLD)
  })
})

describe('prefetch', () => {
  it('starts one read with the boot and hands it over once', async () => {
    call.mockClear()
    prefetchHoy()
    prefetchHoy()
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('crm.api.hoy.page')
    expect(takeHoy()).toBeTruthy()
    expect(takeHoy()).toBeNull()
  })
})
