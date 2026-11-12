// «Salud de tu sistema» in the owner's words (capability «health», Boat
// tenant_portal.site_health through miplan.call): whether the system works
// now, how much of the last 30 days it answered, how fast most pages open,
// one bar per day, the failures with how long each lasted, storage, the next
// planned maintenance and what the owner can fix, each with the step that
// opens it. Boat sends facts and keys; every word is written here. Times come
// in the site's zone (ISO 8601 with its offset) and are read with the site's
// clock (incidentes.siteClock). Only the fields named here are read. Pure.
import { LOCALE, formatMoney } from '@/utils/display'
import { capable } from './autoservicio'
import { lastedText, siteClock, sinceText } from './incidentes'

const t = (text, replace) => __(text, replace, 'Cuenta')
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, [n]))
const num = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const text = (value) => (typeof value === 'string' ? value.trim() : '')

export const DAY_STATES = ['ok', 'slow', 'down', 'none']
// The status line's tone: grey while it works, amber when slow, red when failing.
const TONES = { ok: 'ok', slow: 'warn', down: 'bad' }

/** «99.9 %»: Boat already floored it, so it is never rounded up here. */
export function percentText(pct) {
  const value = num(pct)
  if (value === null) return ''
  const figure = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
  }).format(value)
  // A no-break space keeps «%» on the figure's line.
  return `${figure}\u00a0%`
}

/**
 * A latency bound in the owner's words: «medio segundo», «1 segundo»,
 * «2.5 segundos». A bound under a tenth of a second reads as one tenth: «less
 * than» stays true when rounded up.
 */
export function durationWords(ms) {
  const value = num(ms)
  if (value === null || value <= 0) return ''
  if (value <= 100) return t('a tenth of a second')
  if (value <= 250) return t('a quarter of a second')
  if (value <= 500) return t('half a second')
  if (value === 1000) return t('1 second')
  const seconds = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
  }).format(value / 1000)
  return t('{0} seconds', [seconds])
}

/** {measuring, text, sub} for the availability line. */
export function availabilityView(availability, windowDays = 30) {
  const a = availability || {}
  if (a.measuring !== false || num(a.pct) === null)
    return {
      measuring: true,
      text: t('We are still measuring your system'),
      sub: t('We need a few more days of checks to give you a figure.'),
    }
  const sampled = num(a.sampled_days)
  return {
    measuring: false,
    text: t('Available {0} in the last {1} days', [
      percentText(a.pct),
      windowDays,
    ]),
    sub:
      sampled !== null && sampled < windowDays
        ? t('Counted on the {0} days we checked.', [sampled])
        : '',
  }
}

/** {measuring, text, sub} for the speed line: the range 95 of 100 pages open in. */
export function speedView(speed, windowDays = 30) {
  const s = speed || {}
  if (s.measuring === false && num(s.under_ms))
    return {
      measuring: false,
      text: t('Most pages open in under {0}', [durationWords(s.under_ms)]),
      sub: t(
        'That is how 95 of every 100 pages opened in the last {0} days, measured in ranges.',
        [windowDays],
      ),
    }
  if (s.measuring === false && num(s.over_ms))
    return {
      measuring: false,
      text: t('Many pages take more than {0} to open', [
        durationWords(s.over_ms),
      ]),
      sub: t(
        'More than 5 of every 100 pages took that long in the last {0} days.',
        [windowDays],
      ),
    }
  return {
    measuring: true,
    text: t('Not enough visits yet to measure the speed'),
    sub: '',
  }
}

const DAY_WORDS = {
  ok: () => t('Fine'),
  slow: () => t('Slow'),
  down: () => t('With a failure'),
  none: () => t('No data'),
}
export const dayWord = (state) => (DAY_WORDS[state] || DAY_WORDS.none)()

function calendarDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null
}
const dayFormat = (options) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' })

/** «14 oct»: the first day under the strip. */
export function shortDay(value) {
  const date = calendarDay(value)
  return date ? dayFormat({ day: 'numeric', month: 'short' }).format(date) : ''
}

/** The strip: one bar per day, oldest first, with its words for a title. */
export function dayRows(days) {
  if (!Array.isArray(days)) return []
  return days
    .filter((d) => d && calendarDay(d.day))
    .map((d) => {
      const state = DAY_STATES.includes(d.state) ? d.state : 'none'
      const label = dayFormat({ day: 'numeric', month: 'long' }).format(
        calendarDay(d.day),
      )
      return { day: d.day, state, label: `${label}: ${dayWord(state)}` }
    })
}

/** How many days of each state, in the legend's order, without the zeros. */
export function dayCounts(rows) {
  return DAY_STATES.map((state) => ({
    state,
    word: dayWord(state),
    count: rows.filter((r) => r.state === state).length,
  })).filter((c) => c.count)
}

