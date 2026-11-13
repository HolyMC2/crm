// «Respaldos» in the owner's words (capability «backups», Boat
// tenant_portal.my_backups and download_backup through miplan.call): the
// copies Muelle made of the whole system, each with its day and size, when the
// newest was made, the next one and the copy kept off site. A copy older than
// two days reads «Tu respaldo más reciente es de hace N días; ya lo estamos
// revisando», never «al día», and Boat holds its download while that lasts or
// while it reviews the copies. «Descargar» asks for the password and then
// hands over Boat's 5-minute link, to the account owner only (doco answers
// `account_owner`; «Mi Plan» sees the list, not the download). Resumen's
// backup row reads Boat's `backups.newest_at`, the same copy the sheet lists.
// Times come in the site's zone (ISO 8601 with its offset) and are read with
// the site's clock. Only the fields named here are read. Pure.
import { LOCALE, formatDate } from '@/utils/display'
import { capable } from './autoservicio'
import { siteClock } from './incidentes'
import { whenText } from './salud'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const CAPABILITY = 'backups'
// Boat's stale line (backup_panel.STALE_HOURS): a copy older than this is late.
export const STALE_DAYS = 2
const HOLDS = ['stale', 'review', 'unavailable']
const OFFSITE = ['ok', 'late', 'none']

/** Whether Resumen's backup row opens «Respaldos» (bootstrap.capabilities). */
export const backupsOn = (data) => capable(data, CAPABILITY)

/** Whether this person may download a copy (doco's `account_owner`). */
export const backupOwner = (data) => data?.account_owner === true

/**
 * «Estado del sitio» with its backup row on the copy «Respaldos» lists (Boat's
 * `backups` {newest_at, stale}) where the capability is on, not the site's
 * local backup, so the row and the sheet never disagree. The row keeps its
 * short day («hoy», «ayer», «9 nov») like the rows beside it; the sheet says
 * the hour.
 */
export function withBackupCopy(rows, data, now = new Date()) {
  const copy = data?.backups
  if (!backupsOn(data) || !copy || typeof copy !== 'object') return rows
  return rows.map((row) =>
    row.key === 'backup'
      ? {
          ...row,
          value: formatDate(copy.newest_at, { now }) || t('No record'),
          warn: copy.stale === true,
        }
      : row,
  )
}

/** «1.2 GB», «350 MB», «12 KB» (a no-break space before the unit); '' when unknown. */
export function sizeText(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  const units = [
    [1024 ** 3, 'GB'],
    [1024 ** 2, 'MB'],
    [1024, 'KB'],
  ]
  for (const [size, unit] of units)
    if (value >= size) {
      const figure = new Intl.NumberFormat(LOCALE, {
        maximumFractionDigits: value / size >= 10 ? 0 : 1,
      }).format(value / size)
      // A no-break space keeps the unit on the figure's line.
      return `${figure}\u00a0${unit}`
    }
  return '1\u00a0KB'
}

/**
 * «12 de noviembre a las 3:20» with the hour bound to the two words before it
 * (no-break spaces): a narrow row breaks before «a las 3:20», never between
 * «las» and the hour.
 */
export function keepHour(text) {
  return String(text || '').replace(
    /(\S+) (\S+) (\d{1,2}:\d{2})$/u,
    '$1\u00a0$2\u00a0$3',
  )
}

/** Whole days since `value` (ISO with the site's offset); null when unknown. */
export function daysOld(value, now = new Date()) {
  const clock = siteClock(value)
  if (!clock) return null
  return Math.max(Math.floor((now - clock.at) / 86400000), 0)
}

/** The amber line over a late copy: never «al día». */
export function staleText(newestAt, now = new Date()) {
  const days = Math.max(daysOld(newestAt, now) ?? STALE_DAYS, STALE_DAYS)
  return t(
    'Your newest backup is from {0} days ago; we are already looking into it.',
    [days],
  )
}

/** Why «Descargar» is held, in the owner's words; '' when it is not. */
export function holdText(hold, newestAt, now = new Date()) {
  if (hold === 'stale') return staleText(newestAt, now)
  if (hold === 'review')
    return t(
      'We are checking your backups. You can download them again as soon as we finish.',
    )
  if (hold === 'unavailable')
    return t('We could not read your backups right now.')
  return ''
}

