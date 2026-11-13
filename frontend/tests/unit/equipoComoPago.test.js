// «¿Cómo pagas a tu equipo?» (pages/EquipoComoPago.vue) paints what
// composables/useComoPago.js decides: which question shows for which answer,
// what each level card switches, what «Guardar» still waits for, and whether
// Prenómina shows the door at all. The page is not mounted here
// (@vue/test-utils is not a dependency); the taps are walked through the same
// functions the page's buttons call.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AJUSTES_APPLY,
  AJUSTES_GET,
  AJUSTES_PREVIEW,
  CALCULA,
  SOLO,
  TODO,
  answersKey,
  levelOf,
  missingAnswers,
  origenOptions,
  origenesOn,
  payloadOf,
  pickLevel,
  prenominaDoor,
  setOrigenes,
  visibleQuestions,
  withAnswer,
} from '../../src/composables/useComoPago.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')

// What ajustes_get answers for a company with no row yet (doco defaults).
const DEFAULTS = {
  calcular: 0,
  frecuencia: null,
  dia_pago: null,
  origen_caja: 1,
  origen_caja_fuerte: 0,
  origen_dueno: 0,
  origen_transferencia: 0,
  quien_entrega: 'Los dos',
  cajero_ve_montos: 0,
  base_default: null,
  dias_fuente: 'Lo escribo yo',
  dias_mes: 30,
  paga_descanso: 0,
  horas_extra: 0,
  descontar_faltas: 0,
  arrastrar_saldo: 1,
  prestamos: 0,
  cuota_default: 0,
  aguinaldo: 0,
  aguinaldo_dias: 15,
  prima_vacacional: 0,
  prima_pct: 25,
  ptu: 0,
  finiquito: 0,
  retenciones: 0,
  recibos: 0,
  cfdi_nomina: 0,
  recibo_trabajador: 0,
  mis_pagos: 0,
}
const SHOW_MX = {
  caja: true,
  caja_fuerte: true,
  quien_entrega: true,
  mx: true,
  retenciones: true,
  recibos: true,
  cfdi_nomina: true,
  prestamos: true,
}
const SHOW_PLAIN = {
  caja: false,
  caja_fuerte: false,
  quien_entrega: false,
  mx: false,
  retenciones: false,
  recibos: false,
  cfdi_nomina: false,
  prestamos: false,
}
const LEY = [
  'aguinaldo',
  'prima_vacacional',
  'ptu',
  'finiquito',
  'retenciones',
  'recibos',
  'cfdi_nomina',
]

describe('the doco endpoints', () => {
  it('names the three nomina services', () => {
    expect(AJUSTES_GET).toBe('doco.nomina.api.ajustes_get')
    expect(AJUSTES_PREVIEW).toBe('doco.nomina.api.ajustes_preview')
    expect(AJUSTES_APPLY).toBe('doco.nomina.api.ajustes_apply')
  })
})

describe('Prenómina stays as it is unless doco offers the setup (dark)', () => {
  it('shows nothing without an answer, on a refusal, or without the setup', () => {
    expect(prenominaDoor(null)).toBeNull()
    expect(prenominaDoor(undefined)).toBeNull()
    expect(prenominaDoor({})).toBeNull()
    expect(
      prenominaDoor({ available: false, can_edit: true, configured: false }),
    ).toBeNull()
  })
  it('shows nothing to an encargado, who reads but cannot save', () => {
    expect(
      prenominaDoor({ available: true, can_edit: false, configured: false }),
    ).toBeNull()
  })
  it('shows the first-run card before the first save, a quiet link after', () => {
    expect(
      prenominaDoor({ available: true, can_edit: true, configured: false }),
    ).toBe('card')
    expect(
      prenominaDoor({ available: true, can_edit: true, configured: true }),
    ).toBe('link')
  })
  it('keeps every Prenómina element the dark path had, the door behind its v-if', () => {
    const page = src('pages/EquipoPrenomina.vue')
    expect(page).toMatch(/v-if="door === 'card'"/)
    expect(page).toMatch(/v-else-if="door === 'link'"/)
    // The door's read failing leaves it null; the period read is untouched.
    expect(page).toMatch(/\.catch\(\(\) => \(ajustes\.value = null\)\)/)
    expect(page).toMatch(
      /watch\(wanted, load, \{ immediate: true, deep: true \}\)/,
    )
    expect(page).toMatch(/Nothing here changes payroll\./)
  })
})

