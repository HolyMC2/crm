// Quick add for Pendientes (Shell-S8, 2026-10-28): one line in es-MX words
// becomes a pendiente. «Llamar a Olga mañana 5pm @Olga» reads as the title
// «Llamar a Olga», due tomorrow at 17:00, for Olga. Each word the parser takes
// is a token the composer shows as a chip; removing a chip puts the words back
// in the title (`ignore`). Pure: the shop's civil day comes from the server.

const DAY = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const NUMBERS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 }
const WEEKDAY = `(${WEEKDAYS.join('|')})`
const MONTH = `(${MONTHS.join('|')}|${MONTHS.map((m) => m.slice(0, 3)).join('|')}|sept)`
// A token ends at a space, punctuation or the end; it starts after one.
const END = '(?=$|[\\s,.;:!?)])'
const START = '(?:^|(?<=[\\s,(]))'

/** Lower case without accents, one character for one, so offsets still match. */
export function fold(text) {
  return [...String(text || '')]
    .map((char) =>
      char
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .slice(0, 1),
    )
    .join('')
}

const pad = (value) => String(value).padStart(2, '0')
function toDay(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
function parseDay(day) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}
export function addDays(day, days) {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() + days)
  return toDay(date)
}
function weekdayIndex(word) {
  return WEEKDAYS.indexOf(word)
}
/** The next `weekday` from today; today itself counts unless `strict`. */
function nextWeekday(today, weekday, strict = false) {
  const from = parseDay(today).getUTCDay()
  let ahead = (weekday - from + 7) % 7
  if (strict && ahead === 0) ahead = 7
  return addDays(today, ahead)
}
function monthIndex(word) {
  if (word === 'sept') return 8
  const full = MONTHS.indexOf(word)
  return full >= 0 ? full : MONTHS.findIndex((m) => m.slice(0, 3) === word)
}
/** The next calendar day `date` of `month` (0-11), this year or the next. */
function nextDate(today, date, month) {
  const now = parseDay(today)
  for (let add = 0; add < 2; add++) {
    const candidate = new Date(
      Date.UTC(now.getUTCFullYear() + add, month, date),
    )
    if (candidate.getUTCMonth() !== month) continue
    const day = toDay(candidate)
    if (day >= today) return day
  }
  return ''
}
/** The next day `date` of any month (today counts). */
function nextMonthDay(today, date) {
  const now = parseDay(today)
  for (let add = 0; add < 13; add++) {
    const candidate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + add, date),
    )
    if (candidate.getUTCDate() !== date) continue
    const day = toDay(candidate)
    if (day >= today) return day
  }
  return ''
}
function hour24(hour, minute, meridiem, assumeAfternoon) {
  let h = Number(hour)
  const m = Number(minute || 0)
  if (h > 23 || m > 59) return ''
  if (meridiem === 'pm' && h < 12) h += 12
  else if (meridiem === 'am' && h === 12) h = 0
  else if (!meridiem && assumeAfternoon && h >= 1 && h <= 7) h += 12
  return `${pad(h)}:${pad(m)}`
}
function meridiemOf(text = '') {
  const word = text.replace(/[\s.]/g, '')
  if (word === 'pm') return 'pm'
  if (word === 'am') return 'am'
  return ''
}

