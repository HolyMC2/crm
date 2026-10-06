/** RFC 3339 timestamp with an explicit Z or numeric offset. Never a wall time. */
export type Instant = string

export interface EventAction {
  id: string
  label: string
}

export interface Event {
  id: string
  source: string
  title: string
  start: Instant
  end: Instant
  timeZone: string
  resourceIds: readonly string[]
  status: string
  version: string | number
  actions: readonly EventAction[]
  draggable: boolean
  /** Optional scheduling labels only; never clinical notes. */
  appointmentType?: string
  appointmentTypeColor?: string
  serviceUnit?: string
  serviceUnitLabel?: string
  practitionerName?: string
  resourceActive?: boolean
  arrivalAt?: string
  inConsultation?: boolean
}

export interface Resource {
  active?: boolean
  scheduled?: boolean
  id: string
  title: string
  timeZone: string
}

export interface Constraint {
  code: string
  message: string
  severity: 'block' | 'warn'
}

/** Half-open [start, end) interval in epoch milliseconds. */
export interface Interval {
  start: number
  end: number
}

export interface CreateRange {
  start: Instant
  end: Instant
}

export interface CreateSlot extends CreateRange {
  resourceId: string
}

export interface CalendarRange {
  start: Instant
  end: Instant
  timeZone: string
  resourceIds: readonly string[]
}

export interface CalendarData {
  events: Event[]
  resources: Resource[]
  constraints?: Constraint[]
}

/** Backend ownership, permissions, and mutations remain in the consuming app. */
export interface CalendarAdapter {
  load(range: CalendarRange): Promise<CalendarData>
}

export type CalendarEvent = Event
export type CalendarResource = Resource
