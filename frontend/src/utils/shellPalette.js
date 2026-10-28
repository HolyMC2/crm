import { contactosApi } from '@/composables/useContactos'
import { identityTypeLabel } from '@/utils/contactos'
import { call } from 'frappe-ui'
import {
  SHELL_MODULES,
  moduleEnabled,
  moduleForPath,
  can,
  bootScope,
  safeReturn,
  DESK_PREFIXES,
  matchTokens,
} from '@/vendor/muelle-shell/contracts'
import { shellT } from '@/composables/shellKeyboard'
import { ventasSection } from '@/composables/ventasSections'
import { isNarrow } from '@/composables/breakpoint'
import { installedSiblings, sortSiblings } from '@/composables/shellRail'
import { createTargets } from '@/utils/shellCreate'
import { looksLikeDocument } from '@/components/captura/cameraDoor'
import { recordActions } from '@/composables/recordActions'
import {
  createDocumentosProvider,
  createTiposProvider,
  documentItem,
  documentosPlaces,
} from '@/documentos/palette'
// Manual de la tienda: one self-contained provider (articles, categories, «Nuevo artículo»).
import { createManualProvider } from '@/utils/manualPalette'
// «Pregúntale a Muelle»: a question gets «Preguntar a Muelle» first (SHELL-S2).
import { createAssistantProvider } from '@/components/assistant/assistantPalette'
// Reportes and Desk workspaces, as Desk lists them for this worker (E7).
import { createDeskProviders } from '@/utils/deskPalette'
import {
  formatDate,
  formatMoney,
  formatQty,
  kindLabel,
  statusLabel,
} from '@/utils/display'
import {
  TIPOS,
  deskTipo,
  fichaFromDesk,
  parseFicha,
} from '@/utils/inmobiliariaTipos'

// ¿…, …? or an interrogative first word (PM rule, SHELL-S1.2). Narrower than
// the assistant's looksLikeQuestion, which also counts any 5+ word query.
const INTERROGATIVE =
  /^(qu[eé]|c[oó]mo|cu[aá]nt[oa]s?|cu[aá]l(es)?|qui[eé]n(es)?|d[oó]nde|cu[aá]ndo|por ?qu[eé])(?!\p{L})/iu
export function explicitQuestion(text) {
  const value = String(text || '').trim()
  return /^[¿?]/u.test(value) || /\?$/u.test(value) || INTERROGATIVE.test(value)
}

// Palette providers for the shell (spec §1.4): Contactos records and Ventas deals. Each answers on its own and is
// cut off by the shared abort signal; the server rechecks every record. The
// rows the shell filters itself use the shell's search rule (matchTokens):
// every word, in any order, without accents («cob venc», «garantias»).

/**
 * Row rank (Shell E7b): a shell place or record matching the term is 0 (the
 * default), a hand-written action specific to it 1, generic fan-out 2 («Nuevo
 * contacto «term»», «Buscar «term» en Escáner», a readable DocType's «Crear X»).
 * A group whose best row is generic renders after Ir a (orderPaletteSections).
 */
