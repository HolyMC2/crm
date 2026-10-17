import { contactosApi } from '@/composables/useContactos'
import { identityTypeLabel } from '@/utils/contactos'
import { call } from 'frappe-ui'
import {
  moduleEnabled,
  can,
  bootScope,
  safeReturn,
} from '@/vendor/muelle-shell/contracts'
import { shellT } from '@/composables/shellKeyboard'
import { installedSiblings, sortSiblings } from '@/composables/shellRail'
import { createTargets } from '@/utils/shellCreate'
import { recordActions } from '@/composables/recordActions'
// Manual de la tienda: one self-contained provider (articles, categories, «Nuevo artículo»).
import { createManualProvider } from '@/utils/manualPalette'
// «Pregúntale a Muelle»: a question gets «Preguntar a Muelle» first (SHELL-S2).
import { createAssistantProvider } from '@/components/assistant/assistantPalette'
import { formatMoney, kindLabel, statusLabel } from '@/utils/display'

// ¿…, …? or an interrogative first word (PM rule, SHELL-S1.2). Narrower than
// the assistant's looksLikeQuestion, which also counts any 5+ word query.
const INTERROGATIVE =
  /^(qu[eé]|c[oó]mo|cu[aá]nt[oa]s?|cu[aá]l(es)?|qui[eé]n(es)?|d[oó]nde|cu[aá]ndo|por ?qu[eé])(?!\p{L})/iu
export function explicitQuestion(text) {
  const value = String(text || '').trim()
  return /^[¿?]/u.test(value) || /\?$/u.test(value) || INTERROGATIVE.test(value)
}

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
  ['', 'Por clasificar', 'comprobantes facturas recibir subir documentos'],
  ['ayuda', 'Requieren atención', 'ayuda errores problemas'],
  ['archivo', 'Archivo', 'archivados vinculados buscar documentos'],
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
// The Ventas daily lists first, then the «Más» lists people jump to by name
// (composables/ventasNav.js VENTAS_SECTIONS). Agenda is its own module.
const VENTAS_PLACES = [
  ['/deals', 'Deals', 'lucide-handshake'],
  ['/prospectos', 'Prospectos', 'lucide-user-plus'],
  ['/inbox', 'Inbox', 'lucide-messages-square'],
  ['/inquiries', 'Consultas', 'lucide-message-square-plus'],
  ['/dashboard', 'Dashboard', 'lucide-layout-dashboard'],
  ['/reports', 'Reports', 'lucide-bar-chart-3'],
  ['/call-logs', 'Calls', 'lucide-phone'],
]

/** An action of the record on screen as a palette row (CommandPalette runs it). */
export function recordItem(action) {
  return {
    id: `record.${action.id}`,
    group: 'acciones',
    title: shellT(action.title),
    // Found by its Spanish title, its English source and its own words.
    keywords: [action.title, action.keywords].filter(Boolean).join(' '),
    icon: action.icon || 'lucide-circle-dot',
    action: 'record',
    args: { id: action.id },
    ...(action.keys?.length ? { shortcut: action.keys[0] } : {}),
  }
}

