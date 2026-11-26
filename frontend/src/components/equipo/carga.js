// Equipo › Carga (pages/EquipoCarga.vue): the words, tones and dates of the screen,
// kept here so a unit test reads what the owner sees.
import { formatDate } from '@/utils/display'

// Tones are StatusChip's: colour only where something needs a look («Aporta» is the
// normal state and stays neutral).
const VERDICTS = {
  sin_aporte: ['Nothing done', 'danger'],
  bajo: ['Low', 'warning'],
  compensa: ['Makes up for it', 'info'],
  aporta: ['Contributes', 'neutral'],
  sin_datos: ['No data yet', 'neutral'],
}

export function verdictLabel(verdict) {
  return __((VERDICTS[verdict] || VERDICTS.sin_datos)[0], null, 'Equipo')
}

export function verdictTone(verdict) {
  return (VERDICTS[verdict] || VERDICTS.sin_datos)[1]
}

/** An area's level: strong reads on the secondary container, nothing in the warning tone. */
export function levelClass(level) {
  if (level === 'alto')
    return 'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
  if (level === 'nada') return 'bg-surface-amber-2 text-ink-amber-8'
  if (level === 'bajo') return 'bg-surface-gray-3 text-ink-gray-8'
  return 'bg-surface-gray-2 text-ink-gray-8'
}

export function extraLabel(extra) {
  return extra === 1
    ? __('1 extra task', null, 'Equipo')
    : __('{0} extra tasks', [extra], 'Equipo')
}

/** YYYY-MM-DD moved `days` days (local calendar, no time zone drift). */
export function shiftDay(value, days) {
  const [y, m, d] = String(value).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function rangeLabel(answer) {
  if (!answer) return ''
  const day = (value) => formatDate(value, { weekday: true })
  return answer.start === answer.end
    ? day(answer.start)
    : `${day(answer.start)} – ${day(answer.end)}`
}
