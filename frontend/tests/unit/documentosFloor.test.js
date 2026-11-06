// The generic floor reads a doctype from its meta: the row carries the fields
// Desk lists («Entrada · hoy 09:02»), the chips come from its status or its
// confirmation, the facets become «Filtros» and the summary's groups, and a
// document that is never confirmed never reads «Borrador».
import { describe, expect, it } from 'vitest'
import {
  cellText,
  facetGroups,
  facetOptions,
  floorChips,
  floorProfile,
} from '@/documentos/profiles/_floor'
import { docStatus, genericProfile } from '@/documentos/profiles/_generic'

const NOW = new Date(2026, 10, 6, 12, 58) // vie 6 nov 2026

// Employee Checkin as `floor` describes it: titled by the employee's name, no
// draft, the moment is «time», the row lists the log type, filtered by employee.
const CHECKIN = {
  label: 'Registro de entrada',
  submittable: false,
  title: ['employee_name'],
  date: { fieldname: 'time', fieldtype: 'Datetime', label: 'Hora' },
  status: null,
  columns: [
    {
      fieldname: 'log_type',
      label: 'Tipo de registro',
      fieldtype: 'Select',
      options: null,
      // What the server sends: Frappe's literal translation of IN/OUT.
      choices: { IN: 'EN', OUT: 'FUERA' },
    },
  ],
  facets: [
    {
      fieldname: 'log_type',
      label: 'Tipo de registro',
      fieldtype: 'Select',
      options: null,
    },
    {
      fieldname: 'employee',
      label: 'Empleado',
      fieldtype: 'Link',
      options: 'Employee',
    },
  ],
}

const checkinRow = (over = {}) => ({
  name: 'EMP-CKIN-11-2026-000017',
  title: 'Jennifer Corona',
  status: null,
  docstatus: 0,
  amount: null,
  currency: null,
  date: '2026-11-06 09:02:11.000000',
  fields: {
    employee: 'HR-EMP-00003',
    employee_name: 'Jennifer Corona',
    log_type: 'IN',
    time: '2026-11-06 09:02:11.000000',
  },
  titles: {},
  ...over,
})

