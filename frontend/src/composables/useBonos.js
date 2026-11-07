import { money } from '@/utils/numberFormat'

// Equipo › Bonos: what each person earns from the shop's bonus rules. Doco's
// erp_experience.bonos owns the rules and the arithmetic (Doco Bono); each app
// adds what can be measured (Taller: reparaciones; doco: ventas). Pure helpers
// live here so the pages and the tests share them. The arithmetic mirrors
// bonos.measure/payout for the form's example only; the server decides.

export const BONOS = 'doco.erp_experience.bonos'

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, 'Equipo')
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// The stored values of Doco Bono's selects.
export const OWN = 'Cada quien lo suyo'
export const TEAM = 'Todo el equipo'
export const COUNT = 'Cantidad'
export const AMOUNT = 'Monto'
export const PER_PIECE = 'Por cada una'
export const PERCENT = 'Porcentaje del monto'
export const FIXED = 'Monto fijo'
export const ALL = 'Todas al llegar a la meta'
export const ABOVE = 'Solo las que pasan la meta'
export const PERIODS = Object.freeze([
  { value: 'Semana', kind: 'week' },
  { value: 'Quincena', kind: 'fortnight' },
  { value: 'Mes', kind: 'month' },
])

export function periodLabel(value) {
  return (
    {
      Semana: tr('Week'),
      Quincena: tr('Fortnight'),
      Mes: tr('Month'),
    }[value] || value
  )
}

/** «3 repairs», with the measure's own words. */
export function pieces(n, source) {
  const word = Number(n) === 1 ? source?.one : source?.many
  return `${Number(n) || 0} ${word || ''}`.trim()
}

/** A new rule: Marco's, which is what most shops start from. */
export function blankRule(sources = []) {
  const source = sources[0]
  const options = Object.fromEntries(
    (source?.options || []).map((o) => [o.key, o.default ?? '']),
  )
  return {
    bono_name: '',
    enabled: 1,
    company: '',
    period: 'Semana',
    source: source?.key || '',
    scope: OWN,
    min_amount: 250,
    goal_in: COUNT,
    goal: 20,
    pays: PER_PIECE,
    amount: 20,
    percent: 0,
    pays_from: ALL,
    stacks: 1,
    notes: '',
    options,
    people: [],
  }
}

/** Mirror of bonos.measure + payout for `n` pieces worth `each`. */
export function pays(rule, n, each) {
  const goal = Number(rule.goal) || 0
  const byAmount = rule.goal_in === AMOUNT
  const total = n * each
  const value = byAmount ? total : n
  if (value < goal) return 0
  let pastCount = 0
  let pastTotal = 0
  let done = 0
  for (let i = 0; i < n; i++) {
    if (done >= goal) {
      pastCount += 1
      pastTotal += each
    }
    done += byAmount ? each : 1
  }
  const above = rule.pays_from === ABOVE
  if (rule.pays === FIXED) return Number(rule.amount) || 0
  if (rule.pays === PERCENT) {
    const base = !above ? total : byAmount ? total - goal : pastTotal
    return Math.round(base * (Number(rule.percent) || 0)) / 100
  }
  return (Number(rule.amount) || 0) * (above ? pastCount : n)
}

/** What a piece is worth in the example: the rule's minimum, or $300. */
export function exampleValue(rule) {
  return Math.max(Number(rule.min_amount) || 0, 300)
}