const COUNT_WORDS = {
  ok: (n) => plural(n, '1 day fine', '{0} days fine'),
  slow: (n) => plural(n, '1 slow', '{0} slow'),
  down: (n) => plural(n, '1 with a failure', '{0} with a failure'),
  none: (n) => plural(n, '1 without data', '{0} without data'),
}

/** «Últimos 30 días: 27 días bien, 2 lentos, 1 con falla»: the strip in words. */
export function daysSummary(rows) {
  const parts = dayCounts(rows).map((c) => COUNT_WORDS[c.state](c.count))
  return parts.length
    ? t('Last {0} days: {1}', [rows.length, parts.join(', ')])
    : ''
}

/**
 * «Hoy a las 11:20», «9 de noviembre a las 10:00», «9 de noviembre a la
 * 1:05», read with the site's clock; '' when unknown.
 */
export function whenText(value, now = new Date()) {
  const clock = siteClock(value)
  if (!clock) return ''
  const minutes = String(clock.minute).padStart(2, '0')
  const one = clock.hour === 1
  const local =
    clock.offset === null ? null : new Date(now.getTime() + clock.offset * 6e4)
  const sameDay = local
    ? local.getUTCFullYear() === clock.year &&
      local.getUTCMonth() + 1 === clock.month &&
      local.getUTCDate() === clock.day
    : now.getFullYear() === clock.year &&
      now.getMonth() + 1 === clock.month &&
      now.getDate() === clock.day
  if (sameDay)
    return one
      ? t('Today at 1:{0}', [minutes])
      : t('Today at {0}', [`${clock.hour}:${minutes}`])
  const day = dayFormat({ day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(clock.year, clock.month - 1, clock.day, 12)),
  )
  return one
    ? t('{0} at 1:{1}', [day, minutes])
    : t('{0} at {1}', [day, `${clock.hour}:${minutes}`])
}

/**
 * The failures of the window, open first as Boat orders them. An open one
 * takes the status line's tone (red failing, amber slow); a fixed one is grey.
 */
export function failureRows(incidents, now = new Date()) {
  const items = Array.isArray(incidents?.items) ? incidents.items : []
  return items
    .filter((row) => row && text(row.title))
    .map((row, index) => {
      const open = row.status !== 'resolved'
      return {
        id: text(String(row.id ?? '')) || String(index),
        open,
        tone: !open ? 'ok' : row.kind === 'degraded' ? 'warn' : 'bad',
        title: text(row.title),
        when: whenText(row.started_at, now),
        lasted: open
          ? t('We are working on it.')
          : lastedText(row.started_at, row.resolved_at),
      }
    })
}

/**
 * The red bars no notice covered (Boat's unannounced_down_days): the checks
 * alone found the system failing those days. Said beside the failures, so the
 * list never reads «Sin fallas» under a red bar; '' with none.
 */
export function quietFailuresText(count, listed = false) {
  const n = Math.floor(num(count) || 0)
  if (n <= 0) return ''
  return listed
    ? plural(
        n,
        'Our checks also found failures on 1 more day.',
        'Our checks also found failures on {0} more days.',
      )
    : plural(
        n,
        'Our checks found failures on 1 day.',
        'Our checks found failures on {0} days.',
      )
}

/** The status line: works now, slow today, failing now; null for a site not in service. */
export function statusView(status, now = new Date()) {
  const state = status?.state
  if (!Object.hasOwn(TONES, state)) return null
  const title = text(status.title)
  const told = title
    ? [`${title}.`, sinceText(status.since, now)].filter(Boolean).join(' ')
    : ''
  const sub =
    state === 'down'
      ? told || t('Your system is not answering right now.')
      : state === 'slow'
        ? told || t('Some pages take longer than usual today.')
        : ''
  const words = {
    ok: t('Working well'),
    slow: t('Slow today'),
    down: t('Failing now'),
  }
  return { state, tone: TONES[state], text: words[state], sub }
}

// One decimal, as Resumen's storage meter shows the same figure.
const gb = (value) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value)

/** «2.4 de 10 GB»; «2.4 GB, sin límite» without an allowance. */
export function storageView(storage) {
  const used = num(storage?.used_gb)
  if (used === null) return null
  const allowance = num(storage.allowance_gb)
  const pct = num(storage.pct)
  if (!allowance)
    return { text: t('{0} GB, no limit', [gb(used)]), pct: null, warn: false }
  return {
    text: t('{0} of {1} GB', [gb(used), gb(allowance)]),
    pct: pct === null ? null : Math.max(0, Math.min(100, pct)),
    warn: pct !== null && pct >= 80,
  }
}

/** «Mantenimiento programado: 14 de noviembre a las 4:00. …» or ''. */
export function maintenanceText(maintenance, now = new Date()) {
  const when = whenText(maintenance?.at, now)
  return when
    ? t(
        'Scheduled maintenance: {0}. Your system shows a maintenance page for a few minutes; your data stays as it is.',
        [when],
      )
    : ''
}