describe('a floor row', () => {
  it('names the record, lists what Desk lists and ends with the moment', () => {
    const profile = floorProfile(CHECKIN)
    const row = profile.row(checkinRow(), {
      doctype: 'Employee Checkin',
      now: NOW,
    })
    expect(row.title).toBe('Jennifer Corona')
    // The shell's word wins over the server's literal «EN».
    expect(row.subtitle).toBe('Entrada')
    expect(row.meta).toBe('hoy 09:02')
    expect(row.status).toBe('')
    expect(row.subtitle).not.toContain('Borrador')
    expect(row.subtitle).not.toContain('EMP-CKIN')
  })

  it('keeps the ID off the line when a cell says more, and shows it only alone', () => {
    const bare = floorProfile({ ...CHECKIN, columns: [], date: null })
    const row = bare.row(checkinRow({ date: null }), {
      doctype: 'Employee Checkin',
      now: NOW,
    })
    expect(row.subtitle).toBe('EMP-CKIN-11-2026-000017')
    expect(row.meta).toBe('')
  })

  it('leads with the status and puts the amount at the end, the date on the line', () => {
    const profile = floorProfile({
      submittable: true,
      title: ['customer_name'],
      date: { fieldname: 'posting_date', fieldtype: 'Date', label: 'Fecha' },
      status: [
        { value: 'Open', label: 'Open' },
        { value: 'Closed', label: 'Closed' },
      ],
      columns: [
        {
          fieldname: 'territory',
          label: 'Territorio',
          fieldtype: 'Link',
          options: 'Territory',
        },
        { fieldname: 'qty', label: 'Cantidad', fieldtype: 'Float' },
        { fieldname: 'is_vip', label: 'VIP', fieldtype: 'Check' },
      ],
      facets: [],
    })
    const row = profile.row(
      {
        name: 'X-1',
        title: 'Ana López',
        status: 'Open',
        docstatus: 1,
        amount: 1500,
        currency: 'MXN',
        date: '2026-11-05',
        fields: { territory: 'MX-NORTE', qty: 1250.5, is_vip: 1 },
        titles: { territory: 'Norte' },
      },
      { doctype: 'Custom Thing', now: NOW },
    )
    expect(row.subtitle).toBe('Abierta · ayer · Norte · 1,250.5 · VIP')
    expect(row.subtitleLines).toBe(2)
    expect(row.meta).toBe('$1,500.00')
    expect(row.status).toBe('Open')
  })

  it('reads each kind of cell in the worker’s words and skips what says nothing', () => {
    const row = {
      fields: {
        shift: 'SHIFT-0001',
        kind: 'OUT',
        when: '2026-11-05 18:30:00',
        day: '2026-11-06',
        at: '08:15:00',
        price: 99.5,
        pct: 12.345,
        done: 0,
        note: 'Llamar   el lunes',
        ref: 'EMP-CKIN-11-2026-000017',
        empty: '',
      },
      titles: {},
      currency: 'MXN',
    }
    const cell = (col) => cellText(col, row, { now: NOW })
    // A link with no title the worker may read is no cell: never a stored key.
    expect(cell({ fieldname: 'shift', fieldtype: 'Link' })).toBe('')
    expect(
      cellText(
        { fieldname: 'shift', fieldtype: 'Link' },
        { ...row, titles: { shift: 'Turno matutino' } },
      ),
    ).toBe('Turno matutino')
    expect(
      cell({
        fieldname: 'kind',
        fieldtype: 'Select',
        choices: { OUT: 'FUERA' },
      }),
    ).toBe('Salida')
    expect(
      cell({
        fieldname: 'kind',
        fieldtype: 'Select',
        choices: { OUT: 'Fuera de turno' },
      }),
    ).toBe('Salida')
    expect(
      cellText(
        { fieldname: 'kind', fieldtype: 'Select', choices: { X: 'Equis' } },
        { fields: { kind: 'X' }, titles: {} },
      ),
    ).toBe('Equis')
    expect(cell({ fieldname: 'when', fieldtype: 'Datetime' })).toBe(
      'ayer 18:30',
    )
    expect(cell({ fieldname: 'day', fieldtype: 'Date' })).toBe('hoy')
    expect(cell({ fieldname: 'at', fieldtype: 'Time' })).toBe('08:15')
    expect(cell({ fieldname: 'price', fieldtype: 'Currency' })).toBe('$99.50')
    expect(cell({ fieldname: 'pct', fieldtype: 'Percent' })).toBe('12.35 %')
    expect(
      cell({ fieldname: 'done', fieldtype: 'Check', label: 'Hecho' }),
    ).toBe('')
    expect(cell({ fieldname: 'note', fieldtype: 'Small Text' })).toBe(
      'Llamar el lunes',
    )
    expect(cell({ fieldname: 'ref', fieldtype: 'Data' })).toBe('')
    expect(cell({ fieldname: 'empty', fieldtype: 'Data' })).toBe('')
    expect(cell({ fieldname: 'missing', fieldtype: 'Data' })).toBe('')
  })
})

describe('a document that is never confirmed', () => {
  it('is no draft, in the generic row and header either', () => {
    expect(docStatus({ docstatus: 0 })).toBe('Draft')
    expect(docStatus({ docstatus: 0 }, { submittable: false })).toBe('')
    expect(
      docStatus({ docstatus: 0, status: 'Open' }, { submittable: false }),
    ).toBe('Open')
    const row = genericProfile.row(
      { name: 'EMP-CKIN-1', title: 'Jennifer Corona', docstatus: 0 },
      { doctype: 'Employee Checkin', submittable: false },
    )
    expect(row.status).toBe('')
    expect(row.subtitle).not.toContain('Borrador')
    const header = genericProfile.header({
      doctype: 'Employee Checkin',
      name: 'EMP-CKIN-1',
      submittable: false,
      header: { title: 'Jennifer Corona', docstatus: 0 },
    })
    expect(header.status).toBe('')
    const draft = genericProfile.header({
      doctype: 'Sales Invoice',
      name: 'ACC-SINV-1',
      submittable: true,
      header: { title: 'Ana López', docstatus: 0 },
    })
    expect(draft.status).toBe('Draft')
  })
})

