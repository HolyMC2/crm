// The editor's look at the pendiente's day in the Agenda: what is already there, by hour,
// and the free hours a tap can take. Pure, so the sheet and its tests share it.
import { instantToWall } from '@/composables/useAgenda'

const minutesOf = (clock) => {
  const [h, m] = String(clock || '')
    .split(':')
    .map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** That day's events and pendientes, timed first by hour, then the whole-day ones. */
export function peekItems(events, timeZone, skipId = '') {
  return events
    .filter((event) => event.id !== skipId && event.status !== 'Cancelled')
    .map((event) => {
      const start = event.allDay ? null : instantToWall(event.start, timeZone)
      const end = event.allDay ? null : instantToWall(event.end, timeZone)
      return {
        key: `${event.source}:${event.id}`,
        title: event.title,
        task: event.kind === 'task',
        done: event.status === 'Done',
        time: start?.time || '',
        // An event that runs past midnight blocks the rest of the day.
        until: end ? (end.date !== start.date ? '24:00' : end.time) : '',
      }
    })
    .sort(
      (a, b) =>
        Number(!a.time) - Number(!b.time) || a.time.localeCompare(b.time),
    )
}

/** On-the-hour times between `from` and `to` that nothing timed covers (today: from the next hour). */
export function freeHours(
  items,
  { date, today, nowMinutes = 0, from = 9, to = 18, max = 4 },
) {
  const busy = items
    .filter((item) => item.time && !item.done)
    .map((item) => {
      const start = minutesOf(item.time)
      const end = minutesOf(item.until)
      return [start, end > start ? end : start + 30]
    })
  const first =
    date === today ? Math.max(from, Math.floor(nowMinutes / 60) + 1) : from
  const hours = []
  for (let hour = first; hour <= to && hours.length < max; hour++) {
    const start = hour * 60
    if (busy.some(([a, b]) => a < start + 60 && b > start)) continue
    hours.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return hours
}
