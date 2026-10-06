import { describe, expect, it } from 'vitest'
import {
  countText,
  datePresets,
  dueText,
  legacyTasksRoute,
  parseQuery,
  pendienteError,
  pendienteRoute,
  queueArgs,
  referenceTarget,
  segmentEntries,
  sourceFromSlug,
  toQuery,
} from '@/composables/usePendientes'
import { isNeutralModule } from '@/composables/muelleShell'

describe('Pendientes URL state', () => {
  it('round-trips list state and drops defaults', () => {
    const state = parseQuery({
      segment: 'today',
      q: ' cotización ',
      source: 'CRM Task',
      priority: 'High',
      from: '2026-10-01',
      to: '2026-10-07',
    })
    expect(state).toEqual({
      segment: 'today',
      q: 'cotización',
      source: 'CRM Task',
      priority: 'High',
      from: '2026-10-01',
      to: '2026-10-07',
    })
    expect(toQuery(state)).toEqual({
      segment: 'today',
      q: 'cotización',
      source: 'CRM Task',
      priority: 'High',
      from: '2026-10-01',
      to: '2026-10-07',
    })
    expect(toQuery(parseQuery({}))).toEqual({})
  })
  it('rejects unknown segments, sources and malformed dates', () => {
    expect(
      parseQuery({
        segment: 'everything',
        source: 'Event',
        priority: 'Urgent',
        from: '01/10/2026',
        q: ['a'],
      }),
    ).toEqual({
      segment: 'mine',
      q: '',
      source: 'all',
      priority: '',
      from: '',
      to: '',
    })
  })
  it('maps state to the queue service arguments', () => {
    expect(queueArgs(parseQuery({ segment: 'done', q: 'x' }), 30)).toEqual({
      segment: 'done',
      search: 'x',
      source: 'all',
      priority: '',
      date_from: '',
      date_to: '',
      start: 30,
      page_length: 30,
    })
  })
  it('hides the sales team list without CRM task access', () => {
    expect(segmentEntries().map((e) => e.value)).not.toContain('team')
    expect(segmentEntries({ team: true }).map((e) => e.value)).toContain('team')
  })
})

describe('Pendientes routes', () => {
  it('redirects both CRM task lists into Pendientes', () => {
    expect(legacyTasksRoute({ path: '/tasks', query: {} })).toEqual({
      name: 'Pendientes',
      query: {},
    })
    expect(
      legacyTasksRoute({ path: '/tasks/view/kanban', query: { view: 'V' } }),
    ).toEqual({ name: 'Pendientes', query: { segment: 'team' } })
  })
  it('opens the linked CRM Task a legacy link selected, keeping its scope', () => {
    // LinkedDocsListView still links /crm/tasks/view?open=<task>.
    expect(
      legacyTasksRoute({ path: '/tasks/view', query: { open: '73' } }),
    ).toEqual({
      name: 'Pendiente',
      params: { source: 'crm-task', name: '73' },
      query: { list: 'segment=team' },
    })
    expect(legacyTasksRoute({ path: '/tasks', query: { open: '9' } })).toEqual({
      name: 'Pendiente',
      params: { source: 'crm-task', name: '9' },
      query: {},
    })
    expect(
      legacyTasksRoute({ path: '/tasks/view', query: { open: '../x' } }),
    ).toEqual({ name: 'Pendientes', query: { segment: 'team' } })
  })
  it('keeps the native source in the record URL', () => {
    expect(
      pendienteRoute({ doctype: 'CRM Task', name: 42 }, { list: 'q=a' }),
    ).toEqual({
      name: 'Pendiente',
      params: { source: 'crm-task', name: '42' },
      query: { list: 'q=a' },
    })
    expect(sourceFromSlug('todo')).toBe('ToDo')
    expect(sourceFromSlug('event')).toBeUndefined()
  })
  it('opens linked records in their owning module', () => {
    expect(
      referenceTarget({ reference_type: 'Customer', reference_name: 'C 1' }),
    ).toEqual({
      to: { name: 'Contacto', params: { source: 'customer', name: 'C 1' } },
    })
    expect(
      referenceTarget({ reference_type: 'CRM Deal', reference_name: 'D-1' }),
    ).toEqual({ to: { name: 'Deal 360', params: { dealId: 'D-1' } } })
    expect(
      referenceTarget({
        reference_type: 'Sales Invoice',
        reference_name: 'SINV/1',
      }),
    ).toEqual({ href: '/app/sales-invoice/SINV%2F1' })
    expect(referenceTarget({ reference_type: null })).toBeNull()
  })
  it('treats Pendientes as a neutral shell module', () => {
    expect(isNeutralModule('pendientes')).toBe(true)
    expect(isNeutralModule('ventas')).toBe(false)
  })
})

describe('Pendientes due language', () => {
  const today = '2026-10-05'
  it('offers presets from the shop date, not the browser clock', () => {
    expect(datePresets(today).map((p) => p.value)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-08',
      '2026-10-12',
    ])
    expect(datePresets('')).toEqual([])
  })
  it('describes due dates relative to today', () => {
    expect(dueText({ status: 'Open', date: '2026-10-05' }, today)).toBe('Today')
    expect(dueText({ status: 'Open', date: '2026-10-06' }, today)).toBe(
      'Tomorrow',
    )
    expect(dueText({ status: 'Open', date: '2026-10-04' }, today)).toBe(
      'Overdue · yesterday',
    )
    expect(dueText({ status: 'Open', date: '2026-10-01' }, today)).toBe(
      'Overdue · 4 days',
    )
    expect(dueText({ status: 'Open', date: '2026-10-15' }, today)).toBe(
      'In 10 days',
    )
    expect(dueText({ status: 'Open', date: null }, today)).toBe('No date')
    expect(dueText({ status: 'Closed', cancelled: true }, today)).toBe(
      'Cancelled',
    )
  })
  it('never presents a capped count as a total', () => {
    expect(countText({ value: 99, capped: true })).toBe('99+')
    expect(countText({ value: 3, capped: false })).toBe('3')
    expect(countText(null)).toBe('')
  })
  it('turns a version conflict into a reload action', () => {
    const error = Object.assign(new Error('El pendiente cambió.'), {
      exc_type: 'TimestampMismatchError',
    })
    expect(pendienteError(error).kind).toBe('conflict')
    const denied = Object.assign(
      new Error('Solo puedes cambiar tus propios pendientes.'),
      {
        exc_type: 'PermissionError',
      },
    )
    expect(pendienteError(denied)).toMatchObject({
      kind: 'permission',
      detail: 'Solo puedes cambiar tus propios pendientes.',
    })
  })
})