describe('the floor chips and filters', () => {
  it('chip by status when there is one, by confirmation when confirmed, else none', () => {
    const byStatus = floorChips({
      status: [
        { value: 'Open', label: 'Open' },
        { value: 'Closed', label: 'Closed' },
        { value: 'En revisión', label: 'En revisión' },
      ],
    })
    expect(byStatus.map((c) => c.label)).toEqual([
      'Todos',
      'Abierta',
      'Cerrada',
      'En revisión',
    ])
    expect(byStatus[3].value).toBe('en-revision')
    expect(byStatus[1].filters).toEqual([['status', '=', 'Open']])
    const confirmed = floorChips({ submittable: true })
    expect(confirmed.map((c) => c.label)).toEqual([
      'Todos',
      'Borradores',
      'Confirmados',
      'Cancelados',
    ])
    expect(floorChips({ submittable: false })).toEqual([])
  })

  it('turns the facets into «Filtros» and adds the date as periods', () => {
    const profile = floorProfile(CHECKIN)
    expect(profile.chips).toEqual([])
    expect(profile.filterFields.map((f) => f.fieldname)).toEqual([
      'log_type',
      'employee',
      'time',
    ])
    expect(profile.filterFields[2]).toMatchObject({
      kind: 'period',
      field: 'time',
      label: 'Hora',
    })
    expect(profile.sorts.map((s) => s.value)).toContain('employee_name asc')
  })

  it('drops the status facet when the status chips already count it', () => {
    const profile = floorProfile({
      submittable: false,
      status: [{ value: 'Open', label: 'Open' }],
      facets: [
        { fieldname: 'status', label: 'Estado', fieldtype: 'Select' },
        { fieldname: 'priority', label: 'Prioridad', fieldtype: 'Select' },
      ],
    })
    expect(profile.facets.map((f) => f.fieldname)).toEqual(['priority'])
  })

  it('fills a facet’s options from the counts and keeps the picked value', () => {
    const counts = {
      employee: {
        values: [
          { value: 'HR-EMP-00003', label: 'Jennifer Corona', count: 812 },
          { value: 'HR-EMP-00001', label: 'Teresa Rubí', count: 803 },
        ],
        more: false,
      },
    }
    const field = { fieldname: 'employee', fieldtype: 'Link', facet: true }
    expect(facetOptions(field, counts, '')).toEqual([
      { value: 'HR-EMP-00003', label: 'Jennifer Corona', count: 812 },
      { value: 'HR-EMP-00001', label: 'Teresa Rubí', count: 803 },
    ])
    expect(facetOptions(field, counts, 'HR-EMP-00009').at(-1)).toEqual({
      value: 'HR-EMP-00009',
      label: 'HR-EMP-00009',
    })
    expect(facetOptions(field, {}, '')).toEqual([])
  })

  it('groups the summary by facet with each value’s share of the largest', () => {
    const groups = facetGroups(
      CHECKIN.facets,
      {
        log_type: {
          values: [
            { value: 'IN', label: 'EN', count: 812 },
            { value: 'OUT', label: 'FUERA', count: 406 },
          ],
          more: false,
        },
      },
      { log_type: 'OUT' },
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].values.map((v) => v.label)).toEqual(['Entrada', 'Salida'])
    expect(groups[0]).toMatchObject({
      fieldname: 'log_type',
      label: 'Tipo de registro',
      selected: 'OUT',
      more: false,
    })
    expect(groups[0].values.map((v) => v.share)).toEqual([1, 0.5])
  })
})