describe('level cards only set switches', () => {
  it('reads no level before the first save, so the owner picks one', () => {
    expect(levelOf(DEFAULTS, false)).toBeNull()
    expect(levelOf(DEFAULTS, true)).toBe(SOLO)
    expect(levelOf({ ...DEFAULTS, calcular: 1 }, true)).toBe(CALCULA)
    expect(levelOf({ ...DEFAULTS, calcular: 1, aguinaldo: 1 }, true)).toBe(TODO)
  })
  it('«Solo anoto» turns calculating and every legal piece off', () => {
    const before = {
      ...DEFAULTS,
      calcular: 1,
      horas_extra: 1,
      aguinaldo: 1,
      recibos: 1,
    }
    const after = pickLevel(before, SOLO, SHOW_MX)
    expect(after.calcular).toBe(0)
    expect(after.horas_extra).toBe(0)
    for (const field of LEY) expect(after[field]).toBe(0)
    expect(levelOf(after)).toBe(SOLO)
  })
  it('«Muelle me dice» calculates with no legal piece on', () => {
    const after = pickLevel(DEFAULTS, CALCULA, SHOW_MX)
    expect(after.calcular).toBe(1)
    for (const field of LEY) expect(after[field]).toBe(0)
    expect(levelOf(after)).toBe(CALCULA)
  })
  it('«Lleva todo» ticks each legal piece only where this site allows it', () => {
    const mx = pickLevel(DEFAULTS, TODO, SHOW_MX)
    for (const field of LEY) expect(mx[field]).toBe(1)
    const noFiscal = pickLevel(DEFAULTS, TODO, {
      ...SHOW_MX,
      retenciones: false,
      cfdi_nomina: false,
    })
    expect(noFiscal.retenciones).toBe(0)
    expect(noFiscal.cfdi_nomina).toBe(0)
    expect(noFiscal.aguinaldo).toBe(1)
    // A shop outside Mexico: no Mexican piece, recibos only with HRMS.
    const abroad = pickLevel(DEFAULTS, TODO, { ...SHOW_PLAIN, recibos: true })
    for (const field of LEY.filter((f) => f !== 'recibos'))
      expect(abroad[field]).toBe(0)
    expect(abroad.recibos).toBe(1)
    expect(abroad.calcular).toBe(1)
  })
  it('never touches the answers that are not switches', () => {
    const answered = {
      ...DEFAULTS,
      frecuencia: 'Semanal',
      dia_pago: 'Sábado',
      origen_dueno: 1,
    }
    const after = pickLevel(answered, TODO, SHOW_MX)
    expect(after.frecuencia).toBe('Semanal')
    expect(after.dia_pago).toBe('Sábado')
    expect(origenesOn(after)).toEqual(['origen_caja', 'origen_dueno'])
  })
})

