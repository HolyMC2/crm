import { contactosApi } from '@/composables/useContactos'
import { identityTypeLabel } from '@/utils/contactos'
import { call } from 'frappe-ui'
import { moduleEnabled, can, bootScope } from '@/vendor/muelle-shell/contracts'
import { shellT } from '@/composables/shellKeyboard'
import { installedSiblings, sortSiblings } from '@/composables/shellRail'
// Manual de la tienda: one self-contained provider (articles, categories, «Nuevo artículo»).
import { createManualProvider } from '@/utils/manualPalette'

// Palette providers for the shell (spec §1.4): Contactos records and Ventas deals. Each answers on its own and is
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
const AGENDA_PLACES = [
  ['day', 'Día'],
  ['week', 'Semana'],
  ['list', 'Lista'],
]
const COBRANZA_PLACES = [
  ['vencidas', 'Vencidas'],
  ['hoy', 'Vence pronto'],
  ['promesas', 'Promesas'],
  ['todas', 'Todas'],
]
const GASTOS_PLACES = [
  ['segment=por-pagar', 'Por pagar', 'read'],
  ['segment=por-pagar&chip=vencidas', 'Vencidas', 'read'],
  ['segment=por-registrar', 'Por registrar', 'read'],
  ['segment=empleados', 'De empleados', 'claims'],
]
const PRODUCTOS_PLACES = [
  ['todos', 'Todos'],
  ['sin-precio', 'Sin precio'],
  ['precio-revisar', 'Precio por revisar'],
  ['faltan', 'Faltan'],
  ['bajo-minimo', 'Bajo mínimo'],
  ['sin-cajon', 'Sin cajón'],
  ['sin-contar', 'Sin contar'],
  ['negativo', 'Existencia negativa'],
  ['por-revisar', 'Diferencias por revisar'],
  ['conteos-abiertos', 'Conteos abiertos'],
]
const COMPRAS_PLACES = [
  ['por-comprar', 'Por comprar'],
  ['por-recibir', 'Por recibir'],
  ['historial', 'Historial'],
]
const GARANTIAS_PLACES = [
  ['nuevas', 'Nuevas'],
  ['en-revision', 'En revisión'],
  ['con-proveedor', 'Con proveedor'],
  ['cerradas', 'Cerradas'],
]
const ENCUESTAS_PLACES = [
  ['atender', 'Por atender'],
  ['seguimiento', 'En seguimiento'],
  ['todas', 'Todas las respuestas'],
]
const RESULTADOS_PLACES = [
  ['periodo=hoy', 'Hoy'],
  ['periodo=semana', 'Semana'],
  ['', 'Mes'],
  ['periodo=mes&compara=anio', 'Mes vs año pasado'],
]
const EQUIPO_PLACES = [
  ['hoy', 'Hoy trabajan'],
  ['por-revisar', 'Por revisar'],
  ['sin-horario', 'Sin horario'],
  ['todos', 'Todo el equipo'],
]
const ARCHIVOS_PLACES = [
  ['', 'Por clasificar'],
  ['ayuda', 'Requieren ayuda'],
  ['archivo', 'Archivo'],
]
// Escáner (scanner_kit) places a worker jumps to from anywhere in the shell;
// they open in Escáner with «Volver a …» back to the page they left.
const ESCANER_PLACES = [
  ['/scan/inicio', 'Inicio', 'lucide-scan-barcode', 'escaner scanner inicio'],
  ['/scan/items', 'Artículos', 'lucide-package-search', 'buscar articulo item'],
  ['/scan/bins', 'Cajones', 'lucide-layout-grid', 'cajon ubicacion bin'],
  ['/scan/bins/move', 'Mover de cajón', 'lucide-move', 'mover cajon traspaso'],
  ['/scan/conteo', 'Conteo del día', 'lucide-list-checks', 'contar inventario'],
  [
    '/scan/conteo/revision',
    'Revisión de conteo',
    'lucide-clipboard-check',
    'diferencias revisar ajuste inventario',
  ],
  ['/scan/inbound', 'Recepción', 'lucide-package-open', 'recibir mercancia'],
  ['/scan/tasks', 'Tareas', 'lucide-square-check-big', 'tareas escaneo'],
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
      if (can(boot.value, 'gastos', 'claim'))
        items.push({
          id: 'gastos.claim',
          group: 'acciones',
          title: __('File an expense'),
          keywords: 'gasto ticket reembolso registrar expense receipt',
          icon: 'lucide-receipt',
          href: '/gastos?segment=empleados&chip=mios&nuevo=1',
        })
      if (can(boot.value, 'garantias', 'create'))
        items.push({
          id: 'garantias.create',
          group: 'acciones',
          title: __('New warranty case'),
          icon: 'lucide-shield-check',
          href: '/garantias?create=1',
        })
      if (installedSiblings().some((app) => app.key === 'scan'))
        items.push({
          id: 'escaner.pick',
          group: 'acciones',
          title: __('Scan a code'),
          keywords: 'escanear codigo barras camara scan barcode articulo',
          icon: 'lucide-scan-barcode',
          scanPick: true,
        })
      if (query.text && installedSiblings().some((app) => app.key === 'scan'))
        items.push({
          id: 'escaner.search',
          group: 'acciones',
          title: __('Find «{0}» in Escáner', [query.text]),
          keywords: `${query.text} escaner existencia cajon stock`,
          icon: 'lucide-scan-barcode',
          external: `/scan/items?q=${encodeURIComponent(query.text)}`,
        })
      items.push(
        {
          id: 'shortcuts',
          group: 'acciones',
          title: shellT('View keyboard shortcuts'),
          // Found by either language's words, and by the key itself.
          keywords: 'keyboard shortcuts atajos teclado alt+h',
          icon: 'lucide-keyboard',
          action: 'shortcuts',
          shortcut: 'alt+h',
        },
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
        : items.filter((item) => match(query.text, item.title, item.keywords))
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
      if (moduleEnabled(boot.value, 'agenda'))
        for (const [view, label] of AGENDA_PLACES)
          items.push({
            id: `agenda.${view}`,
            group: 'ir_a',
            title: `Agenda › ${label}`,
            icon: 'lucide-calendar-days',
            href: `/agenda?view=${view}`,
          })
      if (moduleEnabled(boot.value, 'cobranza'))
        for (const [segment, label] of COBRANZA_PLACES)
          items.push({
            id: `cobranza.${segment}`,
            group: 'ir_a',
            title: `Cobranza › ${label}`,
            icon: 'lucide-hand-coins',
            href: `/cobranza?segment=${segment}`,
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
      if (moduleEnabled(boot.value, 'gastos'))
        for (const [query, label, need] of GASTOS_PLACES)
          if (can(boot.value, 'gastos', need))
            items.push({
              id: `gastos.${query}`,
              group: 'ir_a',
              title: `Gastos › ${label}`,
              icon: 'lucide-receipt',
              href: `/gastos?${query}`,
            })
      if (moduleEnabled(boot.value, 'productos'))
        for (const [view, label] of PRODUCTOS_PLACES)
          items.push({
            id: `productos.${view}`,
            group: 'ir_a',
            title: `Productos › ${label}`,
            icon: 'lucide-package',
            href: view === 'todos' ? '/productos' : `/productos?vista=${view}`,
          })
      if (moduleEnabled(boot.value, 'resultados'))
        for (const [query, label] of RESULTADOS_PLACES)
          items.push({
            id: `resultados.${query || 'mes'}`,
            group: 'ir_a',
            title: `Resultados › ${label}`,
            icon: 'lucide-chart-column',
            href: query ? `/resultados?${query}` : '/resultados',
          })
      if (moduleEnabled(boot.value, 'garantias'))
        for (const [segment, label] of GARANTIAS_PLACES)
          items.push({
            id: `garantias.${segment}`,
            group: 'ir_a',
            title: `Garantías › ${label}`,
            icon: 'lucide-shield-check',
            href: `/garantias?segment=${segment}`,
          })
      if (moduleEnabled(boot.value, 'encuestas'))
        for (const [view, label] of ENCUESTAS_PLACES)
          items.push({
            id: `encuestas.${view}`,
            group: 'ir_a',
            title: `Encuestas › ${label}`,
            icon: 'lucide-smile',
            href: `/encuestas?view=${view}`,
          })
      if (moduleEnabled(boot.value, 'equipo'))
        for (const [segment, label] of EQUIPO_PLACES)
          if (segment === 'todos' || can(boot.value, 'equipo', 'hr'))
            items.push({
              id: `equipo.${segment}`,
              group: 'ir_a',
              title: `Equipo › ${label}`,
              icon: 'lucide-id-card',
              href: `/equipo?segment=${segment}`,
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
      const siblings = sortSiblings(installedSiblings())
      for (const app of siblings)
        if (app.key !== 'scan')
          items.push({
            id: `app.${app.key}`,
            group: 'ir_a',
            title: app.label,
            icon: app.icon,
            external: app.path,
          })
      if (siblings.some((app) => app.key === 'scan'))
        for (const [path, label, icon, keywords] of ESCANER_PLACES)
          items.push({
            id: `escaner.${path}`,
            group: 'ir_a',
            title: path === '/scan/inicio' ? 'Escáner' : `Escáner › ${label}`,
            keywords,
            icon,
            external: path,
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
      return items.filter((item) =>
        match(query.text, item.title, item.keywords),
      )
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
  const ventas = {
    key: 'ventas',
    label: 'Ventas',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'ventas'))
        return []
      const like = `%${query.text}%`
      const rows = await call('frappe.client.get_list', {
        doctype: 'CRM Deal',
        fields: ['name', 'organization', 'lead_name', 'status'],
        or_filters: [
          ['name', 'like', like],
          ['organization', 'like', like],
          ['lead_name', 'like', like],
        ],
        order_by: 'modified desc',
        limit_page_length: 5,
      })
      if (signal.aborted) return []
      return (rows || []).map((row) => ({
        id: `deal:${row.name}`,
        group: 'registros',
        title: row.organization || row.lead_name || row.name,
        subtitle: [row.name, row.status].filter(Boolean).join(' · '),
        icon: 'lucide-handshake',
        href: `/ventas/deal/${encodeURIComponent(row.name)}`,
        record: { source: 'deal', name: row.name },
      }))
    },
  }
  const manual = createManualProvider({ boot })
  return [actions, contactos, places, ventas, manual]
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
// Deals belong to Ventas; every other source is a Contactos record.
const recentModule = (ref) =>
  ref.record.source === 'deal' ? 'ventas' : 'contactos'
export async function resolveRecent(refs, boot) {
  refs = refs.filter((ref) => moduleEnabled(boot, recentModule(ref)))
  if (!refs.length) return []
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
