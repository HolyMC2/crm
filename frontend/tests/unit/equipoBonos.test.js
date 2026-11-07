import { describe, expect, it } from 'vitest'
import {
  ABOVE,
  AMOUNT,
  BONOS,
  COUNT,
  FIXED,
  PERCENT,
  PER_PIECE,
  TEAM,
  blankRule,
  bonosPeriodFromQuery,
  bonosPeriodQuery,
  example,
  missingText,
  payeesLabel,
  pays,
  progressText,
  progressWidth,
  ruleSummary,
} from '../../src/composables/useBonos.js'

const repairs = {
  key: 'reparaciones',
  one: 'repair',
  many: 'repairs',
  options: [{ key: 'count_warranty', type: 'check', default: 0 }],
}
const usd = (v) => `$${Number(v).toLocaleString('en-US')}`
const marco = { ...blankRule([repairs]), bono_name: 'Weekly' }

describe('a new bonus', () => {
  it('starts as Marco’s rule: 20 in the week at $20 each, orders from $250', () => {
    expect(marco).toMatchObject({
      source: 'reparaciones',
      period: 'Semana',
      goal_in: COUNT,
      goal: 20,
      pays: PER_PIECE,
      amount: 20,
      min_amount: 250,
      options: { count_warranty: 0 },
      people: [],
    })
    expect(BONOS).toBe('doco.erp_experience.bonos')
  })
})

describe('what a rule pays (the form’s example; the server decides)', () => {
  it('per repair: all of them at the goal, or only the ones past it', () => {
    expect([19, 20, 22].map((n) => pays(marco, n, 300))).toEqual([0, 400, 440])
    const above = { ...marco, pays_from: ABOVE }
    expect([20, 22].map((n) => pays(above, n, 300))).toEqual([0, 40])
  })
  it('a percentage of what passes a money goal', () => {
    const rule = {
      ...marco,
      goal_in: AMOUNT,
      goal: 10000,
      pays: PERCENT,
      percent: 5,
      pays_from: ABOVE,
    }
    expect(pays(rule, 40, 300)).toBe(100)
    expect(
      pays({ ...rule, pays_from: 'Todas al llegar a la meta' }, 40, 300),
    ).toBe(600)
  })
  it('a fixed amount for the team at its goal', () => {
    const rule = { ...marco, scope: TEAM, goal: 100, pays: FIXED, amount: 200 }
    expect([99, 100, 150].map((n) => pays(rule, n, 300))).toEqual([0, 200, 200])
  })
  it('says it with two examples in the measure’s words', () => {
    expect(example(marco, repairs, usd)).toBe(
      'If a person does 20 repairs, it pays $400; with 25 repairs, $500.',
    )
    const team = { ...marco, scope: TEAM, goal: 100, pays: FIXED, amount: 200 }
    expect(example(team, repairs, usd)).toBe(
      'If the team does 100 repairs, it pays $200; with 105 repairs, $200.',
    )
    const percent = {
      ...marco,
      goal: 0,
      pays: PERCENT,
      percent: 10,
      min_amount: 0,
    }
    expect(example(percent, repairs, usd)).toBe(
      'If a person does 1 repair of $300, it pays $30; with 6 repairs of $300, $180.',
    )
  })
})

describe('the rules list', () => {
  it('reads each rule in one line', () => {
    expect(ruleSummary(marco, repairs, usd)).toBe(
      'Goal 20 repairs, $20 per repair, each person their own, each one from $250',
    )
    const tier = { ...marco, pays_from: ABOVE, stacks: 0, min_amount: 0 }
    expect(ruleSummary(tier, repairs, usd)).toBe(
      'Goal 20 repairs, $20 per repair past the goal, each person their own, the best one is paid',
    )
    const manager = {
      ...marco,
      scope: TEAM,
      goal: 0,
      amount: 5,
      min_amount: 0,
      period: 'Mes',
    }
    expect(ruleSummary(manager, repairs, usd)).toBe(
      'No goal, $5 per repair, whole team',
    )
  })
  it('names who it pays', () => {
    const people = [{ employee: 'HR-EMP-1', name: 'Andrés' }]
    expect(payeesLabel({ ...marco, people: ['HR-EMP-1'] }, people)).toBe(
      'Andrés',
    )
    expect(payeesLabel(marco, people)).toBe('Whoever did the work')
    expect(payeesLabel({ ...marco, scope: TEAM }, people)).toBe(
      'Everybody active in Equipo',
    )
  })
})

describe('a person’s progress', () => {
  const bono = {
    goal_in: COUNT,
    goal: 20,
    value: 18,
    missing: 2,
    reached: false,
    one: 'repair',
    many: 'repairs',
  }
  it('counts toward the goal and says what is missing', () => {
    expect(progressText(bono, usd)).toBe('18 of 20 repairs')
    expect(missingText(bono, usd)).toBe('2 repairs to go')
    expect(progressWidth(bono)).toBe('90%')
    expect(missingText({ ...bono, reached: true }, usd)).toBe('')
  })
  it('in money, and without a goal', () => {
    const money = {
      ...bono,
      goal_in: AMOUNT,
      goal: 10000,
      value: 9000,
      missing: 1000,
    }
    expect(progressText(money, usd)).toBe('$9,000 of $10,000')
    expect(missingText(money, usd)).toBe('$1,000 to go')
    expect(progressText({ ...bono, goal: 0, value: 7 }, usd)).toBe('7 repairs')
    expect(progressWidth({ ...bono, goal: 0 })).toBe('100%')
  })
})

describe('the period in the address', () => {
  it('opens on the week and keeps a month across a reload', () => {
    expect(bonosPeriodFromQuery({})).toEqual({ period: 'week', start: null })
    expect(
      bonosPeriodFromQuery({ periodo: 'mes', desde: '2026-11-01' }),
    ).toEqual({
      period: 'month',
      start: '2026-11-01',
    })
    expect(bonosPeriodQuery('week', '2026-11-02')).toEqual({
      desde: '2026-11-02',
    })
    expect(bonosPeriodQuery('month', null)).toEqual({ periodo: 'mes' })
  })
})
