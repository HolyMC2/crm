import { contactosApi } from '@/composables/useContactos'
import { identityTypeLabel } from '@/utils/contactos'
import { call } from 'frappe-ui'
import { moduleEnabled, can, bootScope } from '@/vendor/muelle-shell/contracts'

// Palette providers for the shell (spec §1.4). Each answers on its own and is
// cut off by the shared abort signal; the server rechecks every record.
const match = (text, ...values) =>
  !text ||
  values.some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(text.toLowerCase()),
  )

const CONTACTOS_PLACES = [
  ['people', 'Personas'],
  ['companies', 'Empresas'],
  ['customers', 'Clientes'],
  ['suppliers', 'Proveedores'],
  ['followups', 'Mis seguimientos'],
  ['addresses', 'Direcciones'],
]
const COMPRAS_PLACES = [
  ['por-comprar', 'Por comprar'],
  ['por-recibir', 'Por recibir'],
  ['historial', 'Historial'],
]
const ARCHIVOS_PLACES = [
  ['', 'Por clasificar'],
  ['ayuda', 'Requieren ayuda'],
  ['archivo', 'Archivo'],
]
const VENTAS_PLACES = [
  ['/inbox', 'Inbox', 'lucide-messages-square'],
  ['/leads', 'Leads', 'lucide-users'],
  ['/deals', 'Deals', 'lucide-handshake'],
  ['/tasks', 'Tasks', 'lucide-square-check-big'],
  ['/calendar', 'Calendar', 'lucide-calendar-days'],
]

export function createShellProviders({ boot, modules }) {
  const actions = {
    key: 'acciones',
    label: 'Actions',
    scopes: ['actions'],
    async search(query) {
      const items = []
      if (can(boot.value, 'contactos', 'create'))
        items.push({
          id: 'contactos.create',
          group: 'acciones',
          title: query.text
            ? __('New contact «{0}»', [query.text])
            : __('New contact'),
          icon: 'lucide-user-plus',
          href: '/contactos?create=1',
          shortcut: 'c',
        })
      if (can(boot.value, 'compras', 'create'))
        items.push({
          id: 'compras.create',
          group: 'acciones',
          title: __('New purchase'),
          icon: 'lucide-shopping-cart',
          href: '/compras/nueva',
        })
      items.push(
        {
          id: 'theme.light',
          group: 'acciones',
          title: __('Light theme'),
          icon: 'lucide-sun',
          action: 'theme',
          args: { theme: 'light' },
        },
        {
          id: 'theme.dark',
          group: 'acciones',
          title: __('Dark theme'),
          icon: 'lucide-moon',
          action: 'theme',
          args: { theme: 'dark' },
        },
      )
      return query.kind === 'empty'
        ? items.slice(0, 1)
        : items.filter((item) => match(query.text, item.title))
    },
  }
  const places = {
    key: 'ir_a',
    label: 'Go to',
    async search(query) {
      const items = modules.value.map((module) => ({
        id: `module.${module.key}`,
        group: 'ir_a',
        title: module.label,
        icon: module.icon,
        href: module.to,
        shortcut: module.go ? `g ${module.go}` : undefined,
      }))
      if (moduleEnabled(boot.value, 'contactos'))
        for (const [segment, label] of CONTACTOS_PLACES)
          items.push({
            id: `contactos.${segment}`,
            group: 'ir_a',
            title: `Contactos › ${label}`,
            icon: 'lucide-users',
            href: `/contactos?segment=${segment}`,
          })
      if (moduleEnabled(boot.value, 'compras'))
        for (const [segment, label] of COMPRAS_PLACES)
          items.push({
            id: `compras.${segment}`,
            group: 'ir_a',
            title: `Compras › ${label}`,
            icon: 'lucide-shopping-cart',
            href: `/compras?segment=${segment}`,
          })
      if (moduleEnabled(boot.value, 'archivos'))
        for (const [view, label] of ARCHIVOS_PLACES)
          items.push({
            id: `archivos.${view || 'por_clasificar'}`,
            group: 'ir_a',
            title: `Archivos › ${label}`,
            icon: 'lucide-folder',
            href: view ? `/archivos?view=${view}` : '/archivos',
          })
      if (moduleEnabled(boot.value, 'ventas'))
        for (const [path, label, icon] of VENTAS_PLACES)
          items.push({
            id: `ventas.${path}`,
            group: 'ir_a',
            title: `Ventas › ${__(label)}`,
            icon,
            href: path,
          })
      if (query.kind === 'empty') return []
      return items.filter((item) => match(query.text, item.title))
    },
  }
  const contactos = {
    key: 'contactos',
    label: 'Contactos',
    scopes: ['people'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'contactos'))
        return []
      const result = await contactosApi('search', { q: query.text })
      if (signal.aborted) return []
      return (result?.rows || []).map((row) => ({
        id: `${row.source}:${row.name}`,
        group: 'registros',
        title: row.title || row.name,
        subtitle: [
          identityTypeLabel(row),
          row.fields?.mobile_no || row.fields?.email_id,
        ]
          .filter(Boolean)
          .join(' · '),
        icon: row.kind === 'company' ? 'lucide-building-2' : 'lucide-user',
        href: `/contactos/${row.source}/${encodeURIComponent(row.name)}`,
        record: { source: row.source, name: row.name },
      }))
    },
  }
  return [actions, contactos, places]
}

function recentKey() {
  const user = decodeURIComponent(
    document.cookie
      .split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
  return `muelle:palette-recent:${bootScope(window.site_name || location.host, user)}`
}
// Recents hold references only. Names, phones and emails are fetched again
// through a permission check each time, so revoked access shows nothing.
function recordFromHref(href) {
  // Older builds stored no `record`; their href is /contactos/<source>/<name>.
  const match = /^\/contactos\/([a-z-]+)\/([^/?#]+)$/.exec(String(href || ''))
  if (!match) return {}
  try {
    return { source: match[1], name: decodeURIComponent(match[2]) }
  } catch {
    return {}
  }
}
export function toRecentRef(item) {
  const { source, name } = item?.record || recordFromHref(item?.href)
  if (typeof source !== 'string' || typeof name !== 'string') return null
  return {
    id: String(item.id),
    href: String(item.href),
    record: { source, name },
  }
}
export function loadRecent() {
  try {
    const items = JSON.parse(localStorage.getItem(recentKey()) || '[]')
    // Older builds stored titles and subtitles; keep only the reference.
    return Array.isArray(items) ? items.map(toRecentRef).filter(Boolean) : []
  } catch {
    return []
  }
}
export async function resolveRecent(refs, boot) {
  if (!refs.length || !moduleEnabled(boot, 'contactos')) return []
  let rows
  try {
    rows = await call('crm.api.shell.resolve_recent', {
      records: refs.map((ref) => ref.record),
    })
  } catch {
    return null // unknown (offline, server error): show nothing, keep refs
  }
  const allowed = new Map(
    (rows || []).map((row) => [`${row.source}:${row.name}`, row]),
  )
  return refs
    .map((ref) => [ref, allowed.get(`${ref.record.source}:${ref.record.name}`)])
    .filter(([, row]) => row)
    .map(([ref, row]) => ({
      ...ref,
      group: 'recientes',
      title: row.title || row.name,
      icon: 'lucide-history',
    }))
}
export function saveRecent(items) {
  try {
    localStorage.setItem(recentKey(), JSON.stringify(items))
  } catch {
    // Storage may be unavailable; recents stay for this palette only.
  }
}
