// «Conteos del día» (crm /inventario/conteos): the owner turns the daily
// counts on, says who counts and how, and reads each person's day, over
// scanner_kit's api.conteo.plan_dia. Every write answers the whole page, so
// the screen repaints from the answer of the tap. The calls, the words and the
// pure rules the page, a person's row and the tests share.
import { call } from 'frappe-ui'
import { LOCALE, formatDate, formatMoney, initials } from '@/utils/display'
import { errorText } from '@/utils/errorText'
import { withReturn } from '@/vendor/muelle-shell/contracts'

export const CTX = 'Conteos'
const SERVICE = 'scanner_kit.api.conteo.plan_dia'

function tr(message, replace, context = CTX) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// ── the calls ────────────────────────────────────────────────────────────

/** Lists and objects travel as JSON text, a switch as 1 or 0; what is undefined is not sent. */
export function wire(args) {
  const out = {}
  for (const [key, value] of Object.entries(args || {})) {
    if (value === undefined) continue
    out[key] =
      value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value === true
          ? 1
          : value === false
            ? 0
            : value
  }
  return out
}

export const conteosApi = {
  home: () => call(`${SERVICE}.home`),
  save: (args) => call(`${SERVICE}.save`, wire(args)),
  setPerson: (user, args) =>
    call(`${SERVICE}.set_person`, wire({ user, ...args })),
  setGroup: (group, treatment) =>
    call(`${SERVICE}.set_group`, { group, treatment: treatment || '' }),
  setWarehouse: (warehouse, args) =>
    call(`${SERVICE}.set_warehouse`, wire({ warehouse, ...args })),
}

/** The server's reason for a refusal, as it came; our own words only when it sent none. */
export function refusal(error) {
  return errorText(error, tr('That could not be saved. Try again.'))
}

/** Why the page could not be read: the server's reason, else that it could not be opened. */
export function readFailure(error) {
  return errorText(error, tr('The counts could not be opened.'))
}

/** The gate refused the page itself (not a manager of any store's counts). */
export function isDenied(error) {
  return error?.exc_type === 'PermissionError' || error?.status === 403
}

/**
 * The page's state over the server's answers. A tap paints at once (`paint`
 * edits the page in place), its call goes after the calls before it, and the
 * newest answer replaces the whole page. A refusal puts the page back as the
 * server last said it and leaves the server's reason under `key`.
 *
 * `page` is a ref of the home answer, `errors` a reactive `{ key: reason }`,
 * `busy` a ref of how many writes are on their way.
 */
export function createWriter({ page, errors, busy, onAnswer }) {
  let truth = clone(page.value)
  let latest = 0
  let queue = Promise.resolve()
  return {
    /** The page as the server last said it (the first read, then each answer). */
    settle(answer) {
      truth = clone(answer)
      page.value = answer
    },
    write(key, paint, send) {
      const mine = ++latest
      delete errors[key]
      if (page.value && paint) paint(page.value)
      busy.value += 1
      queue = queue.then(async () => {
        try {
          const answer = await send()
          truth = clone(answer)
          if (mine === latest) page.value = answer
          onAnswer?.(answer)
          return true
        } catch (error) {
          errors[key] = refusal(error)
          if (mine === latest) page.value = clone(truth)
          return false
        } finally {
          busy.value -= 1
        }
      })
      return queue
    },
  }
}

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value))

// ── the words of each choice ─────────────────────────────────────────────

