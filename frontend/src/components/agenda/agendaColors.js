// Agenda colors: a named palette (the familiar calendar set), each calendar's default,
// and how one event's color is chosen. Pure; unit-tested.

const t = (text) => (globalThis.window?.__ ? globalThis.window.__(text) : text)

// Order is the picker's order. Names are translated at render time.
export const PALETTE = Object.freeze([
  { id: 'tomato', name: 'Tomato', hex: '#d50000' },
  { id: 'flamingo', name: 'Flamingo', hex: '#e67c73' },
  { id: 'tangerine', name: 'Tangerine', hex: '#f4511e' },
  { id: 'banana', name: 'Banana', hex: '#f6bf26' },
  { id: 'sage', name: 'Sage', hex: '#33b679' },
  { id: 'basil', name: 'Basil', hex: '#0b8043' },
  { id: 'peacock', name: 'Peacock', hex: '#039be5' },
  { id: 'blueberry', name: 'Blueberry', hex: '#3f51b5' },
  { id: 'lavender', name: 'Lavender', hex: '#7986cb' },
  { id: 'grape', name: 'Grape', hex: '#8e24aa' },
  { id: 'graphite', name: 'Graphite', hex: '#616161' },
  { id: 'cocoa', name: 'Cocoa', hex: '#795548' },
  { id: 'pumpkin', name: 'Pumpkin', hex: '#ef6c00' },
  { id: 'avocado', name: 'Avocado', hex: '#7cb342' },
  { id: 'eucalyptus', name: 'Eucalyptus', hex: '#009688' },
  { id: 'cobalt', name: 'Cobalt', hex: '#4285f4' },
])

export const paletteName = (hex) => {
  const row = PALETTE.find((entry) => entry.hex === normalizeHex(hex))
  return row ? t(row.name) : hex
}

// A new calendar without a known default takes the next unused palette color.
export const CALENDAR_DEFAULTS = Object.freeze({
  Event: '#039be5',
  'Event:cita': '#33b679',
  'Event:invited': '#7986cb',
  tasks: '#3f51b5',
  Turno: '#616161',
  Ausencias: '#f6bf26',
  'Patient Appointment': '#8e24aa',
})

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function normalizeHex(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim().toLowerCase()
  if (/^#[0-9a-f]{8}$/.test(text)) return text.slice(0, 7)
  if (!HEX.test(text)) return ''
  if (text.length === 4)
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  return text
}

export function defaultCalendarColor(key, index = 0) {
  return CALENDAR_DEFAULTS[key] || PALETTE[(index * 5 + 3) % PALETTE.length].hex
}

function channels(hex) {
  const value = normalizeHex(hex) || '#039be5'
  return [1, 3, 5].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16),
  )
}

// WCAG relative luminance; text on a filled chip is white or near-black.
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function textOn(hex) {
  // Contrast against white vs. against #1f1f1f; pick the larger.
  const l = luminance(hex)
  const white = 1.05 / (l + 0.05)
  const dark = (l + 0.05) / (0.0137 + 0.05)
  return white >= dark ? '#ffffff' : '#1f1f1f'
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = channels(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The color an event shows: its own color, its type's color, else its calendar's. */
export function eventColor(event, calendarColor) {
  return (
    normalizeHex(event?.color) ||
    normalizeHex(event?.appointmentTypeColor) ||
    normalizeHex(calendarColor) ||
    CALENDAR_DEFAULTS.Event
  )
}
