// Equipo › Metas: each person's goals and score in a period. doco.metas owns the
// goals (Doco Meta), what can be measured (each app adds its own: sales, the
// inbox, deals, tasks…) and the arithmetic; the figures arrive already written in
// the unit's words (value_text, target_text, gap). Pure helpers live here so the
// page and the tests share them.

export const METAS = 'doco.metas.api'

// The stored values of Doco Meta's selects.
export const OWN = 'Cada quien lo suyo'
export const TEAM = 'Todo el equipo'
export const PERIODS = Object.freeze(['Semana', 'Quincena', 'Mes'])
export const PUESTOS = Object.freeze([
  'Cajero',
  'Técnico',
  'Encargado',
  'Dueño',
])

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, 'Equipo')
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export function periodLabel(value) {
  return (
    {
      Semana: tr('Week'),
      Quincena: tr('Fortnight'),
      Mes: tr('Month'),
    }[value] || value
  )
}

/** The bar's width: 100 % once the goal is met (lower-is-better included). */
export function barWidth(line) {
  if (line?.progress === null || line?.progress === undefined) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(line.progress * 100)))}%`
}

/** Score colour → chip classes; the ink steps read on their fill in light and dark. */
export function scoreClass(color) {
  return (
    {
      green: 'bg-surface-green-2 text-ink-green-8',
      amber: 'bg-surface-amber-2 text-ink-amber-8',
      red: 'bg-surface-red-2 text-ink-red-8',
    }[color] || 'bg-surface-gray-2 text-ink-gray-7'
  )
}

export function barClass(line) {
  if (line?.reached) return 'bg-surface-green-7'
  if (line?.progress === null || line?.progress === undefined)
    return 'bg-surface-gray-4'
  return line.progress >= 0.7 ? 'bg-surface-amber-7' : 'bg-surface-red-7'
}

/** «12 de 15 · faltan 3» or «Cumplida ✓», from the server's words. */
export function lineText(line) {
  const figure = tr('{0} of {1}', [line.value_text, line.target_text])
  if (line.reached) return `${figure} · ${tr('Met ✓')}`
  return line.gap ? `${figure} · ${line.gap}` : figure
}

/** «3 of 4 goals met» for a person's row. */
export function metText(person) {
  return tr('{0} of {1} goals met', [person.met || 0, person.goals.length])
}

/** The measures grouped for the picker, in the server's order. */
export function groupedIndicators(indicators = []) {
  const groups = new Map()
  for (const row of indicators) {
    if (!groups.has(row.group)) groups.set(row.group, [])
    groups.get(row.group).push(row)
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }))
}

/** A new goal on the first measure, a week, each person's own. */
export function blankGoal(indicators = []) {
  const first = indicators[0]
  return {
    indicator: first?.key || '',
    enabled: 1,
    company: '',
    period: 'Semana',
    weight: 1,
    target: first?.unit === 'percent' ? 90 : 0,
    scope: OWN,
    puestos: [],
    people: [],
    options: optionDefaults(first),
    notes: '',
  }
}

export function optionDefaults(indicator) {
  return Object.fromEntries(
    (indicator?.options || []).map((o) => [o.key, o.default ?? '']),
  )
}

/** The unit's hint beside the goal field. */
export function unitHint(indicator) {
  return (
    {
      money: tr('pesos'),
      count: tr('how many'),
      percent: '%',
      minutes: tr('minutes'),
      hours: tr('hours'),
      rating: tr('of 5'),
    }[indicator?.unit] || ''
  )
}

/** «at least» / «at most», from what is better. */
export function directionText(indicator) {
  return indicator?.better === 'lower' ? tr('At most') : tr('At least')
}

/** The address query of a period (periodo=mes|quincena, desde=day). */
const PERIOD_WORDS = Object.freeze({
  week: 'semana',
  fortnight: 'quincena',
  month: 'mes',
})
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
export function periodFromQuery(query = {}) {
  const period =
    Object.keys(PERIOD_WORDS).find((k) => PERIOD_WORDS[k] === query.periodo) ||
    'week'
  const start = ISO_DAY.test(query.desde || '') ? query.desde : null
  return { period, start }
}
export function periodQuery(period, start) {
  const query = period === 'week' ? {} : { periodo: PERIOD_WORDS[period] }
  return start ? { ...query, desde: start } : query
}