export const PALETTE_RANK = Object.freeze({ place: 0, specific: 1, generic: 2 })

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
// The Ventas daily lists first, then the «Más» lists people jump to by name,
// derived from VENTAS_SECTIONS (composables/ventasSections.js) so the palette
// never offers a retired list. Not the manager or desk-only screens; Tareas
// is Pendientes and the funnel needs the add-on, so they have no icon here.
const PLACE_ICONS = {
  deals: 'lucide-handshake',
  prospectos: 'lucide-user-plus',
  inbox: 'lucide-messages-square',
  dashboard: 'lucide-layout-dashboard',
  calls: 'lucide-phone',
  reports: 'lucide-chart-column',
}
// The 4th field marks a desk-only place (Dashboard, Shell D3): the palette
// leaves it out below 768px, where its route says «Ábrelo en una computadora».
export const VENTAS_PLACES = ['daily', 'more']
  .flatMap(ventasSection)
  .filter((item) => !item.managerOnly && PLACE_ICONS[item.key])
  .map((item) => [item.to, item.label, PLACE_ICONS[item.key], item.desktopOnly])

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
          // «Nuevo contacto «term»» files whatever was typed: generic.
          rank:
            target.id === 'contactos.create' && query.text
              ? PALETTE_RANK.generic
              : PALETTE_RANK.specific,
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
          rank: PALETTE_RANK.specific,
        })
      // «Escanear documento» (Shell D7): first when the words say «ticket»,
      // «factura», «foto»… (cameraDoor.looksLikeDocument).
      const cameraItem = {
        id: 'camara.documento',
        group: 'acciones',
        title: __('Scan document'),
        keywords:
          'escanear documento foto camara ticket factura recibo comprobante transferencia spei cotizacion orden de compra ine identificacion domicilio capturar ocr scan document',
        icon: 'lucide-camera',
        action: 'camera',
        rank: PALETTE_RANK.specific,
      }
      if (looksLikeDocument(query.text)) items.unshift(cameraItem)
      else items.push(cameraItem)
      if (installedSiblings().some((app) => app.key === 'scan'))
        items.push({
          id: 'escaner.pick',
          group: 'acciones',
          title: __('Scan a code'),
          keywords: 'escanear codigo barras camara scan barcode articulo',
          icon: 'lucide-scan-barcode',
          scanPick: true,
          rank: PALETTE_RANK.specific,
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
          rank: PALETTE_RANK.generic,
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
          rank: PALETTE_RANK.specific,
        },
        {
          id: 'theme.light',
          group: 'acciones',
          title: __('Light theme'),
          icon: 'lucide-sun',
          action: 'theme',
          args: { theme: 'light' },
          rank: PALETTE_RANK.specific,
        },
        {
          id: 'theme.dark',
          group: 'acciones',
          title: __('Dark theme'),
          icon: 'lucide-moon',
          action: 'theme',
          args: { theme: 'dark' },
          rank: PALETTE_RANK.specific,
        },
      )
      return query.kind === 'empty'
        ? [...own, ...items.slice(0, 1)]
        : [...own, ...items].filter((item) =>
            matchTokens(query.text, item.title, item.keywords),
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
        keywords: module.key === 'resultados' ? 'reportes informes' : undefined,
      }))
      // An empty palette opens on Recientes plus the modules (S1.2).
      if (query.kind === 'empty') return items
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
      // Bancos (Shell D11): its places besides the module itself.
      if (moduleEnabled(boot.value, 'bancos'))
        for (const [path, label, keywords] of [
          ['/bancos', 'Cuentas', 'banco saldo conciliar movimientos tarjeta'],
          ['/bancos/catalogo', 'Catálogo de cuentas', 'contabilidad sat mayor'],
          ['/bancos/balanza', 'Balanza', 'balanza comprobacion saldos'],
        ])
          items.push({
            id: `bancos.${path}`,
            group: 'ir_a',
            title: `Bancos › ${label}`,
            keywords,
            icon: 'lucide-wallet',
            href: path,
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
      if (moduleEnabled(boot.value, 'encuestas')) {
        for (const [view, label] of ENCUESTAS_PLACES)
          items.push({
            id: `encuestas.${view}`,
            group: 'ir_a',
            title: `Encuestas › ${label}`,
            icon: 'lucide-smile',
            href: `/encuestas?view=${view}`,
          })
        // Formularios shares Encuestas' front (Q7 = B). Encuestas readers are
        // Sales and System Managers (encuestas D2), the roles /forms admits.
        items.push({
          id: 'encuestas.formularios',
          group: 'ir_a',
          title: 'Encuestas › Formularios',
          keywords: 'forms captacion prospectos',
          icon: 'lucide-clipboard-list',
          href: '/forms',
        })
      }
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
      items.push(...documentosPlaces(boot.value))
      if (moduleEnabled(boot.value, 'ventas'))
        for (const [path, label, icon, deskOnly] of VENTAS_PLACES)
          if (!(deskOnly && isNarrow.value))
            items.push({
              id: `ventas.${path}`,
              group: 'ir_a',
              title: `Ventas › ${__(label)}`,
              icon,
              href: path,
            })
      return items.filter((item) =>
        matchTokens(query.text, item.title, item.keywords),
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
  // Productos (doco.workspaces.products.palette): products by the shared item
  // ranker («pan sm a05» finds «Pantalla SM A05»), and a serial number (IMEI)
  // or batch typed or scanned whole says what it is and where.
  const productos = {
    key: 'productos',
    label: 'Productos',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'productos'))
        return []
      const text = query.text.slice(0, 140)
      if (text.length < 2) return []
      const result = await call('doco.workspaces.products.palette', { q: text })
      if (signal.aborted) return []
      return productosItems(result, text, {
        taller: installedSiblings().some((app) => app.key === 'taller'),
      })
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
  // installed on this site (the CRM boot's installed_apps). Its records open their shell
  // screens under /inmobiliaria (INMO-SH), with the way back.
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
  // The assistant's question row lands in Acciones, above every record, so a
  // question still gets «Preguntar a Muelle» first; its place row is in Ir a.
  return [
    actions,
    contactos,
    places,
    ventas,
    productos,
    createDocumentosProvider({ boot }),
    createTiposProvider({ boot }),
    clinica,
    inmobiliaria,
    manual,
    ...createDeskProviders({ modules }),
    createAssistantProvider(),
  ]
}

/** Whether the inmobiliaria app is installed on this site (the CRM boot's installed_apps). */
export function inmobiliariaInstalled(
  apps = globalThis.window?.installed_apps,
) {
  return Array.isArray(apps) && apps.includes('inmobiliaria')
}

// The icons Inmobiliaria may ask for: one per record screen, spelled out in
// TIPOS so their lucide classes are built.
const INMOBILIARIA_ICONS = Object.freeze(
  Object.values(TIPOS).map((t) => t.icono),
)

/**
 * Inmobiliaria's palette rows. A record with a shell screen (`/crm/inmobiliaria/…`,
 * INMO-SH) opens there and comes back, also when the server answers with its
 * Desk form (/desk/unidad-inmobiliaria/…): a doctype with a record screen is
 * never a Desk row. Only a record without one keeps opening Desk in this tab.
 */
export function inmobiliariaItems(result) {
  return (result?.items || [])
    .map((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.href !== 'string')
        return null
      const shell = item.href.startsWith('/crm/inmobiliaria/')
        ? safeReturn(item.href, ['/crm/inmobiliaria/'])?.slice('/crm'.length)
        : fichaFromDesk(safeReturn(item.href, DESK_PREFIXES))
      // A Desk address of a doctype with a screen that is not a record (a
      // list, a new form) is no row at all.
      const desk =
        shell || deskTipo(item.href) ? null : safeReturn(item.href, ['/desk/'])
      if (!shell && !desk) return null
      return {
        id: `inmobiliaria:${item.id}`,
        group: 'registros',
        title: String(item.title || ''),
        subtitle: String(item.subtitle || ''),
        // Another icon (or none) shows the record screen's own.
        icon: INMOBILIARIA_ICONS.includes(item.icon)
          ? item.icon
          : TIPOS[parseFicha(shell)?.tipo]?.icono || 'lucide-building-2',
        ...(shell ? { href: shell } : { desk }),
      }
    })
    .filter(Boolean)
}

