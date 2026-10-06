import { instantMs } from './dates'
import type { Event, Interval } from './types'

export function isValidInterval(value: Interval): boolean {
  return Number.isFinite(value.start) && Number.isFinite(value.end) && value.start < value.end
}

export function eventInterval(event: Pick<Event, 'start' | 'end'>): Interval | null {
  try {
    const result = { start: instantMs(event.start), end: instantMs(event.end) }
    return isValidInterval(result) ? result : null
  } catch {
    return null
  }
}

/** Touching endpoints do not overlap: [09:00, 10:00), [10:00, 11:00). */
export function overlaps(a: Interval, b: Interval): boolean {
  return isValidInterval(a) && isValidInterval(b) && a.start < b.end && b.start < a.end
}

export function clipInterval(value: Interval, range: Interval): Interval | null {
  if (!overlaps(value, range)) return null
  return { start: Math.max(value.start, range.start), end: Math.min(value.end, range.end) }
}

export interface PositionedEvent extends Interval {
  event: Event
  column: number
  columns: number
  /** Fractions of the supplied visible interval. */
  top: number
  height: number
}

/**
 * Greedy interval partitioning per connected overlap group. All events in a
 * group share its peak column count; disjoint groups reclaim the full width.
 * Invalid or out-of-range events are omitted. The inputs are never mutated.
 */
export function layoutEvents(events: readonly Event[], range: Interval, resourceId?: string): PositionedEvent[] {
  if (!isValidInterval(range)) throw new RangeError('A valid visible interval is required')
  const duration = range.end - range.start
  const positioned: PositionedEvent[] = []
  for (const event of events) {
    if (resourceId !== undefined && !event.resourceIds.includes(resourceId)) continue
    const interval = eventInterval(event)
    const clipped = interval && clipInterval(interval, range)
    if (!clipped) continue
    positioned.push({ event, ...clipped, column: 0, columns: 1, top: (clipped.start - range.start) / duration, height: (clipped.end - clipped.start) / duration })
  }
  positioned.sort((a, b) => a.start - b.start || b.end - a.end || a.event.source.localeCompare(b.event.source) || a.event.id.localeCompare(b.event.id))
  let group: PositionedEvent[] = []
  let laneEnds: number[] = []
  let groupEnd = -Infinity
  const finishGroup = () => {
    for (const item of group) item.columns = laneEnds.length
    group = []
    laneEnds = []
  }
  for (const item of positioned) {
    if (item.start >= groupEnd) finishGroup()
    let column = laneEnds.findIndex((end) => end <= item.start)
    if (column < 0) column = laneEnds.length
    laneEnds[column] = item.end
    item.column = column
    group.push(item)
    groupEnd = Math.max(groupEnd, item.end)
  }
  finishGroup()
  return positioned
}
