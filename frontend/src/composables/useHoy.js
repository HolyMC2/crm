// Hoy (/crm/hoy): the shell's landing page. One batched read (crm.api.hoy.page);
// every action runs through the owning module's own endpoint. Pure helpers are
// exported for unit tests; the page owns presentation.
import { call } from 'frappe-ui'
import { bootScope, can, moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { createLiveSync } from '@/vendor/muelle-shell/live-sync'
import { contactScope, contactStorage } from '@/utils/contactos'
import { sourceSlugs } from '@/utils/shellRoutes'
import { takeHoy } from '@/utils/hoyPrefetch'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

export const HOY_HOME = '/crm/hoy'
const DAY = /^\d{4}-\d{2}-\d{2}$/
// Calendars Hoy shows; the Agenda keeps its own default when only events apply.
const AGENDA_DEFAULT = 'Event'
// Appointments and events that no longer need anyone today.
const AGENDA_GONE = ['Cancelled', 'No Show']
export const ACCESOS_LIMIT = 6
// Native records whose changes reload Hoy (rooms are only joined where readable).
export const LIVE_DOCTYPES = Object.freeze([
  'ToDo',
  'CRM Task',
  'Event',
  'Patient Appointment',
  'POS Opening Shift',
  'Repair Order',
])

/** The page's one read: the prefetch started with the boot, else a fresh call. */
export function loadHoy({ fresh = false } = {}) {
  return (!fresh && takeHoy()) || call('crm.api.hoy.page')
}

export function saveLanding(key) {
  return call('crm.api.hoy.save_landing', { key })
}

/** The return protocol back to Hoy (shell spec §8.3), on any local URL. */
export function withReturn(href) {
  const url = new URL(href, 'https://muelle.invalid')
  url.searchParams.set('return_to', HOY_HOME)
  url.searchParams.set('return_label', 'Hoy')
  return url.pathname + url.search + url.hash
}

/** A router location inside /crm with the return to Hoy. */
export function shellLink(path) {
  return withReturn(path)
}

export function greeting(now = new Date(), timeZone) {
  let hour = now.getHours()
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone,
      }).format(now),
    )
  } catch {
    /* unknown zone: the device clock */
  }
  if (hour < 12) return t('Good morning')
  if (hour < 19) return t('Good afternoon')
  return t('Good evening')
}

export function dayTitle(today, locale) {
  if (!DAY.test(today || '')) return ''
  const [year, month, day] = today.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function timeText(instant, timeZone, locale) {
  if (!instant) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(instant))
  } catch {
    return ''
  }
}

/**
 * Today's agenda for Hoy: all-day items, what is on now («Ahora»), the next
 * one («Siguiente») and the rest of the day; finished items only count.
 */
export function agendaPlan(events = [], now = Date.now()) {
  const live = events.filter((event) => !AGENDA_GONE.includes(event.status))
  const allDay = [],
    current = [],
    later = []
  let earlier = 0
  for (const event of live) {
    if (event.allDay) {
      allDay.push({ ...event, state: 'allday' })
      continue
    }
    const start = Date.parse(event.start)
    const end = Date.parse(event.end)
    if (end <= now) earlier += 1
    else if (start <= now) current.push({ ...event, state: 'now' })
    else later.push({ ...event, state: 'later' })
  }
  later.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  if (later.length) later[0] = { ...later[0], state: 'next' }
  return {
    rows: [...current, ...later, ...allDay],
    earlier,
    total: live.length,
  }
}

/** Opens the event in Agenda's day view, with the calendars Hoy read. */
export function eventLink(event, today, sources = []) {
  const query = new URLSearchParams({ view: 'day' })
  if (DAY.test(today || '')) query.set('date', today)
  if (event) query.set('event', `${event.source}:${event.id}`)
  const cal = sources.length ? sources.join(',') : AGENDA_DEFAULT
  if (cal !== AGENDA_DEFAULT) query.set('cal', cal)
  return withReturn(`/agenda?${query}`)
}

