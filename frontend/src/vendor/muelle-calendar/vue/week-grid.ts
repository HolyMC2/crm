import { daySlots, eventsForDay, formatTime, layoutEvents, type DaySlot, type Event, type PositionedEvent } from '../core'

export interface WeekRow { key: string; label: string }
export interface WeekSlot extends DaySlot { key: string; row: number }
export interface WeekEntry { layout: PositionedEvent; startRow: number; endRow: number }
export interface WeekColumn { date: string; slots: WeekSlot[]; entries: WeekEntry[] }

export function weekRowAt(slots: readonly WeekSlot[], rowCount: number, instant: number): number | null {
  const first = slots[0]
  const last = slots[slots.length - 1]
  if (!first || !last || instant < first.start || instant > last.end) return null
  if (instant === last.end) return rowCount
  const index = slots.findIndex((slot) => slot.start <= instant && instant < slot.end)
  if (index < 0) return null
  const slot = slots[index]!
  const endRow = slots[index + 1]?.row ?? rowCount
  return slot.row + (instant - slot.start) / (slot.end - slot.start) * (endRow - slot.row)
}

/**
 * Merge actual local slot sequences into a shared wall-time axis. Repeated
 * fall-back slots have separate occurrence keys; a missing spring-forward slot
 * remains unavailable in that day's column. No nonexistent instant is invented.
 */
export function buildWeekGrid(dates: readonly string[], events: readonly Event[], resourceIds: readonly string[], timeZone: string, options: {
  locale?: string; hour12?: boolean; startHour?: number; endHour?: number; slotMinutes?: number
}): { rows: WeekRow[]; columns: WeekColumn[] } {
  const nodes = new Map<string, { label: string; fullLabel: string; wall: string; next: Set<string>; incoming: number }>()
  const days = dates.map((date) => {
    const occurrences = new Map<string, number>()
    const slots = daySlots(date, timeZone, options).map((slot) => {
      const wall = formatTime(slot.start, timeZone, 'en-GB')
      const occurrence = occurrences.get(wall) ?? 0
      occurrences.set(wall, occurrence + 1)
      const key = `${wall}#${occurrence}`
      if (!nodes.has(key)) nodes.set(key, {
        wall, label: formatTime(slot.start, timeZone, options.locale, false, options.hour12 ?? true),
        fullLabel: slot.label, next: new Set(), incoming: 0,
      })
      return { ...slot, key, row: 0 }
    })
    for (let index = 1; index < slots.length; index++) {
      const previous = nodes.get(slots[index - 1]!.key)!
      const key = slots[index]!.key
      if (!previous.next.has(key)) { previous.next.add(key); nodes.get(key)!.incoming++ }
    }
    return { date, slots }
  })
  const ready = [...nodes.keys()].filter((key) => nodes.get(key)!.incoming === 0)
  const ordered: string[] = []
  while (ready.length) {
    ready.sort()
    const key = ready.shift()!
    ordered.push(key)
    for (const next of nodes.get(key)!.next) if (--nodes.get(next)!.incoming === 0) ready.push(next)
  }
  if (ordered.length !== nodes.size) throw new RangeError('The local time sequences cannot share a week axis')
  const positions = new Map(ordered.map((key, index) => [key, index]))
  const rows = ordered.map((key) => {
    const node = nodes.get(key)!
    return { key, label: nodes.has(`${node.wall}#1`) ? node.fullLabel : node.label }
  })
  const columns = days.map(({ date, slots }) => {
    for (const slot of slots) slot.row = positions.get(slot.key)!
    const first = slots[0]
    const last = slots[slots.length - 1]
    if (!first || !last) return { date, slots, entries: [] }
    const entries = layoutEvents(eventsForDay(events, date, timeZone, resourceIds).map((item) => item.event), { start: first.start, end: last.end })
      .map((layout) => ({ layout, startRow: weekRowAt(slots, rows.length, layout.start)!, endRow: weekRowAt(slots, rows.length, layout.end)! }))
    return { date, slots, entries }
  })
  return { rows, columns }
}