const money = (value) => formatMoney(Number(value) || 0, 'MXN')
const last4 = (f) => text(String(f.last4 ?? '')).slice(-4)

// Each finding Boat names: its sentence, how serious, its step and button.
const FINDINGS = {
  overdue_invoice: (f) => ({
    level: 'bad',
    text:
      (num(f.count) || 0) > 1
        ? t('{0} invoices are overdue, {1} in total.', [
            f.count,
            money(f.amount_mxn),
          ])
        : t('An invoice of {0} is overdue.', [money(f.amount_mxn)]),
    act: 'pay',
    cta: t('See invoices'),
  }),
  wallet_short: (f) => ({
    level: 'bad',
    text:
      f.reason === 'stamps'
        ? t(
            'Your balance ({0}) does not cover the next stamp beyond your package ({1}).',
            [money(f.balance_mxn), money(f.need_mxn)],
          )
        : (num(f.days_left) || 0) <= 0
          ? t('Your balance no longer covers the airtime you sell.')
          : plural(
              num(f.days_left),
              'At this pace your balance covers 1 more day of airtime.',
              'At this pace your balance covers {0} more days of airtime.',
            ),
    act: 'topup',
    cta: t('Top up'),
  }),
  // With Boat's storage blocks the step buys more space (two taps).
  storage_high: (f, caps) => ({
    level: 'warn',
    text: t('Your storage is at {0} of what your plan includes.', [
      percentText(f.pct),
    ]),
    act: caps.storage ? 'storage' : 'plans',
    cta: caps.storage ? t('Get more space') : t('See plans'),
  }),
  seats_full: (f, caps) => ({
    level: 'warn',
    text:
      f.which === 'sucursales'
        ? plural(
            num(f.cap),
            'You use the one register of your plan.',
            'You use all {0} registers of your plan.',
          )
        : plural(
            num(f.cap),
            'You use the one user of your plan.',
            'You use all {0} users of your plan.',
          ),
    act: caps.seats ? 'seats' : 'plans',
    cta: caps.seats ? t('See users and registers') : t('See plans'),
  }),
  card_expiring: (f) => ({
    level: f.when === 'expired' ? 'bad' : 'warn',
    text:
      f.when === 'expired'
        ? t('Your card ending in {0} has expired.', [last4(f)])
        : f.when === 'this_month'
          ? t('Your card ending in {0} expires this month.', [last4(f)])
          : t('Your card ending in {0} expires next month.', [last4(f)]),
    act: 'card',
    cta: t('See cards'),
  }),
  stamps_high: (f) => ({
    level: 'warn',
    text: t('You have used {0} of the {1} stamps in your package this month.', [
      f.used,
      f.included,
    ]),
    act: 'addons',
    cta: t('See add-ons'),
  }),
}

/** What the owner can fix, the serious ones first; a kind this panel does not know is left out. */
export function findingRows(findings, data) {
  const caps = {
    seats: capable(data, 'seats'),
    // Only where Boat can sell a block now (else the plans are the way).
    storage:
      capable(data, 'storage_blocks') && data?.storage_blocks?.can_add === true,
  }
  const rows = (Array.isArray(findings) ? findings : [])
    .filter((f) => f && Object.hasOwn(FINDINGS, f.kind))
    .map((f, index) => ({
      key: `${f.kind}:${index}`,
      ...FINDINGS[f.kind](f, caps),
    }))
  return [
    ...rows.filter((row) => row.level === 'bad'),
    ...rows.filter((row) => row.level !== 'bad'),
  ]
}

/** «Tienes 2 cosas para revisar»; '' with none. */
export function reviewCount(rows) {
  return rows.length
    ? plural(
        rows.length,
        'You have 1 thing to review',
        'You have {0} things to review',
      )
    : ''
}

/** Everything the block and its sheet show, or null for an answer that is not ok. */
export function healthView(answer, data, now = new Date()) {
  if (answer?.ok !== true) return null
  const windowDays = num(answer.window_days) || 30
  const days = dayRows(answer.days)
  const findings = findingRows(answer.findings, data)
  const failures = failureRows(answer.incidents, now)
  return {
    windowDays,
    status: statusView(answer.status, now),
    availability: availabilityView(answer.availability, windowDays),
    speed: speedView(answer.speed, windowDays),
    days,
    first: days.length ? shortDay(days[0].day) : '',
    summary: daysSummary(days),
    counts: dayCounts(days),
    tracked: answer.incidents?.tracked === true,
    failures,
    quietFailures: quietFailuresText(
      answer.incidents?.unannounced_down_days,
      failures.length > 0,
    ),
    storage: storageView(answer.storage),
    maintenance: maintenanceText(answer.maintenance, now),
    findings,
    review: reviewCount(findings),
  }
}
