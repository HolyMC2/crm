// Documentos: the static registry of curated document lists (Shell SPEC §6 DD1, DD2).
// Tiny and free of profile code on purpose: Avisos, the kardex and the palette resolve
// links through `documentRoute` without loading any profile (budgets, DD12). The
// profile code itself loads lazily from ./profiles (see README.md).

/**
 * One entry per list. `slug` is the Spanish URL segment; `base` the module path
 * that owns it (the bar lights that module); `match` picks the entry when one
 * doctype has several lists (Payment Entry: cobros and pagos).
 * `attention` words the hub's count of documents that ask for action («3 vencidas»).
 * `recordRoute(name)` hands the record to an existing, richer shell page (a `{ path }`).
 */
export const PROFILES = Object.freeze([
  {
    doctype: 'Quotation',
    attention: 'abiertas',
    slug: 'cotizaciones',
    group: 'ventas',
    label: 'Cotizaciones',
    icon: 'lucide-file-text',
    hint: 'Precios que ofreciste a un cliente',
  },
  {
    doctype: 'Sales Order',
    attention: 'por entregar o facturar',
    slug: 'pedidos',
    group: 'ventas',
    label: 'Pedidos',
    icon: 'lucide-clipboard-list',
    hint: 'Lo que un cliente te pidió',
  },
  {
    doctype: 'Delivery Note',
    attention: 'por facturar',
    slug: 'entregas',
    group: 'ventas',
    label: 'Entregas',
    icon: 'lucide-truck',
    hint: 'Mercancía que salió a un cliente',
  },
  {
    doctype: 'Sales Invoice',
    attention: 'vencidas',
    slug: 'facturas',
    group: 'ventas',
    label: 'Facturas',
    icon: 'lucide-receipt-text',
    hint: 'Lo que cobras a tus clientes',
  },
  {
    doctype: 'POS Invoice',
    slug: 'tickets',
    group: 'ventas',
    label: 'Tickets',
    icon: 'lucide-receipt',
    hint: 'Ventas de mostrador en caja',
  },
  {
    doctype: 'Material Request',
    attention: 'pendientes',
    slug: 'requisiciones',
    group: 'compras',
    label: 'Requisiciones',
    icon: 'lucide-list-checks',
    hint: 'Lo que la tienda necesita',
  },
  {
    doctype: 'Request for Quotation',
    slug: 'solicitudes-cotizacion',
    group: 'compras',
    label: 'Solicitudes de cotización',
    icon: 'lucide-mail-question',
    hint: 'Precios que pediste a proveedores',
  },
  {
    doctype: 'Supplier Quotation',
    slug: 'cotizaciones-proveedor',
    group: 'compras',
    label: 'Cotizaciones de proveedor',
    icon: 'lucide-file-text',
    hint: 'Precios que te dieron los proveedores',
  },
  {
    doctype: 'Purchase Order',
    attention: 'por recibir',
    slug: 'ordenes-compra',
    group: 'compras',
    label: 'Órdenes de compra',
    icon: 'lucide-shopping-cart',
    hint: 'Lo que pediste a un proveedor',
    recordRoute: (name) => ({
      path: `/compras/orden/${encodeURIComponent(name)}`,
    }),
  },
  {
    doctype: 'Purchase Receipt',
    attention: 'por facturar',
    slug: 'recepciones',
    group: 'compras',
    label: 'Recepciones',
    icon: 'lucide-package-check',
    hint: 'Mercancía que llegó de un proveedor',
  },
  {
    doctype: 'Purchase Invoice',
    attention: 'vencidas',
    slug: 'facturas-proveedor',
    group: 'compras',
    label: 'Facturas de proveedor',
    icon: 'lucide-file-input',
    hint: 'Lo que debes a tus proveedores',
    recordRoute: (name) => ({
      path: `/gastos/factura/${encodeURIComponent(name)}`,
    }),
  },
  {
    doctype: 'Payment Entry',
    slug: 'cobros',
    group: 'pagos',
    label: 'Cobros',
    icon: 'lucide-hand-coins',
    hint: 'Dinero que recibiste',
    match: { payment_type: 'Receive' },
    filters: [['payment_type', '=', 'Receive']],
  },
  {
    doctype: 'Payment Entry',
    slug: 'pagos',
    group: 'pagos',
    label: 'Pagos',
    icon: 'lucide-banknote',
    hint: 'Dinero que pagaste',
    match: { payment_type: 'Pay' },
    filters: [['payment_type', '=', 'Pay']],
  },
  {
    doctype: 'Stock Entry',
    slug: 'entradas',
    group: 'inventario',
    base: '/inventario',
    label: 'Entradas y traspasos',
    icon: 'lucide-arrow-left-right',
    hint: 'Mercancía que entra, sale o cambia de almacén',
  },
  {
    doctype: 'Stock Reconciliation',
    slug: 'ajustes',
    group: 'inventario',
    base: '/inventario',
    label: 'Ajustes',
    icon: 'lucide-scale',
    hint: 'Conteos que corrigen la existencia',
  },
])