export function createShellProviders({ boot, modules }) {
  const actions = {
    key: 'acciones',
    label: 'Actions',
    scopes: ['actions'],
    async search(query) {
      // The record on screen first (Deal 360: Llamar, WhatsApp…), then create.
      const own = recordActions.value.map(recordItem)
      const items = []
      // An explicit question («¿Qué tengo pendiente hoy?») is for «Preguntar a
      // Muelle»: never offer to file it as a contact's name or an Escáner
      // search. A long query alone is not: «Jose Oswaldo Rodriguez Estrada
      // Lopez» is a name, and keeps «Nuevo contacto».
      const question = explicitQuestion(query.raw ?? query.text)
      for (const target of createTargets(boot.value)) {
        if (question && target.id === 'contactos.create') continue
        items.push({
          id: target.id,
          group: 'acciones',
          title: target.title(query.text),
          ...(target.keywords ? { keywords: target.keywords } : {}),
          icon: target.icon,
          href: target.href,
          shortcut: 'c',
        })
      }
      // Ventas creates in its list's deal dialog; «c» stays the list's own.
      if (moduleEnabled(boot.value, 'ventas'))
        items.push({
          id: 'ventas.create',
          group: 'acciones',
          title: __('New Deal'),
          keywords: 'nuevo trato venta oportunidad negocio new deal',
          icon: 'lucide-handshake',
          href: '/deals?create=1',
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
      if (
        query.text &&
        !question &&
        installedSiblings().some((app) => app.key === 'scan')
      )
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
        ? [...own, ...items.slice(0, 1)]
        : [...own, ...items].filter((item) =>
            match(query.text, item.title, item.keywords),
          )
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
      if (moduleEnabled(boot.value, 'contactos'))
        items.push({
          id: 'contactos.duplicates',
          group: 'ir_a',
          title: 'Contactos › Posibles duplicados',
          keywords: 'duplicados repetidos fusionar unir merge',
          icon: 'lucide-copy',
          href: '/contactos/duplicados',
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
        for (const [view, label, keywords] of ARCHIVOS_PLACES)
          items.push({
            id: `archivos.${view || 'por_clasificar'}`,
            group: 'ir_a',
            title: `Archivos › ${label}`,
            keywords,
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
  // Deals (CRM-S3.3): title, person, phone in any spelling or RO number; open
  // deals first, then the most recently touched. The server applies permissions.
  const ventas = {
    key: 'ventas',
    label: 'Ventas',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'ventas'))
        return []
      const rows = await call('crm.api.palette.search_deals', {
        q: query.text,
      })
      if (signal.aborted) return []
      return (rows || []).map(dealItem)
    },
  }
  // Clínica answers for its own records (patients, today's appointments) when its module is on
  // for this user (clinica.shell.module). Items open in /clinica with the way back to here.
  const clinica = {
    key: 'clinica',
    label: 'Clínica',
    scopes: ['people'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'clinica'))
        return []
      const result = await call('clinica.shell.search', { q: query.text })
      if (signal.aborted) return []
      return clinicaItems(result)
    },
  }
  // Inmobiliaria answers for its units, sales, holds, client files and leases when the app is
  // installed on this site (the CRM boot's installed_apps; it is not a shell module). Its
  // records live in Desk: items open their Desk form in this tab.
  const inmobiliaria = {
    key: 'inmobiliaria',
    label: 'Inmobiliaria',
    scopes: ['people', 'documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !inmobiliariaInstalled()) return []
      const text = query.text.slice(0, 80)
      if (text.length < 2) return []
      const result = await call('inmobiliaria.busqueda.palette', { q: text })
      if (signal.aborted) return []
      return inmobiliariaItems(result)
    },
  }
  const manual = createManualProvider({ boot })
  // The assistant answers questions only; its row lands in Acciones, above
  // every record, so a question still gets «Preguntar a Muelle» first.
  return [
    actions,
    contactos,
    places,
    ventas,
    clinica,
    inmobiliaria,
    manual,
    createAssistantProvider(),
  ]
}

/** Whether the inmobiliaria app is installed on this site (the CRM boot's installed_apps). */
export function inmobiliariaInstalled(
  apps = globalThis.window?.installed_apps,
) {
  return Array.isArray(apps) && apps.includes('inmobiliaria')
}

// The icons Inmobiliaria may ask for, spelled out so their lucide classes are built.
const INMOBILIARIA_ICONS = Object.freeze([
  'lucide-building-2',
  'lucide-handshake',
  'lucide-bookmark',
  'lucide-folder-open',
  'lucide-key-round',
])

/** Inmobiliaria's palette rows: only its Desk forms (/desk/…) are kept, opened in this tab. */
export function inmobiliariaItems(result) {
  return (result?.items || [])
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.href === 'string' &&
        safeReturn(item.href, ['/desk/']),
    )
    .map((item) => ({
      id: `inmobiliaria:${item.id}`,
      group: 'registros',
      title: String(item.title || ''),
      subtitle: String(item.subtitle || ''),
      icon: INMOBILIARIA_ICONS.includes(item.icon)
        ? item.icon
        : 'lucide-building-2',
      desk: item.href,
    }))
}

/** Clínica's palette rows: only links into /clinica/ are kept, opened as a sibling app. */
export function clinicaItems(result) {
  return (result?.items || [])
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.href === 'string' &&
        item.href.startsWith('/clinica/'),
    )
    .map((item) => ({
      id: `clinica:${item.id}`,
      group: 'registros',
      title: String(item.title || ''),
      subtitle: String(item.subtitle || ''),
      icon: item.icon || 'lucide-stethoscope',
      external: item.href,
    }))
}

// An empty input opens on Recientes and the modules to go to; a typed query
// ranks the records (a deal, a customer) above «Nuevo …».
const SECTION_ORDER = {
  empty: ['recientes', 'ir_a', 'registros', 'acciones'],
  typed: ['registros', 'acciones', 'ir_a', 'recientes'],
}

/**
 * The palette's sections (from groupPaletteItems) in display order. A question
 * still gets «Preguntar a Muelle» first (SHELL-S2): that row leads in its own
 * headerless section (`lead`), then the records, then the other actions.
 */
export function orderPaletteSections(grouped, { empty = false } = {}) {
  const order = SECTION_ORDER[empty ? 'empty' : 'typed']
  const rank = (group) => {
    const index = order.indexOf(group)
    return index < 0 ? order.length : index
  }
  const sorted = [...grouped].sort((a, b) => rank(a.group) - rank(b.group))
  if (empty) return sorted
  const ask = sorted
    .flatMap((section) => section.items)
    .filter((item) => item.action === 'assistant')
  if (!ask.length) return sorted
  return [
    { group: 'acciones', items: ask, lead: true },
    ...sorted
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.action !== 'assistant'),
      }))
      .filter((section) => section.items.length),
  ]
}

/**
 * A deal row from crm.api.palette.search_deals as a palette record. The title
 * is the deal's name (with its person); the line reads «Trato · Ganado ·
 * $12,000.00» and, for a customer's search, the repair order and phone. No
 * raw record ID.
 */
export function dealItem(row) {
  const title = row.title || kindLabel('CRM Deal')
  return {
    id: `deal:${row.name}`,
    group: 'registros',
    title,
    subtitle: [
      kindLabel('CRM Deal'),
      row.status_label || (row.status ? statusLabel(row.status, 'deal') : ''),
      row.amount ? formatMoney(row.amount, row.currency || 'MXN') : '',
      row.repair_order,
      row.mobile_no,
    ]
      .filter(Boolean)
      .join(' · '),
    icon: row.closed ? 'lucide-archive' : 'lucide-handshake',
    href: `/ventas/deal/${encodeURIComponent(row.name)}`,
    record: { source: 'deal', name: row.name },
  }
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