/** «With 20 repairs it pays $400; with 25, $500.» for the form. */
export function example(rule, source, format = money) {
  const each = exampleValue(rule)
  const goal = Number(rule.goal) || 0
  const counts =
    rule.goal_in === AMOUNT
      ? [
          Math.max(1, Math.ceil(goal / each)),
          Math.ceil((goal * 1.25) / each) || 5,
        ]
      : [Math.max(1, goal), Math.max(1, goal) + 5]
  const worthMatters = rule.goal_in === AMOUNT || rule.pays === PERCENT
  const text = (n) =>
    worthMatters
      ? tr('{0} of {1}', [pieces(n, source), format(each)])
      : pieces(n, source)
  const who = rule.scope === TEAM ? tr('the team') : tr('a person')
  return tr('If {0} does {1}, it pays {2}; with {3}, {4}.', [
    who,
    text(counts[0]),
    format(pays(rule, counts[0], each)),
    text(counts[1]),
    format(pays(rule, counts[1], each)),
  ])
}

/** One line per rule for the list: goal, pay and what counts. */
export function ruleSummary(rule, source, format = money) {
  const goal = Number(rule.goal) || 0
  const target =
    goal <= 0
      ? tr('No goal')
      : rule.goal_in === AMOUNT
        ? tr('Goal {0}', [format(goal)])
        : tr('Goal {0}', [pieces(goal, source)])
  let pay
  if (rule.pays === FIXED) pay = tr('{0} once reached', [format(rule.amount)])
  else if (rule.pays === PERCENT)
    pay = tr('{0}% of the amount', [Number(rule.percent) || 0])
  else pay = tr('{0} per {1}', [format(rule.amount), source?.one || ''])
  if (rule.pays !== FIXED && rule.pays_from === ABOVE && goal > 0)
    pay = `${pay} ${tr('past the goal')}`
  const scope =
    rule.scope === TEAM ? tr('whole team') : tr('each person their own')
  const parts = [target, pay, scope]
  if (Number(rule.min_amount) > 0)
    parts.push(tr('each one from {0}', [format(rule.min_amount)]))
  if (!rule.stacks) parts.push(tr('the best one is paid'))
  return parts.join(', ')
}

/** Who a rule pays, by name. */
export function payeesLabel(rule, people = []) {
  if (rule.people?.length) {
    const names = new Map(people.map((p) => [p.employee, p.name]))
    return rule.people.map((e) => names.get(e) || e).join(', ')
  }
  return rule.scope === TEAM
    ? tr('Everybody active in Equipo')
    : tr('Whoever did the work')
}

/** «18 of 20 repairs», or «$9,000 of $10,000». */
export function progressText(bono, format = money) {
  const source = { one: bono.one, many: bono.many }
  if (!bono.goal)
    return bono.goal_in === AMOUNT
      ? format(bono.value)
      : pieces(bono.value, source)
  if (bono.goal_in === AMOUNT)
    return tr('{0} of {1}', [format(bono.value), format(bono.goal)])
  return tr('{0} of {1}', [Number(bono.value), pieces(bono.goal, source)])
}

/** What is still missing, or nothing once the goal is reached. */
export function missingText(bono, format = money) {
  if (bono.reached || !bono.missing) return ''
  const source = { one: bono.one, many: bono.many }
  return tr('{0} to go', [
    bono.goal_in === AMOUNT
      ? format(bono.missing)
      : pieces(bono.missing, source),
  ])
}

/** The bar's width: how far along the goal, whole when there is none. */
export function progressWidth(bono) {
  if (!bono.goal) return '100%'
  return `${Math.min(100, Math.round((bono.value / bono.goal) * 100))}%`
}

/** The address query of a period on Bonos (periodo=mes|quincena, desde=day). */
const PERIOD_WORDS = Object.freeze({
  week: 'semana',
  fortnight: 'quincena',
  month: 'mes',
})
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
export function bonosPeriodFromQuery(query = {}) {
  const period =
    Object.keys(PERIOD_WORDS).find((k) => PERIOD_WORDS[k] === query.periodo) ||
    'week'
  const start = ISO_DAY.test(query.desde || '') ? query.desde : null
  return { period, start }
}
export function bonosPeriodQuery(period, start) {
  const query = period === 'week' ? {} : { periodo: PERIOD_WORDS[period] }
  return start ? { ...query, desde: start } : query
}