/** «Copia externa»: when the copy kept off site was made, late, or none yet. */
export function offsiteText(offsite, now = new Date()) {
  const state = OFFSITE.includes(offsite?.state) ? offsite.state : 'none'
  if (state === 'late') return t('Late; we are already looking into it')
  if (state === 'ok') return whenText(offsite.at, now) || t('Yes')
  return t('Not yet')
}

/**
 * The sheet as the owner reads it, from my_backups (null before the first
 * answer): `state` loading | off | failed | empty | list, Boat's message when
 * it has the seam off, the rows (id, when, size), the facts above them, the
 * held line, whether «Descargar» shows (the account owner only) and the line
 * that says why it does not for anyone else.
 */
export function backupsView(answer, now = new Date(), { owner = false } = {}) {
  if (!answer) return { state: 'loading', rows: [], facts: [] }
  if (answer.ok === false && answer.reason === 'disabled')
    return {
      state: 'off',
      rows: [],
      facts: [],
      message:
        (typeof answer.message === 'string' && answer.message.trim()) ||
        t('Backups are not available for your system yet.'),
    }
  if (answer.ok !== true) return { state: 'failed', rows: [], facts: [] }
  const hold = HOLDS.includes(answer.hold) ? answer.hold : null
  if (hold === 'unavailable') return { state: 'failed', rows: [], facts: [] }
  const rows = (Array.isArray(answer.backups) ? answer.backups : [])
    .filter((row) => row && typeof row.id === 'string' && row.id)
    .map((row) => ({
      id: row.id,
      when: keepHour(whenText(row.uploaded_at, now)),
      size: sizeText(row.size_bytes),
    }))
  const facts = []
  if (rows.length && answer.newest_at)
    facts.push({
      key: 'newest',
      label: t('Newest backup'),
      value: whenText(answer.newest_at, now),
      warn: answer.stale === true,
    })
  const next = whenText(answer.next_upload_at, now)
  if (next) facts.push({ key: 'next', label: t('Next backup'), value: next })
  if (answer.offsite)
    facts.push({
      key: 'offsite',
      label: t('Copy kept off site'),
      value: offsiteText(answer.offsite, now),
      warn: answer.offsite.state === 'late',
    })
  const stale = answer.stale === true || hold === 'stale'
  const offered = rows.length > 0 && answer.downloadable === true && !hold
  return {
    state: rows.length ? 'list' : 'empty',
    rows,
    facts,
    stale,
    held: hold ? holdText(hold, answer.newest_at, now) : '',
    downloadable: offered && owner === true,
    ownerOnly:
      offered && owner !== true
        ? t('Only the account owner can download a backup.')
        : '',
  }
}

/** «10:25», «1:05», «0:58»: when a link that lasts `seconds` from `now` stops working. */
export function linkUntil(seconds, now = new Date()) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return ''
  const until = new Date(now.getTime() + value * 1000)
  return `${until.getHours()}:${String(until.getMinutes()).padStart(2, '0')}`
}

/** «…, hasta las 10:25.» and, at one o'clock, «…, hasta la 1:05.» */
export function readyText(seconds, now = new Date()) {
  const until = linkUntil(seconds, now)
  if (!until) return ''
  const [hour, minutes] = until.split(':')
  return hour === '1'
    ? t('Your download is ready. The link works for 5 minutes, until 1:{0}.', [
        minutes,
      ])
    : t('Your download is ready. The link works for 5 minutes, until {0}.', [
        until,
      ])
}

/**
 * What download_backup answered: {url, seconds} for a link Boat signed (only
 * an https one), {refusal} with Boat's sentence (or the password step's) and
 * whether it asks for the password again, or {held} when Boat holds it now.
 */
export function linkView(answer) {
  if (answer?.ok === true) {
    const url = typeof answer.url === 'string' ? answer.url : ''
    if (/^https:\/\//.test(url)) {
      const seconds = Number(answer.expires_in_sec)
      return {
        url,
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 300,
      }
    }
  }
  const message =
    (typeof answer?.message === 'string' && answer.message.trim()) ||
    t('We could not prepare the download. Try again.')
  return {
    refusal: message,
    password: ['password', 'reset_password'].includes(answer?.next),
    held: answer?.reason === 'held' || answer?.reason === 'disabled',
  }
}
