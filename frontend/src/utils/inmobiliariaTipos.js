// Inmobiliaria's record screens in the shell (INMO-SH): every doctype the app
// serves at /inmobiliaria/<tipo>/:name, with its es-MX name. Tiny and free of
// imports on purpose: the documents hand-off (documentos/registry.js) and the
// palette read it without loading the app's screens. It follows the server's
// TIPOS (inmobiliaria/shell.py, doctype → tipo), as does the router's ficha
// route: a tipo added there is added here and in that route.

/**
 * tipo (the route segment) → the doctype it serves, its es-MX name and its
 * icon. The icons are spelled out here so their lucide classes are built; the
 * first five are the ones the server's search sends (busqueda.py). Each icon
 * adds its SVG to the global stylesheet (61 KB gzip budget), so where one fits
 * the others reuse an icon the shell already draws (`lucide-home`, the old
 * name of `house`).
 */
export const TIPOS = Object.freeze({
  unidad: Object.freeze({
    doctype: 'Unidad Inmobiliaria',
    etiqueta: 'Unidad',
    icono: 'lucide-building-2',
  }),
  apartado: Object.freeze({
    doctype: 'Apartado de Unidad',
    etiqueta: 'Apartado de unidad',
    icono: 'lucide-bookmark',
  }),
  venta: Object.freeze({
    doctype: 'Venta Inmobiliaria',
    etiqueta: 'Venta inmobiliaria',
    icono: 'lucide-handshake',
  }),
  expediente: Object.freeze({
    doctype: 'Expediente de Cliente',
    etiqueta: 'Expediente del cliente',
    icono: 'lucide-folder-open',
  }),
  contrato: Object.freeze({
    doctype: 'Contrato de Arrendamiento',
    etiqueta: 'Contrato de arrendamiento',
    icono: 'lucide-key-round',
  }),
  mantenimiento: Object.freeze({
    doctype: 'Solicitud de Mantenimiento',
    etiqueta: 'Solicitud de mantenimiento',
    icono: 'lucide-wrench',
  }),
  aviso: Object.freeze({
    doctype: 'Aviso PLD',
    etiqueta: 'Aviso PLD',
    icono: 'lucide-shield-alert',
  }),
  liquidacion: Object.freeze({
    doctype: 'Liquidacion a Propietarios',
    etiqueta: 'Liquidación a propietarios',
    icono: 'lucide-wallet',
  }),
  comision: Object.freeze({
    doctype: 'Comision Inmobiliaria',
    etiqueta: 'Comisión inmobiliaria',
    icono: 'lucide-percent',
  }),
  entrega: Object.freeze({
    doctype: 'Entrega de Unidad',
    etiqueta: 'Entrega de unidad',
    icono: 'lucide-door-open',
  }),
  garantia: Object.freeze({
    doctype: 'Solicitud de Garantia',
    etiqueta: 'Solicitud de garantía',
    icono: 'lucide-shield-check',
  }),
  etapa: Object.freeze({
    doctype: 'Etapa de Obra',
    etiqueta: 'Etapa de obra',
    icono: 'lucide-layers',
  }),
  captacion: Object.freeze({
    doctype: 'Captacion',
    etiqueta: 'Captación',
    icono: 'lucide-file-text',
  }),
  oferta: Object.freeze({
    doctype: 'Oferta de Compra',
    etiqueta: 'Oferta de compra',
    icono: 'lucide-file-pen-line',
  }),
  ajuste: Object.freeze({
    doctype: 'Ajuste de Precios',
    etiqueta: 'Ajuste de precios',
    icono: 'lucide-tag',
  }),
  solicitud: Object.freeze({
    doctype: 'Solicitud de Arrendamiento',
    etiqueta: 'Solicitud de arrendamiento',
    icono: 'lucide-clipboard-check',
  }),
  propiedad: Object.freeze({
    doctype: 'Propiedad Administrada',
    etiqueta: 'Propiedad administrada',
    icono: 'lucide-home',
  }),
})

const entries = Object.entries(TIPOS)
const BY_DOCTYPE = Object.fromEntries(entries.map(([t, v]) => [v.doctype, t]))
// Desk's form route of a doctype: frappe.scrub with dashes (/desk/aviso-pld/…).
const deskSlug = (doctype) => doctype.toLowerCase().replace(/[ _-]/g, '-')
const BY_DESK_SLUG = Object.fromEntries(
  entries.map(([t, v]) => [deskSlug(v.doctype), t]),
)

/** The tipo of a doctype's record screen, or '' when the shell has none (a CRM Deal opens in Ventas). */
export function tipoOf(doctype) {
  return Object.hasOwn(BY_DOCTYPE, doctype) ? BY_DOCTYPE[doctype] : ''
}

/** A record screen as a router path (the router base is /crm). */
export function fichaPath(tipo, name) {
  return `/inmobiliaria/${tipo}/${encodeURIComponent(name)}`
}

/** `{ tipo, name }` of a router path that opens a record screen, else null. */
export function parseFicha(path) {
  const match = /^\/inmobiliaria\/([a-z]+)\/([^/]+)$/.exec(
    String(path || '').split(/[?#]/)[0],
  )
  if (!match || !Object.hasOwn(TIPOS, match[1])) return null
  try {
    return { tipo: match[1], name: decodeURIComponent(match[2]) }
  } catch {
    return null
  }
}

/** The tipo of the doctype a Desk address (`/desk/<doctype>…`, or the older `/app/…`) opens, or ''. */
export function deskTipo(url) {
  const match = /^\/(?:desk|app)\/([a-z0-9-]+)(?:[/?#]|$)/.exec(
    String(url || ''),
  )
  return match && Object.hasOwn(BY_DESK_SLUG, match[1])
    ? BY_DESK_SLUG[match[1]]
    : ''
}

/**
 * The record screen behind a Desk form address (`/desk/<doctype>/<name>`)
 * when its doctype has one, as a router path; '' for any other address (a
 * list, a new form, another doctype). Routine work never sends a worker to
 * Desk for a record the shell opens.
 */
export function fichaFromDesk(url) {
  const tipo = deskTipo(url)
  const match = /^\/(?:desk|app)\/[a-z0-9-]+\/([^/?#]+)\/?(?:[?#]|$)/.exec(
    String(url || ''),
  )
  if (!tipo || !match) return ''
  let name
  try {
    name = decodeURIComponent(match[1])
  } catch {
    return ''
  }
  // A list view or a new-record form is not a record.
  if (!name || name === 'view' || /^new(-|$)/.test(name)) return ''
  return fichaPath(tipo, name)
}