// Each rule: a pattern over the folded text and what it means. Earlier rules
// win where matches overlap (longest phrases first).
function rules(today) {
  return [
    // ── repeat ──
    {
      kind: 'repeat',
      re: `(?:cada|todos los) ${WEEKDAY}s?`,
      // The first «lunes» unless the line names its own day («mañana … cada lunes»).
      read: (m) => ({
        repeat: 'Weekly',
        startsOn: nextWeekday(today, weekdayIndex(m[1])),
      }),
    },
    {
      kind: 'repeat',
      re: '(?:entre semana|de lunes a viernes|dias habiles|cada dia habil)',
      read: () => ({ repeat: 'Weekdays' }),
    },
    {
      kind: 'repeat',
      re: '(?:cada dia|todos los dias|diario|diariamente)',
      read: () => ({ repeat: 'Daily' }),
    },
    {
      kind: 'repeat',
      re: '(?:cada semana|todas las semanas|semanal|semanalmente)',
      read: () => ({ repeat: 'Weekly' }),
    },
    {
      kind: 'repeat',
      re: '(?:cada mes|todos los meses|mensual|mensualmente)',
      read: () => ({ repeat: 'Monthly' }),
    },
    {
      kind: 'repeat',
      re: '(?:cada ano|todos los anos|anual|anualmente)',
      read: () => ({ repeat: 'Yearly' }),
    },
    // ── day ──
    {
      kind: 'date',
      re: 'pasado manana',
      read: () => ({ date: addDays(today, 2) }),
    },
    {
      // «mañana en la mañana» = tomorrow morning; a lone «en la mañana» is a time.
      kind: 'date',
      re: '(?<!(?:en|por) la )manana',
      read: () => ({ date: addDays(today, 1) }),
    },
    { kind: 'date', re: 'hoy', read: () => ({ date: today }) },
    {
      kind: 'date',
      re: `(?:el )?(?:(?:proximo|siguiente) )?${WEEKDAY}(?: (\\d{1,2})(?! ?(?:am|pm|a\\.m\\.|p\\.m\\.|:|hrs|h\\b)))?`,
      read: (m) => weekdayDate(today, m),
    },
    {
      kind: 'date',
      re: `(?:el )?(\\d{1,2}) de ${MONTH}`,
      read: (m) => ({ date: nextDate(today, Number(m[1]), monthIndex(m[2])) }),
    },
    {
      kind: 'date',
      re: '(\\d{1,2})/(\\d{1,2})',
      read: (m) => ({ date: nextDate(today, Number(m[1]), Number(m[2]) - 1) }),
    },
    {
      kind: 'date',
      re: `en (\\d{1,2}|un|una|dos|tres|cuatro|cinco) (dias?|semanas?|mes(?:es)?)`,
      read: (m) => {
        const count = Number(m[1]) || NUMBERS[m[1]] || 0
        if (m[2].startsWith('dia')) return { date: addDays(today, count) }
        if (m[2].startsWith('semana'))
          return { date: addDays(today, count * 7) }
        const date = parseDay(today)
        date.setUTCMonth(date.getUTCMonth() + count)
        return { date: toDay(date) }
      },
    },
    {
      kind: 'date',
      re: '(?:la )?(?:proxima|otra|siguiente) semana',
      read: () => ({ date: nextWeekday(today, 1, true) }),
    },
    {
      kind: 'date',
      re: 'fin de mes',
      read: () => {
        const date = parseDay(today)
        return {
          date: toDay(
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
          ),
        }
      },
    },
    {
      kind: 'date',
      re: 'el (\\d{1,2})(?! ?(?:am|pm|:|de\\b|/))',
      read: (m) => ({ date: nextMonthDay(today, Number(m[1])) }),
    },
    // ── time ──
    {
      kind: 'time',
      re: 'a (?:la|las) (\\d{1,2})(?::(\\d{2}))?(?: ?(am|pm|a\\.m\\.|p\\.m\\.|hrs|h)\\b\\.?)?',
      read: (m) => ({ time: hour24(m[1], m[2], meridiemOf(m[3]), true) }),
    },
    {
      kind: 'time',
      re: 'a la una',
      read: () => ({ time: '13:00' }),
    },
    {
      kind: 'time',
      re: '(\\d{1,2})(?::(\\d{2}))? ?(am|pm|a\\.m\\.|p\\.m\\.)',
      read: (m) => ({ time: hour24(m[1], m[2], meridiemOf(m[3]), false) }),
    },
    {
      kind: 'time',
      re: '(\\d{1,2}):(\\d{2})(?: ?(?:hrs|h)\\b\\.?)?',
      read: (m) => ({ time: hour24(m[1], m[2], '', false) }),
    },
    {
      kind: 'time',
      re: '(\\d{1,2}) ?(?:hrs|h)\\b\\.?',
      read: (m) => ({ time: hour24(m[1], 0, '', false) }),
    },
    { kind: 'time', re: 'mediodia', read: () => ({ time: '12:00' }) },
    {
      kind: 'time',
      re: '(?:en|por) la (manana|tarde|noche)',
      read: (m) => ({
        time: { manana: '09:00', tarde: '16:00', noche: '19:00' }[m[1]],
      }),
    },
    // ── priority ──
    {
      kind: 'priority',
      re: '(?:!alta|!!|urgente|importante)',
      read: () => ({ priority: 'High' }),
    },
    { kind: 'priority', re: '!baja', read: () => ({ priority: 'Low' }) },
    { kind: 'priority', re: '!media', read: () => ({ priority: 'Medium' }) },
  ]
}