export function countLabel(count) {
  if (!count) return ''
  return count.capped ? `${count.value}+` : String(count.value)
}

/** Pendientes rows for «Para ahora»: overdue first, then due today. */
export function dueRows(section) {
  if (!section?.available) return []
  return [...(section.overdue?.rows || []), ...(section.today?.rows || [])]
}

export function dueMore(section) {
  return Boolean(section?.overdue?.has_more || section?.today?.has_more)
}

// ── Continuar ───────────────────────────────────────────────────────────────

/** Unsaved editor input this tab keeps (Contactos, Compras), newest first. */
export function scanDrafts(
  storage = contactStorage(),
  { scope = contactScope(), user = '' } = {},
) {
  const rows = []
  let keys
  try {
    keys = Object.keys(storage || {})
  } catch {
    return rows
  }
  const slugs = new Set(Object.values(sourceSlugs))
  const contactPrefix = `contactos:${scope}:draft:`
  const comprasPrefix = `muelle:compras:draft:${user}:`
  for (const key of keys) {
    let value
    try {
      value = JSON.parse(storage.getItem(key) || 'null')
    } catch {
      continue
    }
    if (!value) continue
    if (key.startsWith(contactPrefix) && value.dirty) {
      const [kind, source, ...rest] = key.slice(contactPrefix.length).split(':')
      const slug = slugs.has(source) ? source : sourceSlugs[source]
      const name = rest[0]
      if (kind === 'identity' && name === 'new')
        rows.push({
          key,
          title: t('New contact'),
          to: '/contactos?create=1',
          at: value.savedAt,
        })
      else if (slug && name && name !== 'new')
        rows.push({
          key,
          title:
            kind === 'note' ? t('Note on a contact') : t('Contact changes'),
          to: `/contactos/${slug}/${encodeURIComponent(name)}`,
          at: value.savedAt,
        })
    } else if (user && key.startsWith(comprasPrefix) && value.form) {
      const name = key.slice(comprasPrefix.length)
      rows.push({
        key,
        title:
          name === 'new'
            ? t('New purchase order')
            : t('Purchase order {0}', [name]),
        to:
          name === 'new'
            ? '/compras/nueva'
            : `/compras/orden/${encodeURIComponent(name)}`,
        at: value.at,
      })
    }
  }
  return rows.sort((a, b) => (b.at || 0) - (a.at || 0))
}

/**
 * Cards for «Continuar»: work in progress that other apps own, each opening
 * there with the return to Hoy. Only what the server reported (installed,
 * readable) plus this tab's drafts.
 */