// The palette shows this many products (doco PALETTE_ROWS); a full page may
// have more, so it offers the whole Productos list for the same words.
const PRODUCT_ROWS = 5
const productHref = (code) => `/productos/${encodeURIComponent(code)}`
const deviceHistory = (code) =>
  `/taller/imei?identifier=${encodeURIComponent(code)}`

/**
 * Productos' palette rows. A serial or batch leads with its product, state
 * and place, then the device's history in Taller when it is installed; a
 * code that no serial or batch has says so and offers where to look next.
 * Products read «Producto · group · price · stock».
 */
export function productosItems(result, text, { taller = false } = {}) {
  const items = []
  for (const unit of result?.units || []) {
    if (!unit?.name || !unit.item_code) continue
    const serial = unit.kind === 'serial'
    items.push({
      id: `${unit.kind}:${unit.name}`,
      group: 'registros',
      title: serial
        ? __('Serial {0}', [unit.name])
        : __('Batch {0}', [unit.name]),
      subtitle: [
        unit.item_name,
        serial ? unit.status_label : '',
        serial ? unit.warehouse : formatQty(unit.qty),
        !serial && unit.expiry
          ? __(unit.expired ? 'Expired on {0}' : 'Expires {0}', [
              formatDate(unit.expiry, { relative: false }),
            ])
          : '',
        serial && unit.warranty_until
          ? __('Warranty until {0}', [
              formatDate(unit.warranty_until, { relative: false }),
            ])
          : '',
        unit.disabled ? __('Disabled') : '',
      ]
        .filter(Boolean)
        .join(' · '),
      icon: serial ? 'lucide-barcode' : 'lucide-boxes',
      href: productHref(unit.item_code),
    })
    if (serial && taller)
      items.push({
        id: `serial:${unit.name}:historial`,
        group: 'acciones',
        title: __('Device history of {0}', [unit.name]),
        keywords: `${unit.name} imei historial equipo reparaciones ventas`,
        icon: 'lucide-history',
        external: deviceHistory(unit.name),
        rank: PALETTE_RANK.specific,
      })
  }
  const products = (result?.items || []).filter((row) => row?.name)
  if (result?.checked && !items.length && !products.length)
    items.push({
      id: `unit:${text}:ninguna`,
      group: 'registros',
      title: __('No serial or batch «{0}»', [text]),
      subtitle: taller
        ? __('Not in the system. Look up the device history in Taller.')
        : __('Not in the system. Check the code and try again.'),
      icon: 'lucide-circle-help',
      ...(taller
        ? { external: deviceHistory(text) }
        : { href: `/productos?q=${encodeURIComponent(text)}` }),
    })
  for (const row of products)
    items.push({
      id: `item:${row.name}`,
      group: 'registros',
      title: row.title || row.name,
      subtitle: [
        kindLabel('Item'),
        row.item_group,
        row.price?.rate != null
          ? formatMoney(row.price.rate, row.price.currency || 'MXN')
          : '',
        !row.stock || !row.stock_item
          ? ''
          : row.stock.qty > 0
            ? __('{0} in stock', [formatQty(row.stock.qty, row.uom)])
            : __('Out of stock'),
      ]
        .filter(Boolean)
        .join(' · '),
      icon: 'lucide-package',
      href: productHref(row.name),
    })
  if (products.length >= PRODUCT_ROWS)
    items.push({
      id: 'productos.todos',
      group: 'acciones',
      title: __('See «{0}» in Productos', [text]),
      keywords: `${text} productos articulos inventario`,
      icon: 'lucide-package-search',
      href: `/productos?q=${encodeURIComponent(text)}`,
      rank: PALETTE_RANK.specific,
    })
  return items
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

// An empty input opens on Recientes, then the actions for the record on
// screen (and «Nuevo contacto»), then the modules to go to; a typed query
// ranks the records (a deal, a customer) above «Nuevo …».
// Listas, Reportes and Desk (E7) follow the shell's own places, never lead them.
const SECTION_ORDER = {
  empty: ['recientes', 'acciones', 'ir_a', 'registros'],
  typed: [
    'registros',
    'acciones',
    'ir_a',
    'listas',
    'reportes',
    'desk',
    'recientes',
  ],
}

const bestRank = (items) =>
  Math.min(...items.map((item) => item.rank ?? PALETTE_RANK.place))

/**
 * The palette's sections (from groupPaletteItems) in display order. A question
 * still gets «Preguntar a Muelle» first (SHELL-S2): that row leads in its own
 * headerless section (`lead`), then the records, then the other actions. A
 * section whose best row is generic (PALETTE_RANK) renders after Ir a, so a
 * shell place matching the term outranks «Nuevo contacto «term»» and a
 * DocType's «Crear X» (E7b).
 */
export function orderPaletteSections(grouped, { empty = false } = {}) {
  const order = SECTION_ORDER[empty ? 'empty' : 'typed']
  // The question row (Acciones) leads; the door «Pregúntale a Muelle» (Ir a) stays put.
  const asks = (section, item) =>
    !empty && section.group === 'acciones' && item.action === 'assistant'
  const ask = grouped.flatMap((section) =>
    section.items.filter((item) => asks(section, item)),
  )
  const rest = grouped
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !asks(section, item)),
    }))
    .filter((section) => section.items.length)
  const afterPlaces = order.indexOf('ir_a') + 0.5
  const position = (section) => {
    const index = order.indexOf(section.group)
    if (index < 0) return order.length
    return !empty &&
      index < afterPlaces &&
      bestRank(section.items) === PALETTE_RANK.generic
      ? afterPlaces
      : index
  }
  const sorted = [...rest].sort((a, b) => position(a) - position(b))
  return ask.length
    ? [{ group: 'acciones', items: ask, lead: true }, ...sorted]
    : sorted
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
// through a permission check each time, so revoked access shows nothing. A
// place, list, report or workspace row carries only its label, so it is kept
// as chosen (E7); an action row is never a recent.
// A chosen row comes back from pushRecent already regrouped as «recientes».
const STABLE_GROUPS = new Set([
  'ir_a',
  'listas',
  'reportes',
  'desk',
  'recientes',
])
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
  if (!item || item.action || item.external || item.scanPick) return null
  const record = item.record || recordFromHref(item.href)
  const { source, name, doctype } = record
  if (typeof name === 'string' && typeof source === 'string')
    return {
      id: String(item.id),
      href: String(item.href),
      record: { source, name },
    }
  if (typeof name === 'string' && typeof doctype === 'string')
    return {
      id: String(item.id),
      href: String(item.href),
      record: { doctype, name },
    }
  if (!STABLE_GROUPS.has(item.group) || !item.title) return null
  if (typeof item.href !== 'string' && typeof item.desk !== 'string')
    return null
  return {
    id: String(item.id),
    group: item.group,
    title: String(item.title),
    ...(item.subtitle ? { subtitle: String(item.subtitle) } : {}),
    ...(typeof item.href === 'string' ? { href: item.href } : {}),
    ...(typeof item.desk === 'string' ? { desk: item.desk } : {}),
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
// Deals belong to Ventas; every other source is a Contactos record. A
// documentos record is resolved by its own endpoint; a place or list by the
// module its path belongs to; a report or workspace stays (Desk refuses it).
const recentModule = (ref) => {
  if (ref.record)
    return ref.record.source
      ? ref.record.source === 'deal'
        ? 'ventas'
        : 'contactos'
      : 'documentos'
  if (ref.href) return moduleForPath(ref.href, SHELL_MODULES)?.key || null
  return null
}
const recentKeyOf = (record) =>
  record.source
    ? `${record.source}:${record.name}`
    : `${record.doctype}:${record.name}`
export async function resolveRecent(refs, boot) {
  refs = refs.filter((ref) => {
    const key = recentModule(ref)
    return !key || moduleEnabled(boot, key)
  })
  if (!refs.length) return []
  const sources = refs.filter((ref) => ref.record?.source)
  const documents = refs.filter((ref) => ref.record?.doctype)
  let rows
  try {
    const [found, docs] = await Promise.all([
      sources.length
        ? call('crm.api.shell.resolve_recent', {
            records: sources.map((ref) => ref.record),
          })
        : [],
      documents.length
        ? call('crm.api.shell.resolve_documents', {
            records: documents.map((ref) => ref.record),
          })
        : [],
    ])
    rows = [...(found || []), ...(docs || [])]
  } catch {
    return null // unknown (offline, server error): show nothing, keep refs
  }
  const allowed = new Map(rows.map((row) => [recentKeyOf(row), row]))
  return refs
    .map((ref) => {
      if (!ref.record)
        return { ...ref, group: 'recientes', icon: 'lucide-history' }
      const row = allowed.get(recentKeyOf(ref.record))
      if (!row) return null
      const item = row.doctype ? documentItem(row, boot) : {}
      return {
        ...ref,
        group: 'recientes',
        title: item.title || row.title || row.name,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        icon: 'lucide-history',
      }
    })
    .filter(Boolean)
}
export function saveRecent(items) {
  try {
    localStorage.setItem(recentKey(), JSON.stringify(items))
  } catch {
    // Storage may be unavailable; recents stay for this palette only.
  }
}