// What goes first on a list sized in minutes (day_plan.RULES, in its order).
export const ruleOptions = () => [
  { value: 'negative', label: tr('Below zero') },
  { value: 'differences', label: tr('Did not match') },
  { value: 'top_sold', label: tr('Best sellers') },
  { value: 'top_value', label: tr('Most valuable') },
  { value: 'oldest', label: tr('Longest uncounted') },
]
// What goes first on a list sized in products (Plan.prioritization_mode): one of four.
export const orderOptions = () => [
  { value: 'flagged_first', label: tr('Did not match') },
  { value: 'high_turnover', label: tr('Best sellers') },
  { value: 'high_value', label: tr('Most valuable') },
  { value: 'cycle_only', label: tr('Longest uncounted') },
]
export const differenceOptions = () => [
  { value: 'recount', label: tr('Someone else recounts') },
  { value: 'review', label: tr('I review it') },
]
export const unitOptions = () => [
  { value: 'minutes', label: tr('Minutes') },
  { value: 'products', label: tr('Products') },
]
// When a photo is asked (Plan.proof_policy).
export const proofOptions = () => [
  { value: 'off', label: tr('Never') },
  { value: 'hv_only', label: tr('High value') },
  { value: 'hv_and_recheck', label: tr('High value and recounts') },
]
// How the whole shop counts one product group; none of them is the rotation.
export const treatmentOptions = () => [
  { value: 'often', label: tr('More often') },
  { value: 'sample', label: tr('A sample only') },
  { value: 'never', label: tr('Not counted') },
]
// Monday 0, as the server keeps the rest days.
export const dayOptions = () =>
  [
    tr('Mon'),
    tr('Tue'),
    tr('Wed'),
    tr('Thu'),
    tr('Fri'),
    tr('Sat'),
    tr('Sun'),
  ].map((label, value) => ({ value, label }))
export const WEEKEND = Object.freeze([5, 6])

// A warehouse counted its own way: '' is «as the shop», first like «Todas».
export const blindOptions = () => [
  { value: '', label: tr('Like the shop') },
  { value: 'yes', label: tr('Yes') },
  { value: 'no', label: tr('No') },
]
export const ownProofOptions = () => [
  { value: '', label: tr('Like the shop') },
  ...proofOptions(),
]

export const treatmentLabel = (value) =>
  treatmentOptions().find((option) => option.value === value)?.label || ''

// ── sizes ────────────────────────────────────────────────────────────────

// The server's bounds (day_plan MIN_MINUTES / MAX_MINUTES, plan_dia
// MIN_PRODUCTS / MAX_PRODUCTS) and its proposal for a shop that never chose.
export const MINUTES = Object.freeze({ min: 5, max: 60, step: 5 })
export const PRODUCTS = Object.freeze({ min: 1, max: 200, step: 5 })
export const PROPOSED_MINUTES = 15
/** Cajas del día (scanner_kit services/cajas): cajones each person counts a shift. */
export const CAJONES = Object.freeze({ min: 0, max: 30, step: 1 })

/** The next stop of a stepper: the nearest multiple of `step` that way, inside the bounds. */
export function stepTo(value, direction, { min, max, step }) {
  const from = Number(value) || 0
  const next =
    direction > 0
      ? Math.floor(from / step) * step + step
      : Math.ceil(from / step) * step - step
  return Math.min(max, Math.max(min, next))
}