describe('questions show per answer', () => {
  it('asks the weekday only for a weekly pay', () => {
    expect(visibleQuestions({ frecuencia: 'Semanal' }).dia_pago).toBe(true)
    expect(visibleQuestions({ frecuencia: 'Quincenal' }).dia_pago).toBe(false)
    expect(visibleQuestions({ frecuencia: 'Mensual' }).dia_pago).toBe(false)
    expect(visibleQuestions({}).dia_pago).toBe(false)
  })
  it('hides the calculation questions while the shop only notes', () => {
    const solo = visibleQuestions(
      { ...DEFAULTS, frecuencia: 'Quincenal' },
      SHOW_MX,
    )
    expect(solo.calcula).toBe(false)
    expect(solo.dias_mes).toBe(false)
    expect(solo.prestamos).toBe(false)
    expect(solo.prima_vacacional).toBe(false)
    const calcula = visibleQuestions(
      { ...DEFAULTS, calcular: 1, frecuencia: 'Quincenal' },
      SHOW_MX,
    )
    expect(calcula.calcula).toBe(true)
    expect(calcula.dias_mes).toBe(true)
    expect(calcula.prestamos).toBe(true)
    expect(calcula.prima_vacacional).toBe(true)
    expect(
      visibleQuestions(
        { ...DEFAULTS, calcular: 1, frecuencia: 'Semanal' },
        SHOW_MX,
      ).dias_mes,
    ).toBe(false)
  })
  it('asks who hands the money over only where there is a register', () => {
    expect(visibleQuestions(DEFAULTS, SHOW_PLAIN).quien_entrega).toBe(false)
    expect(visibleQuestions(DEFAULTS, SHOW_PLAIN).cajero_ve_montos).toBe(false)
    expect(visibleQuestions(DEFAULTS, SHOW_MX).cajero_ve_montos).toBe(true)
    expect(
      visibleQuestions(
        { ...DEFAULTS, quien_entrega: 'Yo desde Muelle' },
        SHOW_MX,
      ).cajero_ve_montos,
    ).toBe(false)
  })
  it('offers the Mexican pieces only to a Mexican company', () => {
    const plain = visibleQuestions({ ...DEFAULTS, calcular: 1 }, SHOW_PLAIN)
    for (const field of LEY) expect(plain[field]).toBe(false)
    expect(plain.ley).toBe(false)
    const mx = visibleQuestions({ ...DEFAULTS, calcular: 1 }, SHOW_MX)
    for (const field of [
      'aguinaldo',
      'prima_vacacional',
      'ptu',
      'finiquito',
      'retenciones',
      'recibos',
    ])
      expect(mx[field]).toBe(true)
  })
  it('asks the days and the percentage only when their piece is on', () => {
    expect(visibleQuestions(DEFAULTS, SHOW_MX).aguinaldo_dias).toBe(false)
    expect(
      visibleQuestions({ ...DEFAULTS, aguinaldo: 1 }, SHOW_MX).aguinaldo_dias,
    ).toBe(true)
    expect(
      visibleQuestions(
        { ...DEFAULTS, calcular: 1, prima_vacacional: 1 },
        SHOW_MX,
      ).prima_pct,
    ).toBe(true)
  })
  it('offers stamping only after the payroll receipts', () => {
    expect(visibleQuestions(DEFAULTS, SHOW_MX).cfdi_nomina).toBe(false)
    expect(
      visibleQuestions({ ...DEFAULTS, recibos: 1 }, SHOW_MX).cfdi_nomina,
    ).toBe(true)
  })
  it('offers the loan installment only with loans on', () => {
    const calc = { ...DEFAULTS, calcular: 1 }
    expect(visibleQuestions(calc, SHOW_MX).cuota_default).toBe(false)
    expect(
      visibleQuestions({ ...calc, prestamos: 1 }, SHOW_MX).cuota_default,
    ).toBe(true)
    expect(
      visibleQuestions({ ...calc, prestamos: 1 }, SHOW_PLAIN).cuota_default,
    ).toBe(false)
  })
  it('offers to create the owner account only for «Lo pongo yo» without one', () => {
    expect(visibleQuestions({ origen_dueno: 1 }).crear_aportacion).toBe(true)
    expect(
      visibleQuestions({ origen_dueno: 1, cuenta_aportacion_dueno: 'X' })
        .crear_aportacion,
    ).toBe(false)
    expect(visibleQuestions({ origen_dueno: 0 }).crear_aportacion).toBe(false)
  })
  it('lists only the money sources the site has', () => {
    const options = {
      origenes: [
        { value: 'Caja', field: 'origen_caja', label: 'Caja' },
        {
          value: 'Caja fuerte',
          field: 'origen_caja_fuerte',
          label: 'Caja fuerte',
        },
        { value: 'Lo pongo yo', field: 'origen_dueno', label: 'Lo pongo yo' },
        {
          value: 'Transferencia',
          field: 'origen_transferencia',
          label: 'Transferencia',
        },
      ],
    }
    const none = { ...DEFAULTS, origen_caja: 0 }
    expect(
      origenOptions(options, none, SHOW_PLAIN).map((o) => o.field),
    ).toEqual(['origen_dueno', 'origen_transferencia'])
    expect(origenOptions(options, none, SHOW_MX)).toHaveLength(4)
  })
})

describe('what «Guardar» waits for', () => {
  it('names the first unanswered question', () => {
    expect(missingAnswers(DEFAULTS, null)[0].key).toBe('nivel')
    expect(missingAnswers(DEFAULTS, SOLO)[0].key).toBe('frecuencia')
    expect(
      missingAnswers({ ...DEFAULTS, frecuencia: 'Semanal' }, SOLO)[0].key,
    ).toBe('dia_pago')
    expect(
      missingAnswers({ ...DEFAULTS, frecuencia: 'Quincenal' }, SOLO),
    ).toEqual([])
    expect(
      missingAnswers(
        setOrigenes({ ...DEFAULTS, frecuencia: 'Mensual' }, []),
        SOLO,
      )[0].key,
    ).toBe('origen')
  })
  it('sends «Crear Aportaciones del dueño» only when ticked and still needed', () => {
    expect(payloadOf({ origen_dueno: 1 }, true).crear_aportacion_dueno).toBe(1)
    expect(payloadOf({ origen_dueno: 1 }, false).crear_aportacion_dueno).toBe(0)
    expect(payloadOf({ origen_dueno: 0 }, true).crear_aportacion_dueno).toBe(0)
  })
  it('previews again only when an answer changed', () => {
    const a = { ...DEFAULTS, frecuencia: 'Semanal' }
    expect(answersKey(a)).toBe(answersKey({ ...a }))
    expect(answersKey(a)).not.toBe(answersKey({ ...a, dia_pago: 'Sábado' }))
  })
})

