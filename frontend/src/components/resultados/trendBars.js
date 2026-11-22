/**
 * The trend card's maths: buckets, the value axis and the date labels.
 * Pure: no DOM, no Vue, so the chart's shape is testable on its own.
 *
 * One bar per day up to six weeks. A longer window rolls up to weeks
 * (Monday to Sunday) and past about six months to calendar months, so a bar
 * never gets thinner than a finger can find on a phone. The server aligns
 * the comparison window index by index with the current one, so it rolls
 * up over the same index ranges.
 */
import { dayText } from '@/composables/useResultados'

const DAY_LIMIT = 45
const WEEK_LIMIT = 190
const LONG_DAY = { weekday: 'long', day: 'numeric', month: 'long' }

export function trendGrain(count) {
  if (count <= DAY_LIMIT) return 'day'
  return count <= WEEK_LIMIT ? 'week' : 'month'
}

const cents = (n) => Math.round(n * 100) / 100

function weekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(d - ((date.getDay() + 6) % 7))
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

function bucketKey(iso, grain) {
  if (grain === 'month') return iso.slice(0, 7)
  return grain === 'week' ? weekStart(iso) : iso
}

/**
 * The bars: `{from, to, value, tickets, prev, prevFrom, prevTo}` per day,
 * week or month. `prev` is null where the comparison has no point.
 */
export function trendBuckets(points, prev, grain = trendGrain(points.length)) {
  const out = []
  points.forEach((point, i) => {
    const key = bucketKey(String(point.date), grain)
    let bucket = out[out.length - 1]
    if (!bucket || bucket.key !== key) {
      bucket = {
        key,
        from: point.date,
        to: point.date,
        value: 0,
        tickets: 0,
        prev: null,
        prevFrom: '',
        prevTo: '',
      }
      out.push(bucket)
    }
    bucket.to = point.date
    bucket.value = cents(bucket.value + (Number(point.value) || 0))
    bucket.tickets += Number(point.tickets) || 0
    const before = prev?.[i]
    if (before) {
      bucket.prev = cents((bucket.prev ?? 0) + (Number(before.value) || 0))
      bucket.prevFrom ||= before.date
      bucket.prevTo = before.date
    }
  })
  return out
}

/**
 * A value axis on round numbers: the step snaps to 1, 2, 2.5 or 5 × 10ⁿ and
 * the ends to whole steps, with zero always on the axis.
 */
export function trendAxis(values, count = 4) {
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  if (hi === lo) return { min: 0, max: 1, ticks: [0] }
  const rough = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(rough))
  const n = rough / mag
  const step =
    (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks = []
  for (let k = 0; min + k * step <= max + step / 2; k++)
    ticks.push(cents(min + k * step))
  return { min, max, ticks }
}

function monthText(iso, withYear, month = withYear ? 'long' : 'short') {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month,
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/** The bar's name in short: «17 nov», «3 nov – 9 nov», «nov 2026». */
export function bucketText(bucket, grain) {
  if (grain === 'month') return monthText(bucket.from, true, 'short')
  if (grain === 'week' && bucket.from !== bucket.to)
    return `${dayText(bucket.from)} – ${dayText(bucket.to)}`
  return dayText(bucket.from)
}

/** The bar's name in full, for the tooltip. */
export function bucketTitle(bucket, grain) {
  if (grain === 'month') return monthText(bucket.from, true)
  if (grain === 'week') return bucketText(bucket, grain)
  return dayText(bucket.from, LONG_DAY)
}

/** The comparison's dates for the same bar. */
export function prevText(bucket, grain) {
  if (!bucket.prevFrom) return ''
  return bucketText({ from: bucket.prevFrom, to: bucket.prevTo }, grain)
}

/**
 * The labels under the bars: about six, each under its bar. Days read as
 * the day's number, with the month on the first label and where it changes;
 * months carry the year the same way.
 */
export function trendLabels(buckets, grain) {
  const n = buckets.length
  const most = grain === 'week' ? 5 : 6
  const step = n <= most + 2 ? 1 : Math.ceil(n / most)
  const years = new Set(buckets.map((b) => String(b.from).slice(0, 4)))
  const out = []
  let month = ''
  for (let i = 0; i < n; i += step) {
    const from = String(buckets[i].from)
    let text
    if (grain === 'month') {
      // Months name their year where it changes, when the window spans two.
      text = monthText(from, false)
      if (years.size > 1 && from.slice(0, 4) !== month.slice(0, 4))
        text = `${text} ${from.slice(2, 4)}`
    } else if (grain === 'week' || from.slice(0, 7) !== month) {
      text = dayText(from)
    } else {
      text = String(Number(from.slice(8, 10)))
    }
    month = from.slice(0, 7)
    out.push({ i, text })
  }
  return out
}