export const GROUPS = Object.freeze([
  { key: 'ventas', label: 'Ventas' },
  { key: 'compras', label: 'Compras' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'inventario', label: 'Inventario' },
])

const BASE = '/documentos'

export function baseOf(entry) {
  return entry?.base || BASE
}

/** The module key that owns an entry's pages (the bar lights it). */
export function moduleOf(entry) {
  return baseOf(entry) === '/inventario' ? 'inventario' : 'documentos'
}

export function profileBySlug(slug, base = BASE) {
  return PROFILES.find((p) => p.slug === slug && baseOf(p) === base) || null
}

/** The list entry for a doctype; `doc` (or a hint such as `{ payment_type }`) picks among several. */
export function profileFor(doctype, doc = null) {
  const all = PROFILES.filter((p) => p.doctype === doctype)
  if (all.length < 2 || !doc) return all[0] || null
  return (
    all.find((p) =>
      Object.entries(p.match || {}).every(([k, v]) => doc[k] === v),
    ) || all[0]
  )
}

/** Doctypes the boot says this worker reads (both modules), or null when unknown. */
export function readableDoctypes(boot) {
  const modules = boot?.modules
  if (!modules) return null
  const out = new Set()
  for (const key of ['documentos', 'inventario']) {
    if (modules[key]?.enabled)
      (modules[key].capabilities?.doctypes || []).forEach((d) => out.add(d))
  }
  return out
}

export function listRoute(entry, query) {
  return { path: `${baseOf(entry)}/${entry.slug}`, ...(query ? { query } : {}) }
}

/** The generic floor for any readable doctype (DD1). */
export function floorRoute(doctype, name) {
  const path = `${BASE}/tipo/${encodeURIComponent(doctype)}`
  return { path: name ? `${path}/${encodeURIComponent(name)}` : path }
}

// Records that already have a richer shell page of their own.
const HANDOFF = {
  Item: (name) => ({ path: `/productos/${encodeURIComponent(name)}` }),
}

/**
 * Where a document opens in the shell: its profile's record (or the richer page
 * the profile hands it to), Producto for an Item, else the generic floor.
 * `null` when the worker cannot read it here (the boot says so) or nothing is given.
 * `hint` carries fields that pick among a doctype's lists (`{ payment_type }`).
 */
export function documentRoute(
  doctype,
  name,
  { boot = null, hint = null } = {},
) {
  if (!doctype || !name) return null
  if (HANDOFF[doctype]) return HANDOFF[doctype](name)
  const readable = readableDoctypes(boot)
  const entry = profileFor(doctype, hint)
  if (entry) {
    if (readable && !readable.has(doctype)) return null
    if (entry.recordRoute) return entry.recordRoute(name)
    return {
      path: `${baseOf(entry)}/${entry.slug}/${encodeURIComponent(name)}`,
    }
  }
  if (boot?.modules && !boot.modules.documentos?.enabled) return null
  return floorRoute(doctype, name)
}
