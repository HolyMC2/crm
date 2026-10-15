// Hoy reads once per render (the live hub's first-connect resync is answered by
// the read in flight) and lists the seller's deals without a next step.
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(() => Promise.resolve({})),
}))

import {
  RESYNC_FRESH_MS,
  createReadGate,
  followUpQueueLink,
  followUpRows,
} from '@/composables/useHoy'

function clock(start = 1000) {
  let t = start
  return { now: () => t, tick: (ms) => (t += ms) }
}

describe('createReadGate', () => {
  it('drops the first-connect resync while the first read is in flight', () => {
    const c = clock()
    const gate = createReadGate({ now: c.now })
    gate.start()
    expect(gate.admit({ reason: 'resync', full: true, names: [] })).toBe(false)
    expect(gate.end()).toBe(false)
  })

  it('drops a resync that lands just after a read, admits a later one', () => {
    const c = clock()
    const gate = createReadGate({ now: c.now })
    gate.start()
    gate.end()
    c.tick(RESYNC_FRESH_MS - 1)
    expect(gate.admit({ reason: 'resync' })).toBe(false)
    expect(gate.admit({ reason: 'reconcile' })).toBe(false)
    c.tick(1)
    expect(gate.admit({ reason: 'resync' })).toBe(true)
  })

  it('a real change mid-read reloads exactly once after the read', () => {
    const gate = createReadGate({ now: clock().now })
    gate.start()
    expect(gate.admit({ reason: 'change', names: ['T-1'] })).toBe(false)
    expect(gate.admit({ reason: 'change', names: ['T-2'] })).toBe(false)
    expect(gate.end()).toBe(true)
    gate.start()
    expect(gate.end()).toBe(false)
  })

  it('a change with no read in flight reads now; so does an unlabelled push', () => {
    const gate = createReadGate({ now: clock().now })
    gate.start()
    gate.end()
    expect(gate.admit({ reason: 'change' })).toBe(true)
    expect(gate.admit()).toBe(true)
  })

  it('overlapping reads owe the reload only when the last one ends', () => {
    const gate = createReadGate({ now: clock().now })
    gate.start()
    gate.start()
    gate.admit({ reason: 'change' })
    expect(gate.end()).toBe(false)
    expect(gate.end()).toBe(true)
  })
})

describe('deals without a next step', () => {
  const section = {
    available: true,
    count: { value: 2, capped: false },
    rows: [
      { name: 'CRM-DEAL-1', title: 'iPhone 12 — Ana', status: 'Approved' },
      { name: 'CRM DEAL/2', title: 'Juan', status: null },
    ],
    view: 40,
  }

  it('each row opens its deal and returns to Hoy', () => {
    const rows = followUpRows(section)
    expect(rows.map((row) => row.to)).toEqual([
      '/deals/CRM-DEAL-1?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
      '/deals/CRM%20DEAL%2F2?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    ])
    expect(rows[0].title).toBe('iPhone 12 — Ana')
  })

  it('«See all» opens the list queue, else the deals list', () => {
    expect(followUpQueueLink(section)).toBe(
      '/deals/view/list?view=40&return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
    expect(followUpQueueLink({ ...section, view: null })).toBe(
      '/deals?return_to=%2Fcrm%2Fhoy&return_label=Hoy',
    )
  })

  it('no section for someone who sells nothing', () => {
    expect(followUpRows({ available: false })).toEqual([])
    expect(followUpRows(undefined)).toEqual([])
    expect(followUpQueueLink({ available: false })).toBe(null)
  })
})

describe('es-MX catalog', () => {
  it('translates every string the follow-up section shows', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, resolve } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Set(
      [
        ...po.matchAll(
          /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "(?:[^"\\]|\\.)+"/gm,
        ),
      ].map((m) => m[1]),
    )
    for (const text of [
      'Deals without a next step',
      'Every open deal of yours has a next step.',
      'Schedule',
      'See all',
    ])
      expect(catalog.has(text), text).toBe(true)
  })
})