// Tap counts (WAVE2 §1.4): every tap is one call the page's controls make.
function walk(show, steps) {
  let values = { ...DEFAULTS, origen_caja: show.caja ? 1 : 0 }
  let level = null
  let taps = 1 // open the setup from Prenómina's card
  for (const [kind, value] of steps) {
    taps += 1
    if (kind === 'nivel') {
      level = value
      values = pickLevel(values, value, show)
    } else if (kind === 'origen') {
      values = setOrigenes(values, [...origenesOn(values), value])
    } else values = { ...values, [kind]: value }
  }
  taps += 1 // «Guardar»
  return { taps, values, level, missing: missingAnswers(values, level) }
}

describe('tap counts', () => {
  it('«Solo anoto» saves in 5 taps for a weekly shop with a register', () => {
    const done = walk(SHOW_MX, [
      ['nivel', SOLO],
      ['frecuencia', 'Semanal'],
      ['dia_pago', 'Sábado'],
    ])
    expect(done.missing).toEqual([])
    expect(done.taps).toBe(5)
    expect(done.values.calcular).toBe(0)
  })
  it('«Muelle lleva todo» saves in 6 taps, the legal pieces ticked for review', () => {
    const done = walk(SHOW_MX, [
      ['nivel', TODO],
      ['frecuencia', 'Semanal'],
      ['dia_pago', 'Sábado'],
      ['base_default', 'Fijo'],
    ])
    expect(done.missing).toEqual([])
    expect(done.taps).toBe(6)
    expect(done.taps).toBeLessThanOrEqual(8)
    for (const field of LEY) expect(done.values[field]).toBe(1)
  })
  it('a shop with no register picks where the money comes from: one tap more', () => {
    const solo = walk(SHOW_PLAIN, [
      ['nivel', SOLO],
      ['frecuencia', 'Semanal'],
      ['dia_pago', 'Sábado'],
    ])
    expect(solo.missing.map((m) => m.key)).toEqual(['origen'])
    const fixed = walk(SHOW_PLAIN, [
      ['nivel', SOLO],
      ['frecuencia', 'Semanal'],
      ['dia_pago', 'Sábado'],
      ['origen', 'origen_dueno'],
    ])
    expect(fixed.missing).toEqual([])
    expect(fixed.taps).toBe(6)
  })
})

describe('the page', () => {
  it('is routed under Equipo at /equipo/como-pago', () => {
    expect(src('router.js')).toMatch(
      /path: '\/equipo\/como-pago',\n\s+name: 'EquipoComoPago'/,
    )
  })
  it('shows the setup only when doco answers `available`', () => {
    const page = src('pages/EquipoComoPago.vue')
    expect(page).toMatch(/v-else-if="!answer\.available"/)
    expect(page).toMatch(/answer\?\.available && answer\.can_edit/)
  })
  it('does not ask how much each person earns (lane pay-field privacy)', () => {
    expect(src('pages/EquipoComoPago.vue')).not.toMatch(/set_sueldo|doco_pago_/)
  })
})

describe('answers that follow from another', () => {
  it('turning receipts off also stops stamping them', () => {
    const todo = { ...DEFAULTS, recibos: 1, cfdi_nomina: 1 }
    const off = withAnswer(todo, 'recibos', 0)
    expect(off).toMatchObject({ recibos: 0, cfdi_nomina: 0 })
    expect(withAnswer(todo, 'recibos', 1).cfdi_nomina).toBe(1)
    expect(withAnswer(todo, 'ptu', 0).cfdi_nomina).toBe(1)
  })

  it('a fortnight or month pay day does not answer a weekly one', () => {
    const weekdays = ['Lunes', 'Sábado']
    const was = {
      ...DEFAULTS,
      frecuencia: 'Semanal',
      dia_pago: '15 y fin de mes',
    }
    expect(missingAnswers(was, SOLO, weekdays)[0].key).toBe('dia_pago')
    expect(
      missingAnswers({ ...was, dia_pago: 'Sábado' }, SOLO, weekdays),
    ).toEqual([])
  })

  it('offers the caja fuerte where the chart has its account', () => {
    expect(visibleQuestions(DEFAULTS, {}).origen_caja_fuerte).toBe(false)
    expect(
      visibleQuestions(
        { ...DEFAULTS, cuenta_caja_fuerte: 'Caja fuerte - D' },
        {},
      ).origen_caja_fuerte,
    ).toBe(true)
  })
})
