import { describe, expect, it } from 'vitest'
import {
  chipToneClass,
  columnFromOption,
  isVirtualKey,
  mergeColumnOptions,
  normalizeVirtualColumns,
  resolveChip,
  virtualText,
  withoutVirtual,
} from '@/utils/listColumns'

describe('virtual column keys', () => {
  it('recognises only the _v_ prefix', () => {
    expect(isVirtualKey('_v_next_step')).toBe(true)
    expect(isVirtualKey('next_step')).toBe(false)
    expect(isVirtualKey('_assign')).toBe(false)
    expect(isVirtualKey(null)).toBe(false)
  })

  it('drops virtual keys from filter, sort and group-by options', () => {
    const filterable = [
      { fieldname: 'status', label: 'Status' },
      { fieldname: '_v_repair_status', label: 'Repair status' },
    ]
    const sortable = [
      { fieldname: 'modified', value: 'modified' },
      { value: '_v_customer' },
    ]
    const groupable = [{ fieldname: 'deal_owner' }, { key: '_v_device' }]
    expect(withoutVirtual(filterable).map((o) => o.fieldname)).toEqual([
      'status',
    ])
    expect(withoutVirtual(sortable)).toHaveLength(1)
    expect(withoutVirtual(groupable)).toEqual([{ fieldname: 'deal_owner' }])
    expect(withoutVirtual(null)).toEqual([])
  })
})

describe('column picker merge', () => {
  const native = [
    { fieldname: 'status', label: 'Status', fieldtype: 'Link' },
    { fieldname: 'deal_value', label: 'Value', fieldtype: 'Currency' },
  ]
  const descriptors = [
    { key: '_v_next_step', label: 'Next step', fieldtype: 'Data' },
    { key: '_v_repair_status', label: 'Repair status', width: '9rem' },
    { key: 'not_virtual', label: 'Rejected' },
    { key: '_v_next_step', label: 'Duplicate' },
  ]

  it('keeps only well-formed, unique virtual descriptors', () => {
    expect(normalizeVirtualColumns(descriptors).map((d) => d.key)).toEqual([
      '_v_next_step',
      '_v_repair_status',
    ])
    expect(normalizeVirtualColumns(undefined)).toEqual([])
  })

  it('appends virtual columns after native fields, minus shown columns', () => {
    const options = mergeColumnOptions(native, descriptors, [
      'status',
      '_v_next_step',
    ])
    expect(options.map((o) => o.fieldname)).toEqual([
      'deal_value',
      '_v_repair_status',
    ])
    expect(options[1]).toMatchObject({
      value: '_v_repair_status',
      virtual: 1,
      width: '9rem',
    })
  })

  it('shows only native fields when the endpoint gave nothing', () => {
    expect(mergeColumnOptions(native, [], [])).toEqual(native)
  })

  it('turns a picked option into a stored column', () => {
    expect(
      columnFromOption({
        label: 'Value',
        fieldname: 'deal_value',
        fieldtype: 'Currency',
      }),
    ).toMatchObject({ key: 'deal_value', align: 'right', width: '10rem' })
    const virtual = columnFromOption({
      label: 'Next step',
      fieldname: '_v_next_step',
      fieldtype: 'Data',
      width: '12rem',
      virtual: 1,
    })
    expect(virtual).toMatchObject({
      key: '_v_next_step',
      virtual: 1,
      width: '12rem',
      align: 'left',
    })
  })
})

describe('repair chip colour', () => {
  it('takes the colour from the provider object', () => {
    expect(resolveChip({ label: 'Listo', color: 'green' })).toEqual({
      label: 'Listo',
      class: 'bg-surface-green-2 text-ink-green-8',
    })
    expect(resolveChip({ label: 'Esperando', color: 'Orange' }).class).toBe(
      'bg-surface-amber-1 text-ink-amber-9',
    )
  })

  it('renders a plain string as a neutral chip', () => {
    expect(resolveChip('Recibido')).toEqual({
      label: 'Recibido',
      class: 'bg-surface-gray-2 text-ink-gray-7',
    })
  })

  it('never lets a hex or unknown colour through', () => {
    expect(chipToneClass('#2563eb')).toBe('bg-surface-gray-2 text-ink-gray-7')
    expect(resolveChip({ label: 'X', color: 'rgb(0,0,0)' }).class).toBe(
      'bg-surface-gray-2 text-ink-gray-7',
    )
  })

  it('renders nothing for an empty value', () => {
    expect(resolveChip(null)).toBeNull()
    expect(resolveChip('')).toBeNull()
    expect(resolveChip({ color: 'red' })).toBeNull()
  })

  it('reads generic virtual values as text', () => {
    expect(virtualText({ label: 'iPhone 13' })).toBe('iPhone 13')
    expect(virtualText(['a', { label: 'b' }])).toBe('a, b')
    expect(virtualText(null)).toBe('')
    expect(virtualText(3)).toBe('3')
  })
})