// «viernes» is the next Friday (today counts); «viernes 10» the next Friday the
// 10th within two months, else Friday at 10:00 (the chip says which).
function weekdayDate(today, m) {
  const weekday = weekdayIndex(m[1])
  if (!m[2]) return { date: nextWeekday(today, weekday) }
  const number = Number(m[2])
  if (number >= 1 && number <= 31) {
    const now = parseDay(today)
    // Within the next two months: «viernes 10» in October is not next September.
    for (let add = 0; add < 3; add++) {
      const candidate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + add, number),
      )
      if (candidate.getUTCDate() !== number) continue
      const day = toDay(candidate)
      if (day >= today && candidate.getUTCDay() === weekday) return { date: day }
    }
  }
  const time = number <= 23 ? hour24(number, 0, '', true) : ''
  return { date: nextWeekday(today, weekday), ...(time ? { time } : {}) }
}

/**
 * @param text    what the worker typed
 * @param today   the shop's civil day (YYYY-MM-DD)
 * @param people  [{ user, name, me }] coworkers for «@Olga»
 * @param ignore  folded token texts the worker removed (their words stay)
 * @returns {{ title, date, time, repeat, priority, person, mention, tokens }}
 */
export function parseQuickAdd(text, { today = '', people = [], ignore = [] } = {}) {
  const raw = String(text || '')
  const folded = fold(raw)
  const skip = new Set(ignore)
  const taken = []
  const out = {
    date: '',
    time: '',
    repeat: '',
    priority: '',
    person: null,
    mention: '',
  }
  let startsOn = ''
  const free = (start, end) =>
    !taken.some((t) => start < t.end && end > t.start)
  const take = (kind, start, end, values) => {
    taken.push({ kind, start, end, text: raw.slice(start, end), values })
  }
  // «@Olga»: the first mention, matched to a coworker by any word of the name.
  const mention = /@([\p{L}\p{N}._-]+)/u.exec(raw)
  if (mention && !skip.has(fold(mention[0]))) {
    const wanted = fold(mention[1])
    const found =
      people.find((person) =>
        fold(person.name).split(/\s+/).some((word) => word === wanted),
      ) ||
      people.find((person) =>
        fold(person.name)
          .split(/\s+/)
          .some((word) => word.startsWith(wanted)),
      ) ||
      people.find((person) => fold(person.user).startsWith(wanted))
    out.mention = mention[1]
    out.person = found ? { user: found.user, name: found.name } : null
    take('person', mention.index, mention.index + mention[0].length, {})
  }
  if (DAY.test(today)) {
    for (const rule of rules(today)) {
      const re = new RegExp(`${START}${rule.re}${END}`, 'gu')
      for (const match of folded.matchAll(re)) {
        const start = match.index
        const end = start + match[0].length
        if (skip.has(match[0]) || !free(start, end)) continue
        const values = rule.read(match)
        if (!values || Object.values(values).some((value) => value === ''))
          continue
        // One value per detail: the first phrase wins, later ones stay words.
        if (Object.keys(values).some((key) => key !== 'date' && out[key]))
          continue
        if (values.date && out.date && rule.kind === 'date') continue
        if (values.startsOn) startsOn = values.startsOn
        if (values.date && !out.date) out.date = values.date
        for (const key of ['time', 'repeat', 'priority'])
          if (values[key]) out[key] = values[key]
        take(rule.kind, start, end, values)
      }
    }
    if (!out.date && startsOn) out.date = startsOn
    // A time alone means today (Todoist); a repeat alone starts today.
    if ((out.time || out.repeat) && !out.date) out.date = today
  }
  taken.sort((a, b) => a.start - b.start)
  let title = ''
  let at = 0
  for (const token of taken) {
    title += raw.slice(at, token.start)
    at = token.end
  }
  title += raw.slice(at)
  title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:^|\s)(?:el|la|a las|a la|para|de)\s*$/iu, '')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .trim()
  return {
    title,
    ...out,
    tokens: taken.map(({ kind, start, end, text }) => ({
      kind,
      start,
      end,
      text,
      key: fold(text),
    })),
  }
}

/** What the composer sends to `doco.pendientes.api.create`. */
export function createValues(parsed, { me = '' } = {}) {
  return {
    description: parsed.title,
    date: parsed.date || '',
    time: parsed.date ? parsed.time || '' : '',
    priority: parsed.priority || 'Medium',
    repeat: parsed.repeat || '',
    assigned_to:
      parsed.person?.user && parsed.person.user !== me ? parsed.person.user : '',
  }
}
