// A Muelle outage on this site, as its owner was told by mail (capability
// «incidents», Boat tenant_portal.my_incidents through miplan.call): open ones,
// and those fixed in the last 24 h. Boat writes the title and the detail in
// es-MX without a host, cell or alert name; only those fields and the times
// are read here, never anything else Boat may add. Times come in the site's
// zone (ISO 8601 with its offset), so the clock shown is the site's in any
// browser. Pure.
import { LOCALE } from '@/utils/display'

const t = (text, replace) => __(text, replace, 'Cuenta')

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

/** {year, month, day, hour, minute, offset (minutes or null), at (Date)} or null. */
export function siteClock(value) {
  const m = ISO.exec(String(value || '').trim())
  if (!m) return null
  const [, y, mo, d, h, mi, zone] = m
  let offset = null
  if (zone === 'Z') offset = 0
  else if (zone) {
    const digits = zone.replace(':', '')
    const sign = digits[0] === '-' ? -1 : 1
    offset = sign * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3)))
  }
  // A time without an offset is read as the browser's own.
  const at =
    offset === null
      ? new Date(+y, +mo - 1, +d, +h, +mi)
      : new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - offset * 6e4)
  return {
    year: +y,
    month: +mo,
    day: +d,
    hour: +h,
    minute: +mi,
    offset,
    at,
  }
}

// The site's calendar day at `now`, read with the incident's own offset.
function sameSiteDay(clock, now) {
  if (clock.offset === null)
    return (
      now.getFullYear() === clock.year &&
      now.getMonth() + 1 === clock.month &&
      now.getDate() === clock.day
    )
  const local = new Date(now.getTime() + clock.offset * 6e4)
  return (
    local.getUTCFullYear() === clock.year &&
    local.getUTCMonth() + 1 === clock.month &&
    local.getUTCDate() === clock.day
  )
}

/**
 * «Desde las 11:58» today; «Desde la 1:05» at one o'clock; «Desde el 10 de
 * noviembre a las 23:50» on another day. The hour has no leading zero, as in
 * Boat's mail. '' when the time is unknown.
 */
export function sinceText(value, now = new Date()) {
  const clock = siteClock(value)
  if (!clock) return ''
  const minutes = String(clock.minute).padStart(2, '0')
  const time = `${clock.hour}:${minutes}`
  const one = clock.hour === 1
  if (sameSiteDay(clock, now))
    return one ? t('Since 1:{0}', [minutes]) : t('Since {0}', [time])
  const day = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(clock.year, clock.month - 1, clock.day)))
  return one
    ? t('Since {0} at 1:{1}', [day, minutes])
    : t('Since {0} at {1}', [day, time])
}

/** «Duró alrededor de 15 minutos.», rounded to the hour past one; '' when unknown. */
export function lastedText(startedAt, resolvedAt) {
  const start = siteClock(startedAt)
  const end = siteClock(resolvedAt)
  if (!start || !end) return ''
  const minutes = Math.round(Math.max(0, end.at - start.at) / 6e4)
  if (minutes < 1) return t('It lasted less than a minute.')
  if (minutes === 1) return t('It lasted about a minute.')
  if (minutes < 60) return t('It lasted about {0} minutes.', [minutes])
  const hours = Math.round(minutes / 60)
  return hours === 1
    ? t('It lasted about an hour.')
    : t('It lasted about {0} hours.', [hours])
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The rows Resumen shows, open first as Boat orders them: {id, kind (outage |
 * degraded), open, title, when, detail}. An answer that is not ok (the seam
 * off, a refusal) shows nothing.
 */
export function incidentRows(answer, now = new Date()) {
  if (answer?.ok !== true || !Array.isArray(answer.incidents)) return []
  return answer.incidents
    .filter((row) => row && text(row.title))
    .slice(0, 3)
    .map((row, index) => {
      const open = row.status !== 'resolved'
      return {
        id: text(String(row.id ?? '')) || String(index),
        kind: row.kind === 'degraded' ? 'degraded' : 'outage',
        open,
        title: text(row.title),
        when: open
          ? sinceText(row.started_at, now)
          : [
              t('Fixed: your system works normally again.'),
              lastedText(row.started_at, row.resolved_at),
            ]
              .filter(Boolean)
              .join(' '),
        detail: open
          ? [
              text(row.detail),
              t(
                'You do not need to do anything; we tell you when it is fixed.',
              ),
            ]
              .filter(Boolean)
              .join(' ')
          : '',
      }
    })
}