export function continuarCards(
  continuar,
  { drafts = [], timeZone, locale } = {},
) {
  const cards = []
  for (const item of continuar?.items || []) {
    if (item.key === 'pos')
      cards.push({
        key: 'pos',
        icon: 'lucide-receipt',
        title: t('Register open'),
        detail: [
          item.opened_at
            ? t('Open since {0}', [timeText(item.opened_at, timeZone, locale)])
            : '',
          item.pos_profile,
        ]
          .filter(Boolean)
          .join(' · '),
        href: withReturn(item.url),
        action: t('Go to the register'),
        rows: [],
      })
    else if (item.key === 'taller')
      cards.push({
        key: 'taller',
        icon: 'lucide-wrench',
        title: t('My repair orders'),
        detail: t('{0} in progress', [
          item.capped ? `${item.count}+` : item.count,
        ]),
        href: withReturn(item.url),
        action: t('Open Taller'),
        rows: (item.rows || []).map((row) => ({
          key: row.name,
          title: row.title,
          detail: [
            row.name,
            row.status,
            row.promised_at
              ? t('Promised {0}', [timeText(row.promised_at, timeZone, locale)])
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
          href: withReturn(row.url),
        })),
      })
    else if (item.key === 'clinica')
      cards.push({
        key: 'clinica',
        icon: 'lucide-stethoscope',
        title: t('Clinic reception'),
        detail: t('{0} waiting · {1} appointments still today', [
          item.waiting,
          item.active,
        ]),
        href: withReturn(item.url),
        action: t('Open reception'),
        rows: [],
      })
  }
  // A source with nothing to do draws nothing (as on Desk Hoy).
  for (const source of (continuar?.sources || []).filter((s) => s.count > 0))
    cards.push({
      key: source.key,
      icon: 'lucide-inbox',
      title: source.label,
      detail: t('{0} to handle', [source.count]),
      href: source.url ? withReturn(source.url) : '',
      action: source.url ? t('See all') : '',
      rows: (source.rows || []).map((row) => ({
        key: row.name,
        name: row.name,
        title: row.title || row.name,
        detail: row.detail,
        href: row.url ? withReturn(row.url) : '',
        modified: row.modified,
        group: row.group,
      })),
      source,
    })
  if (drafts.length)
    cards.push({
      key: 'drafts',
      icon: 'lucide-file-pen-line',
      title: t('Unsaved drafts'),
      detail: t('{0} kept in this tab', [drafts.length]),
      href: '',
      action: '',
      rows: drafts.map((draft) => ({
        key: draft.key,
        title: draft.title,
        detail: t('Pick up where you left off'),
        to: draft.to,
      })),
    })
  return cards
}

/** The provider's own action on one row (e.g. Taller's «Asignar»), same method as Desk Hoy. */
export function runSourceAction(source, row, value = '') {
  return call(source.action.method, {
    name: row.name,
    value,
    modified: row.modified,
  })
}

// ── Accesos ─────────────────────────────────────────────────────────────────

/** Up to six quick actions, from the modules this worker can create in. */
export function accesos(boot) {
  const items = []
  const add = (module, capability, label, icon, to) => {
    if (moduleEnabled(boot, module) && can(boot, module, capability))
      items.push({ key: `${module}.${capability}`, label, icon, to })
  }
  add(
    'pendientes',
    'create',
    t('New pendiente'),
    'lucide-square-check-big',
    withReturn('/pendientes?create=1'),
  )
  add(
    'agenda',
    'create',
    t('Schedule an event'),
    'lucide-calendar-plus',
    withReturn('/agenda?view=day&create=1'),
  )
  add(
    'contactos',
    'create',
    t('New contact'),
    'lucide-user-plus',
    '/contactos?create=1',
  )
  add(
    'compras',
    'create',
    t('New purchase'),
    'lucide-shopping-cart',
    withReturn('/compras/nueva'),
  )
  add(
    'garantias',
    'create',
    t('New warranty case'),
    'lucide-shield-check',
    '/garantias?create=1',
  )
  add(
    'cobranza',
    'read',
    t('Collect what is due'),
    'lucide-hand-coins',
    '/cobranza?segment=vencidas',
  )
  add(
    'gastos',
    'read',
    t('Bills to pay'),
    'lucide-receipt',
    '/gastos?segment=por-pagar',
  )
  add('archivos', 'read', t('Sort documents'), 'lucide-folder', '/archivos')
  return items.slice(0, ACCESOS_LIMIT)
}

/** Where Muelle opens: automatic (puesto policy), Hoy, or another module the worker has. */
export function landingOptions(modules = []) {
  return [
    { value: '', label: t('Automatic (by your puesto)') },
    { value: 'hoy', label: 'Hoy' },
    ...modules
      .filter((module) => !['hoy', 'avisos'].includes(module.key))
      .map((module) => ({ value: module.key, label: module.label })),
  ]
}

// ── live updates ────────────────────────────────────────────────────────────

let hub
/** One live-sync hub for Hoy, on the app socket; sibling tabs of another user never hear it. */
export function hoyLive(socket) {
  if (!hub) {
    const user = decodeURIComponent(
      document.cookie
        .split('; ')
        .find((part) => part.startsWith('user_id='))
        ?.slice(8) || '',
    )
    hub = createLiveSync({
      socket: socket || null,
      namespace: bootScope(window.site_name || location.host, user),
    })
  }
  return hub
}
