import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DateField from '@/components/ui/DateField.vue'
import {
  addDays,
  inWords,
  joinValue,
  monthGrid,
  parseTime,
  parseTyped,
  timeOf,
  toTyped,
} from '@/components/ui/dateField'

const TODAY = new Date(2026, 9, 18) // sábado 18 de octubre de 2026

describe('es-MX dates (dd/mm/aaaa, 24 h)', () => {
  it('shows day/month/year and reads what a worker types', () => {
    expect(toTyped('2026-09-29')).toBe('29/09/2026')
    expect(toTyped('2026-09-29 14:30:00')).toBe('29/09/2026')
    expect(parseTyped('29/09/2026')).toBe('2026-09-29')
    expect(parseTyped('29-9-26')).toBe('2026-09-29')
    expect(parseTyped('29092026')).toBe('2026-09-29')
    expect(parseTyped('3/11', TODAY)).toBe('2026-11-03')
    expect(parseTyped('')).toBe('')
  })
  it('refuses what is not a date (no US month/day swap)', () => {
    expect(parseTyped('09/29/2026')).toBeNull()
    expect(parseTyped('31/02/2026')).toBeNull()
    expect(parseTyped('mañana')).toBeNull()
  })
  it('times are 24-hour', () => {
    expect(parseTime('7:05')).toBe('07:05')
    expect(parseTime('1430')).toBe('14:30')
    expect(parseTime('14.30')).toBe('14:30')
    expect(parseTime('9')).toBe('09:00')
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('7:61')).toBeNull()
    expect(timeOf('2026-10-18 14:30:00')).toBe('14:30')
  })
  it('stores what Frappe expects per field type', () => {
    expect(joinValue('date', '2026-10-18', '')).toBe('2026-10-18')
    expect(joinValue('datetime', '2026-10-18', '14:30')).toBe(
      '2026-10-18 14:30:00',
    )
    expect(joinValue('datetime', '2026-10-18', '')).toBe('2026-10-18 00:00:00')
    expect(joinValue('time', '', '09:15')).toBe('09:15:00')
    expect(joinValue('date', '', '')).toBe('')
  })
  it('says the date in words next to the field', () => {
    expect(inWords('2026-10-18', TODAY)).toBe('hoy')
    expect(inWords('2026-10-19', TODAY)).toBe('mañana')
    expect(inWords('2026-10-24', TODAY)).toBe('sábado 24 de octubre')
    expect(inWords('2027-01-04', TODAY)).toMatch(/4 de enero de 2027$/)
    expect(addDays(7, TODAY)).toBe('2026-10-25')
  })
  it('the month starts on Monday', () => {
    const weeks = monthGrid(2026, 10) // 1 oct 2026 is a Thursday
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0][3]).toBe('2026-10-01')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })
})

function mount(props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const emitted = []
  const app = createApp({
    render: () =>
      h(DateField, { ...props, 'onUpdate:modelValue': (v) => emitted.push(v) }),
  })
  app.mount(el)
  const input = async (node, value) => {
    node.value = value
    node.dispatchEvent(new Event('input'))
    node.dispatchEvent(new Event('change'))
    await nextTick()
  }
  const click = async (sel) => {
    el.querySelector(sel).click()
    await nextTick()
  }
  return { el, emitted, input, click, unmount: () => app.unmount() }
}

describe('DateField', () => {
  it('a typed date emits the stored form; no native date input', async () => {
    const w = mount({ modelValue: '', label: 'Vence' })
    expect(w.el.querySelector('input[type="date"]')).toBeNull()
    await w.input(w.el.querySelector('input'), '29/09/2026')
    expect(w.emitted.at(-1)).toBe('2026-09-29')
    w.unmount()
  })
  it('a wrong date explains the format in Spanish', async () => {
    const w = mount({ modelValue: '', label: 'Vence' })
    await w.input(w.el.querySelector('input'), '09/29/2026')
    expect(w.el.textContent).toContain('día/mes/año')
    expect(w.emitted).toEqual([])
    w.unmount()
  })
  it('the month picks a day; required has no «Quitar»', async () => {
    const w = mount({
      modelValue: '2026-10-18',
      label: 'Fecha',
      required: true,
    })
    expect(w.el.textContent).not.toContain('Quitar')
    await w.click('[aria-label="Abrir calendario"]')
    await w.click('[aria-label="20 de octubre de 2026"]')
    expect(w.emitted.at(-1)).toBe('2026-10-20')
    w.unmount()
  })
  it('datetime keeps the time in 24 h', async () => {
    const w = mount({
      modelValue: '2026-10-18 09:00:00',
      mode: 'datetime',
      label: 'Cita',
    })
    const time = w.el.querySelectorAll('input')[1]
    expect(time.value).toBe('09:00')
    await w.input(time, '17:45')
    expect(w.emitted.at(-1)).toBe('2026-10-18 17:45:00')
    expect(w.el.textContent).toContain('24 horas')
    w.unmount()
  })
})
