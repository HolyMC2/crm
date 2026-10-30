// «En el almacén» on a supplier bill: what Escáner offers for its goods, and
// where each row goes (always with the way back to the bill).
import { describe, expect, it } from 'vitest'
import {
  inboundState,
  scannerHref,
  taskKind,
  warehouseRows,
} from '@/components/gastos/billAlmacen'

const back = { to: '/crm/gastos/factura/PI-1', label: 'Gastos' }
const data = (extra = {}) => ({
  stock: true,
  update_stock: true,
  scanner: true,
  can_open: true,
  receipts: [],
  warehouses: ['Tienda - GD'],
  receive: { allowed: true, code: null, reason: null },
  inbounds: [],
  tasks: [],
  ...extra,
})
const rows = (extra, opts = {}) =>
  warehouseRows(data(extra), { bill: 'PI-1', back, ...opts })

describe('bill warehouse rows', () => {
  it('a registered bill with stock offers «Verify and put away» in Escáner', () => {
    const [row] = rows()
    expect(row.title).toBe('Verify and put away')
    expect(row.step).toBe(true)
    const url = new URL(row.href, 'https://x.invalid')
    expect(url.pathname).toBe('/scan/inbound')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source_doctype: 'Purchase Invoice',
      source_name: 'PI-1',
      warehouse: 'Tienda - GD',
      return_to: '/crm/gastos/factura/PI-1',
      return_label: 'Gastos',
    })
  })

  it('one row per warehouse when the goods go to several', () => {
    const list = rows({ warehouses: ['A', 'B'] }).filter((r) => r.step)
    expect(list.map((r) => r.subtitle)).toEqual(['A', 'B'])
  })

  it('a started receiving opens itself instead, with where it stands', () => {
    const list = rows({
      inbounds: [
        {
          name: 'SIN-1',
          status: 'Open',
          warehouse: 'Tienda - GD',
          verified: true,
          assigned_to: 'Ana López',
        },
      ],
    })
    expect(list.some((r) => r.step)).toBe(false)
    expect(list[0].subtitle).toBe(
      'Verified, to put away · Tienda - GD · Ana López',
    )
    expect(list[0].href).toMatch(/^\/scan\/inbound\/SIN-1\?return_to=/)
  })

  it('without a manager it says why and offers to ask one', () => {
    const [row] = rows({
      receive: { allowed: false, code: 'manager', reason: 'Ask a manager.' },
    })
    expect(row.href).toBeUndefined()
    expect(row.reason).toBe('Ask a manager.')
    expect(row.ask).toBe(true)
  })

  it('a draft says to register it first, with no ask (the hero has the step)', () => {
    const [row] = rows({
      receive: { allowed: false, code: 'draft', reason: 'Register first.' },
    })
    expect(row.reason).toBe('Register first.')
    expect(row.ask).toBe(false)
  })

  it('without the scanner role nothing links into Escáner and it says who to ask', () => {
    const list = rows({
      can_open: false,
      tasks: [{ name: 'T-1', task_type: 'count', status: 'Open' }],
    })
    expect(list.every((r) => !r.href)).toBe(true)
    expect(list[0].reason).toMatch(/scanner user role/)
  })

  it('open tasks name their kind and link to Escáner', () => {
    const task = rows({
      tasks: [
        {
          name: 'ST-7',
          task_type: 'putaway',
          status: 'In Progress',
          assigned_to: 'Ana',
        },
      ],
    }).find((r) => r.key === 'task:ST-7')
    expect(task.title).toBe('Put away')
    expect(task.subtitle).toBe('In progress · Ana')
    expect(task.href).toMatch(/^\/scan\/tasks\/ST-7\?/)
  })

  it('a bill that does not move stock points to its receipts', () => {
    expect(
      rows({ update_stock: false, receive: null }).map((r) => r.key),
    ).toEqual(['sin-recepcion'])
    const list = rows({
      update_stock: false,
      receive: null,
      receipts: [{ name: 'PR-1', docstatus: 1 }],
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      receipt: 'PR-1',
      subtitle: 'Goods received',
    })
  })

  it('labels come last, only when asked for', () => {
    expect(rows({}, { labels: true }).at(-1)).toMatchObject({
      key: 'etiquetas',
      labels: true,
    })
    expect(rows().some((r) => r.labels)).toBe(false)
  })

  it('services only (no stock): no section at all', () => {
    expect(rows({ stock: false }, { labels: true })).toEqual([])
    expect(warehouseRows(null, { bill: 'PI-1' })).toEqual([])
  })

  it('words for states and kinds', () => {
    expect(inboundState({ status: 'Open', verified: false })).toBe('To verify')
    expect(inboundState({ status: 'Completed' })).toBe('Put away')
    expect(taskKind('count')).toBe('Count')
    expect(taskKind('nuevo')).toBe('Task')
    expect(scannerHref('/tasks', {})).toBe('/scan/tasks')
  })
})
