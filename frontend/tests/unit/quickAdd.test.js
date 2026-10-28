import { describe, expect, it } from 'vitest'
import { createValues, fold, parseQuickAdd } from '@/utils/quickAdd'

// 2026-10-28 is a Wednesday (the shop's civil day comes from the server).
const today = '2026-10-28'
const people = [
  { user: 'olga@tienda.test', name: 'Olga Martínez' },
  { user: 'ana@tienda.test', name: 'Ana Ruiz', me: true },
]
const parse = (text, extra = {}) =>
  parseQuickAdd(text, { today, people, ...extra })

describe('quick add in es-MX words', () => {
  it('reads the day, the time and the person out of one line', () => {
    const got = parse('Llamar a Olga mañana 5pm @Olga')
    expect(got).toMatchObject({
      title: 'Llamar a Olga',
      date: '2026-10-29',
      time: '17:00',
      person: { user: 'olga@tienda.test', name: 'Olga Martínez' },
    })
    expect(got.tokens.map((token) => token.kind)).toEqual([
      'date',
      'time',
      'person',
    ])
  })

  it('reads «viernes 10» as the next Friday the 10th, else Friday at 10', () => {
    // No Friday the 10th in the next two months: Friday at 10:00.
    expect(parse('Pagar renta viernes 10')).toMatchObject({
      title: 'Pagar renta',
      date: '2026-10-30',
      time: '10:00',
    })
    // Friday 2026-12-11 exists within two months.
    expect(parse('Cerrar mes viernes 11')).toMatchObject({
      title: 'Cerrar mes',
      date: '2026-12-11',
      time: '',
    })
    expect(parse('Pedir fundas el viernes').date).toBe('2026-10-30')
    expect(parse('Pedir fundas el miércoles').date).toBe(today)
  })

  it('reads repeats, and «cada lunes» starts on the next Monday', () => {
    expect(parse('Revisar caja cada lunes')).toMatchObject({
      title: 'Revisar caja',
      repeat: 'Weekly',
      date: '2026-11-02',
    })
    expect(parse('Barrer todos los días')).toMatchObject({
      title: 'Barrer',
      repeat: 'Daily',
      date: today,
    })
    expect(parse('Corte de caja de lunes a viernes').repeat).toBe('Weekdays')
    expect(parse('Pagar luz cada mes').repeat).toBe('Monthly')
  })

  it('reads calendar days and offsets', () => {
    expect(parse('Inventario el 15').date).toBe('2026-11-15')
    expect(parse('Inventario el 30').date).toBe('2026-10-30')
    expect(parse('Cita 3 de nov a las 4')).toMatchObject({
      title: 'Cita',
      date: '2026-11-03',
      time: '16:00',
    })
    expect(parse('Entrega 5/11').date).toBe('2026-11-05')
    expect(parse('Pagar pasado mañana').date).toBe('2026-10-30')
    expect(parse('Volver a llamar en 3 días').date).toBe('2026-10-31')
    expect(parse('Revisar la próxima semana').date).toBe('2026-11-02')
    expect(parse('Conciliar fin de mes').date).toBe('2026-10-31')
  })

  it('reads times; a time alone means today', () => {
    expect(parse('Junta a las 10:30')).toMatchObject({
      title: 'Junta',
      date: today,
      time: '10:30',
    })
    expect(parse('Café en la mañana')).toMatchObject({
      title: 'Café',
      date: today,
      time: '09:00',
    })
    expect(parse('Llamar mañana en la tarde')).toMatchObject({
      title: 'Llamar',
      date: '2026-10-29',
      time: '16:00',
    })
    expect(parse('Abrir 8 am').time).toBe('08:00')
    expect(parse('Cerrar 21:00 hrs').time).toBe('21:00')
  })

  it('reads priority words', () => {
    expect(parse('Enviar cotización !alta')).toMatchObject({
      title: 'Enviar cotización',
      priority: 'High',
    })
    expect(parse('Urgente revisar terminal').priority).toBe('High')
    expect(parse('Ordenar bodega !baja').priority).toBe('Low')
  })

  it('leaves plain words alone and keeps removed chips as words', () => {
    expect(parse('Barrer la entrada')).toMatchObject({
      title: 'Barrer la entrada',
      date: '',
      time: '',
      person: null,
      tokens: [],
    })
    expect(parse('Comprar pan mañana', { ignore: ['manana'] })).toMatchObject({
      title: 'Comprar pan mañana',
      date: '',
    })
    // «hoyo» is not «hoy»; «Martes» inside a word is not a day.
    expect(parse('Tapar el hoyo').date).toBe('')
  })

  it('names an unknown @person so the chip can ask who it is', () => {
    expect(parse('@Desconocido revisar vitrina')).toMatchObject({
      title: 'revisar vitrina',
      mention: 'Desconocido',
      person: null,
    })
  })

  it('folds accents one character for one', () => {
    expect(fold('Mañana Miércoles')).toBe('manana miercoles')
    expect(fold('Mañana').length).toBe('Mañana'.length)
  })

  it('sends the server only what it parsed, never myself as the assignee', () => {
    expect(
      createValues(parse('Llamar mañana 5pm @Olga'), { me: 'ana@tienda.test' }),
    ).toEqual({
      description: 'Llamar',
      date: '2026-10-29',
      time: '17:00',
      priority: 'Medium',
      repeat: '',
      assigned_to: 'olga@tienda.test',
    })
    expect(
      createValues(parse('Contar caja @Ana'), { me: 'ana@tienda.test' })
        .assigned_to,
    ).toBe('')
  })
})
