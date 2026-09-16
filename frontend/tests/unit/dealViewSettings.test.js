// A saved view of this list is a "CRM View Settings" row. Two things must hold:
// it round-trips this list's whole context, and it stays safe to open in the
// classic list, which feeds `filters`, `order_by`, `columns`, `rows` and
// `group_by_field` straight to frappe.get_list.
import { describe, expect, it } from 'vitest'
import {
  DEAL_VIEW_DOCTYPE,
  DEAL_VIEW_ROUTE,
  dealListViews,
  filtersToContext,
  isDealListView,
  viewContext,
  viewFilters,
  viewPayload,
} from '@/utils/dealViewSettings'

const CONTEXT = {
  status: ['Aprobado', 'Por Contactar'],
  source: ['WhatsApp'],
  owner: ['ana@example.invalid'],
  followUp: 'overdue',
  search: 'pantalla',
  view: 'board',
  groupBy: 'repair_status',
  sort: { field: 'next_activity_at', dir: 'asc' },
  columns: ['customer', 'phone', 'next_activity'],
}
// what the server hands back for the payload above
const asRow = (payload, extra = {}) => ({ ...payload, name: 12, dt: DEAL_VIEW_DOCTYPE, ...extra })

describe('what a saved view stores', () => {
  it('writes the multi-selects as Frappe filters and the sort as an order by', () => {
    const payload = viewPayload(CONTEXT, { label: 'Vencidos de Ana' })
    expect(payload.filters).toEqual({
      status: ['in', ['Aprobado', 'Por Contactar']],
      source: ['in', ['WhatsApp']],
      deal_owner: ['in', ['ana@example.invalid']],
    })
    expect(payload.order_by).toBe('next_activity_at asc')
    expect([payload.type, payload.doctype, payload.route_name]).toEqual(['list', DEAL_VIEW_DOCTYPE, DEAL_VIEW_ROUTE])
  })
  it('omits an empty selection instead of storing an `in` that matches nothing', () => {
    expect(viewFilters({ status: [], source: [], owner: [] })).toEqual({})
    expect(viewFilters({})).toEqual({})
  })
  it('only lets a real CRM Deal column reach group_by_field', () => {
    // the classic list adds group_by_field to the fields it selects
    expect(viewPayload({ ...CONTEXT, groupBy: 'repair_status' }, { label: 'X' }).group_by_field).toBe('')
    expect(viewPayload({ ...CONTEXT, groupBy: 'status' }, { label: 'X' }).group_by_field).toBe('status')
    expect(viewPayload({ ...CONTEXT, groupBy: 'deal_owner' }, { label: 'X' }).group_by_field).toBe('deal_owner')
  })
  it('leaves columns and rows to the classic list defaults', () => {
    const payload = viewPayload(CONTEXT, { label: 'X' })
    expect(payload.columns).toEqual([])
    expect(payload.rows).toEqual([])
  })
  it('carries the name only when an existing view is being updated', () => {
    expect('name' in viewPayload(CONTEXT, { label: 'X' })).toBe(false)
    expect(viewPayload(CONTEXT, { label: 'X', name: 12 }).name).toBe(12)
  })
})

describe('what a saved view restores', () => {
  it('round-trips the whole list context', () => {
    const context = viewContext(asRow(viewPayload(CONTEXT, { label: 'Vencidos de Ana' })))
    expect(context).toEqual(CONTEXT)
  })
  it('survives the server handing the JSON columns back as strings', () => {
    const payload = viewPayload(CONTEXT, { label: 'X' })
    const stored = asRow({ ...payload, filters: JSON.stringify(payload.filters) })
    expect(viewContext(stored).status).toEqual(['Aprobado', 'Por Contactar'])
  })
  it('falls back to this list’s defaults for anything missing or unknown', () => {
    const context = viewContext({ name: 3, route_name: DEAL_VIEW_ROUTE, kanban_fields: '{"doco_deal_list":1,"followUp":"gone","view":"gantt","groupBy":"currency","columns":[1,"phone"]}' })
    expect(context).toEqual({
      status: [], source: [], owner: [],
      followUp: 'all', search: '', view: 'list', groupBy: 'none',
      sort: { field: 'modified', dir: 'desc' },
      columns: ['phone'],
    })
  })
  it('reads a single value written by the classic list as one selection', () => {
    expect(filtersToContext({ status: 'Aprobado', deal_owner: ['in', ['ana@example.invalid']] })).toEqual({
      status: ['Aprobado'], source: [], owner: ['ana@example.invalid'],
    })
    expect(filtersToContext('not json')).toEqual({ status: [], source: [], owner: [] })
  })
})

describe('which rows belong to this list', () => {
  const mine = asRow(viewPayload(CONTEXT, { label: 'Mía' }))
  const classic = { name: 4, label: 'Upstream', route_name: 'Deals', filters: '{}', kanban_fields: '[]' }

  it('claims only the rows this list wrote', () => {
    expect(isDealListView(mine)).toBe(true)
    expect(isDealListView(classic)).toBe(false)
    expect(isDealListView({ ...mine, kanban_fields: '[]' })).toBe(false)
    expect(isDealListView(null)).toBe(false)
  })
  it('leaves the classic list’s own views where they were made', () => {
    expect(dealListViews([mine, classic, null]).map((v) => v.label)).toEqual(['Mía'])
    expect(dealListViews(undefined)).toEqual([])
  })
})