/** What a person typed into a stepper, as a whole number inside the bounds; null when it is no number. */
export function typedNumber(text, { min, max }) {
  const digits = String(text ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  return Math.min(max, Math.max(min, Number(digits)))
}

/** «12 productos», «1 producto». */
export const productWords = (count) =>
  Number(count) === 1 ? tr('1 product') : tr('{0} products', [count])

/** «15 min · 12 productos» for a list sized in minutes, «30 productos» in products. */
export function sizeWords(size) {
  if (!size) return ''
  const products = productWords(size.products)
  return size.minutes ? tr('{0} min · {1}', [size.minutes, products]) : products
}

/** «≈ 3 meses»: what the minutes buy. Null (no figure) reads as nothing. */
export function cycleWords(months) {
  if (months === null || months === undefined) return ''
  const n = Number(months)
  if (!Number.isFinite(n)) return ''
  if (n >= 18) {
    const years = Math.round((n / 12) * 2) / 2
    return tr('≈ {0} years', [years])
  }
  if (n >= 1.5) return tr('≈ {0} months', [Math.round(n)])
  if (n >= 0.75) return tr('≈ 1 month')
  const weeks = Math.round(n * 4.35)
  if (weeks >= 2) return tr('≈ {0} weeks', [weeks])
  if (weeks === 1) return tr('≈ 1 week')
  return tr('Under a week')
}

/** «38 %», or «—» while there is nothing to measure. */
export const percentWords = (pct) =>
  pct === null || pct === undefined || !Number.isFinite(Number(pct))
    ? '—'
    : `${Math.round(Number(pct))} %`

/** The currency's sign as the shell writes money («$», «USD »). */
export const currencySign = (currency) =>
  formatMoney(0, currency || undefined, { decimals: 0 }).replace(/0$/, '')

/** «1,000» from what was typed, null for nothing or no number. */
export function typedAmount(text) {
  const clean = String(text ?? '').replace(/[^\d.]/g, '')
  if (!clean) return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

/** A stored amount as the field shows it: grouped, cents only when there are some; zero is no amount. */
export function amountText(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)
}

// ── a person's day ───────────────────────────────────────────────────────

// A long list still reads as a bar: past this many, each mark is a share.
const MARKS = 24

/**
 * The marks of a person's day, in order: what matched, what did not, what
 * they skipped, what is left. One mark a product up to MARKS, a share past it.
 */
export function progressMarks(today) {
  if (!today || typeof today !== 'object') return []
  const total = Math.max(0, Number(today.total) || 0)
  if (!total) return []
  const parts = [
    ['ok', Number(today.ok) || 0],
    ['diff', Number(today.diff) || 0],
    ['skipped', Number(today.skipped) || 0],
  ]
  const done = parts.reduce((sum, [, n]) => sum + n, 0)
  parts.push(['todo', Math.max(0, total - done)])
  if (total <= MARKS) return parts.flatMap(([kind, n]) => Array(n).fill(kind))
  // A share each, and whatever has at least one product keeps a mark.
  const marks = parts.map(([kind, n]) => [
    kind,
    n ? Math.max(1, Math.round((n / total) * MARKS)) : 0,
  ])
  let spare = MARKS - marks.reduce((sum, [, n]) => sum + n, 0)
  const widest = () => marks.reduce((a, b) => (b[1] > a[1] ? b : a))
  for (; spare !== 0; spare += spare > 0 ? -1 : 1)
    widest()[1] += spare > 0 ? 1 : -1
  return marks.flatMap(([kind, n]) => Array(Math.max(0, n)).fill(kind))
}

/** «Pausa hasta 3 dic». */
export const pauseWords = (date) =>
  tr('Paused until {0}', [formatDate(date, { relative: false })])

/**
 * What a person's closed row says. `kind`:
 * `progress` (today's list: `figure` «5 de 13» and `marks`), `blocked` (the
 * server's reason their store cannot be counted), `state` (a word: «Descansa»,
 * the pause, «Sin lista hoy», or the size of the list the proposal gives
 * them) and `off` (does not count: the name alone).
 */
export function personLine(person, { on } = {}) {
  if (!person?.counts) return { kind: 'off', text: '' }
  if (person.blocked) return { kind: 'blocked', text: person.blocked }
  const today = person.today
  if (on && today && typeof today === 'object')
    return {
      kind: 'progress',
      figure: tr('{0} of {1}', [today.done, today.total]),
      marks: progressMarks(today),
      text: '',
    }
  if (person.paused_until)
    return { kind: 'state', text: pauseWords(person.paused_until) }
  if (today === 'rests' || person.works_today === false)
    return { kind: 'state', text: tr('Rests') }
  if (on) return { kind: 'state', text: tr('No list today') }
  return { kind: 'state', text: sizeWords(person.size) }
}

/** Initials for the grey disc. */
export const initialsOf = (name) => initials(name || '')

/**
 * The product groups a row of chips offers: the first level, plus any deeper
 * group already chosen (`picked`), so a choice made elsewhere can be seen and
 * undone here.
 */
export function groupChoices(groups, picked = []) {
  const chosen = new Set(picked)
  const known = new Set()
  const out = []
  for (const group of groups || []) {
    if (group.level === 1 || chosen.has(group.name)) {
      out.push(group.name)
      known.add(group.name)
    }
  }
  // A group that left the tree is still a row of theirs: it shows, to be cleared.
  for (const name of picked) if (!known.has(name)) out.push(name)
  return out
}

// ── the page ─────────────────────────────────────────────────────────────

/**
 * «Encender»: the proposal as the page shows it becomes the plan. The shown
 * minutes, rules and days are sent (a shop that never chose has none stored),
 * and everyone the page shows counting. Differences go only from someone who
 * sees the shop's money: the server keeps the stored choice for the rest.
 */
export function turnOnArgs(home) {
  const settings = home?.settings || {}
  return {
    on: 1,
    minutes: settings.minutes,
    rules: settings.rules || [],
    skip_weekdays: settings.skip_weekdays || [],
    people: (home?.people || [])
      .filter((person) => person.counts)
      .map((person) => person.user),
    ...(home?.sees_money ? { differences: settings.differences } : {}),
  }
}

// Escáner's two queues of differences waiting for a person (plan_dia `decide`).
const QUEUES = [
  ['ops', '/scan/conteo/ops', () => tr('Operations')],
  ['revision', '/scan/conteo/revision', () => tr('Review')],
]

/**
 * «N por decidir»: one row for each Escáner queue that holds rows, with the
 * way back to this page. Two rows name their queue; one needs no name.
 */
export function decideRows(decide, back = '/crm/inventario/conteos') {
  const rows = QUEUES.filter(([key]) => Number(decide?.[key]) > 0).map(
    ([key, path, name]) => ({
      key,
      count: Number(decide[key]),
      title: tr('{0} to decide', [Number(decide[key])]),
      queue: name(),
      href: withReturn(path, { to: back, label: tr('Daily counts') }),
    }),
  )
  return rows.map((row) => ({
    ...row,
    queue: rows.length > 1 ? row.queue : '',
  }))
}

/**
 * Cajas del día: one row for each recorrido whose artículos wait for two
 * reviews in Escáner, with the way back to this page.
 */
export function cajasRows(cajas, back = '/crm/inventario/conteos') {
  return (cajas?.waiting || []).map((w) => ({
    key: `cajas:${w.recorrido}`,
    count: Number(w.items),
    title: tr('{0} from the bins to approve', [Number(w.items)]),
    queue: Number(w.no_agreement)
      ? tr('{0} with no agreement', [Number(w.no_agreement)])
      : '',
    href: withReturn(w.link, { to: back, label: tr('Daily counts') }),
  }))
}

/** A person's cajones today: «Cajones 2 de 5 · 1 por recontar». */
export function cajasWords(day) {
  if (!day) return ''
  const parts = []
  if (day.assigned) parts.push(tr('Bins {0} of {1}', [day.done, day.assigned]))
  if (day.recounts) parts.push(tr('{0} to recount', [day.recounts]))
  return parts.join(' · ')
}

/** «75 de 147»: occupied cajones counted in the last 30 days. */
export const freshWords = (cajas) =>
  cajas?.cajones ? tr('{0} of {1}', [cajas.fresh_30d, cajas.cajones]) : '—'

/** What the loop adjusted alone this week: how many, and what it was worth. */
export function autoWords(cajas, currency) {
  const week = cajas?.week
  if (!week) return '—'
  const count = Number(week.auto || 0)
  if (week.auto_value === null || week.auto_value === undefined || !count)
    return String(count)
  return `${count} · ${formatMoney(week.auto_value, currency || undefined)}`
}

/** The rest days after a tap on a day chip. Sized in products the weekend moves as one. */
export function toggleDay(skip, day, { weekendOnly = false } = {}) {
  const resting = new Set(skip || [])
  const days = weekendOnly && WEEKEND.includes(day) ? WEEKEND : [day]
  const rest = !resting.has(day)
  for (const d of days) {
    if (rest) resting.add(d)
    else resting.delete(d)
  }
  return [...resting].sort((a, b) => a - b)
}

/** The days somebody counts: the chips that are on. */
export const countingDays = (skip) =>
  [0, 1, 2, 3, 4, 5, 6].filter((day) => !(skip || []).includes(day))
