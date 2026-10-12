// Per-user Agenda preferences: calendar colors and visibility, default view, week start,
// weekends, density, the hour the day opens at, which statuses show. They apply at once
// from this device (localStorage) and follow the worker to other devices through Frappe's
// own per-user settings store (__UserSettings, key «Muelle Agenda»).
import { call } from 'frappe-ui'
import { reactive, watch } from 'vue'
import { normalizeHex } from '@/components/agenda/agendaColors'

export const SETTINGS_KEY = 'Muelle Agenda'
export const DENSITIES = Object.freeze({
  compact: 40,
  comfortable: 48,
  spacious: 64,
})
export const DEFAULT_PREFS = Object.freeze({
  view: '',
  weekStart: null,
  showWeekends: true,
  density: 'comfortable',
  dayStartHour: 8,
  showDone: true,
  showCancelled: false,
  dimPast: true,
  defaultDuration: 60,
  colors: {},
  // Team calendars start hidden; the worker turns them on from the sidebar.
  hidden: ['Turno', 'Ausencias', 'Patient Appointment'],
  seen: [],
  sidebar: true,
  syncGoogle: true,
  updatedAt: 0,
})
const VIEWS = ['', 'day', '4day', 'week', 'month', 'list']

/** Keep only known keys with valid values, so a stored blob can never break the page. */
export function cleanPrefs(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const prefs = {
    ...DEFAULT_PREFS,
    colors: {},
    hidden: [...DEFAULT_PREFS.hidden],
    seen: [],
  }
  if (VIEWS.includes(value.view)) prefs.view = value.view
  if (
    Number.isInteger(value.weekStart) &&
    value.weekStart >= 0 &&
    value.weekStart <= 6
  )
    prefs.weekStart = value.weekStart
  for (const key of [
    'showWeekends',
    'showDone',
    'showCancelled',
    'dimPast',
    'sidebar',
    'syncGoogle',
  ])
    if (typeof value[key] === 'boolean') prefs[key] = value[key]
  if (value.density in DENSITIES) prefs.density = value.density
  if (
    Number.isInteger(value.dayStartHour) &&
    value.dayStartHour >= 0 &&
    value.dayStartHour <= 20
  )
    prefs.dayStartHour = value.dayStartHour
  if ([15, 30, 45, 60, 90, 120].includes(value.defaultDuration))
    prefs.defaultDuration = value.defaultDuration
  if (value.colors && typeof value.colors === 'object')
    for (const [key, hex] of Object.entries(value.colors).slice(0, 50)) {
      const color = normalizeHex(hex)
      if (color && typeof key === 'string' && key.length <= 80)
        prefs.colors[key] = color
    }
  for (const key of ['hidden', 'seen'])
    if (Array.isArray(value[key]))
      prefs[key] = [
        ...new Set(
          value[key].filter(
            (row) => typeof row === 'string' && row.length <= 80,
          ),
        ),
      ].slice(0, 50)
  if (Number.isFinite(value.updatedAt)) prefs.updatedAt = value.updatedAt
  return prefs
}

function storageKey() {
  const user = decodeURIComponent(
    globalThis.document?.cookie
      ?.split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
  return `muelle.agenda.prefs:${user || 'me'}`
}

function readLocal() {
  try {
    return cleanPrefs(JSON.parse(localStorage.getItem(storageKey()) || '{}'))
  } catch {
    return cleanPrefs({})
  }
}

let shared = null
let saveTimer = null

export function useAgendaPrefs() {
  if (shared) return shared
  const prefs = reactive(readLocal())
  let applyingRemote = false

  async function loadRemote() {
    try {
      const raw = await call('frappe.model.utils.user_settings.get', {
        doctype: SETTINGS_KEY,
      })
      const remote = cleanPrefs(JSON.parse(raw || '{}').prefs)
      if (remote.updatedAt > prefs.updatedAt) {
        applyingRemote = true
        Object.assign(prefs, remote)
        applyingRemote = false
      }
    } catch {
      // Offline or an older site: this device's choices still apply.
    }
  }

  function persist() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(prefs))
    } catch {
      // Private mode / full storage: the in-memory choice still applies.
    }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      call('frappe.model.utils.user_settings.save', {
        doctype: SETTINGS_KEY,
        user_settings: JSON.stringify({ prefs: cleanPrefs(prefs) }),
      }).catch(() => {})
    }, 800)
  }

  watch(
    () => JSON.stringify({ ...prefs, updatedAt: 0 }),
    () => {
      if (applyingRemote) return
      prefs.updatedAt = Date.now()
      persist()
    },
  )

  function setColor(key, hex) {
    const color = normalizeHex(hex)
    prefs.colors = { ...prefs.colors, [key]: color }
    if (!color) delete prefs.colors[key]
  }
  function toggleHidden(key, hide) {
    const hidden = new Set(prefs.hidden)
    const next = hide ?? !hidden.has(key)
    if (next) hidden.add(key)
    else hidden.delete(key)
    prefs.hidden = [...hidden]
  }
  function remember(key) {
    if (!prefs.seen.includes(key)) prefs.seen = [...prefs.seen, key]
  }
  function reset() {
    Object.assign(prefs, cleanPrefs({}), { updatedAt: Date.now() })
  }

  shared = { prefs, loadRemote, setColor, toggleHidden, remember, reset }
  return shared
}

/** Tests: forget the shared instance between mounts. */
export function resetAgendaPrefsForTests() {
  shared = null
  clearTimeout(saveTimer)
}
