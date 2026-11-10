// Palette entries of Documentos and Inventario (Shell SPEC §6): the `#`
// documents provider (a number or a party name → records) and the places of
// the hubs and each readable list.
import { call } from 'frappe-ui'
import {
  matchTokens,
  moduleEnabled,
  normalizeSearch,
} from '@/vendor/muelle-shell/contracts'
import {
  formatDate,
  formatMoney,
  kindLabel,
  looksLikeId,
  statusLabel,
} from '@/utils/display'
import {
  PROFILES,
  documentRoute,
  floorRoute,
  listRoute,
  profileBySlug,
  profileFor,
  readableDoctypes,
} from './registry'
import {
  REACH_FIT,
  loadPaletteReach,
  named,
  namesIt,
  reachRanked,
  reachRankedAs,
} from '@/utils/paletteReach'
import { calculate } from '@/utils/paletteCalc'

/** One palette row for a found document: party first, kind · number · date as the line. */
export function documentItem(row, boot) {
  const kind = kindLabel(row.doctype) || row.doctype
  const title = row.title && !looksLikeId(row.title) ? row.title : kind
  const route = documentRoute(row.doctype, row.name, { boot, hint: row.fields })
  return {
    id: `documentos:${row.doctype}:${row.name}`,
    group: 'registros',
    title,
    subtitle: [
      title === kind ? '' : kind,
      row.name,
      row.status ? statusLabel(row.status) : '',
      row.amount != null
        ? formatMoney(row.amount, row.currency || 'MXN')
        : formatDate(row.date),
    ]
      .filter(Boolean)
      .join(' · '),
    icon:
      PROFILES.find((p) => p.doctype === row.doctype)?.icon ||
      'lucide-file-text',
    href: route?.path,
    record: { doctype: row.doctype, name: row.name },
  }
}

// Desk's router.slug: lower case, spaces to hyphens (crm.api.shell._desk_slug).
const deskSlug = (name) => String(name).toLowerCase().replace(/ /g, '-')

/**
 * A record of any type as a palette row: its title, then «Tipo · número ·
 * estado». It opens where the shell has it (its curated record, its richer
 * page, the generic floor); a worker without Documentos gets its Desk form.
 */
export function recordItem(row, boot, note = '') {
  const kind = row.label || kindLabel(row.doctype) || row.doctype
  // Its title; else its name when that reads as one («Caja Tienda - GD»); else its type.
  const title =
    [row.title, row.name].find((text) => text && !looksLikeId(text)) || kind
  const route = documentRoute(row.doctype, row.name, { boot })
  return {
    id: `registro:${row.doctype}:${row.name}`,
    group: 'registros',
    title,
    subtitle: [
      title === kind ? '' : kind,
      row.name === title ? '' : row.name,
      row.status ? statusLabel(row.status) : '',
      note,
    ]
      .filter(Boolean)
      .join(' · '),
    icon: 'lucide-file-text',
    ...(route
      ? {
          href: route.path,
          record: { doctype: row.doctype, name: row.name },
        }
      : {
          desk: `/app/${deskSlug(row.doctype)}/${encodeURIComponent(row.name)}`,
        }),
  }
}

/**
 * Records of every other type (an employee, a task, a project, a warehouse):
 * what the awesomebar's «Search for X» finds in Frappe's global search, minus
 * the types the providers above already search. The server reads each row
 * again under the worker's permissions.
 */
export function createOtrosProvider({ boot }) {
  return {
    key: 'otros',
    label: 'Records',
    scopes: ['people', 'documents'],
    async search(query, signal) {
      if (query.kind !== 'text') return []
      const text = String(query.text || '').trim()
      // The index keeps words of three letters or more; a sum is not a search.
      if (text.length < 3 || calculate(text) !== null) return []
      const rows = await call('crm.api.shell.search_records', {
        q: text.slice(0, 80),
      })
      if (signal?.aborted) return []
      return (rows || []).map((row) => recordItem(row, boot.value))
    },
  }
}

// «#urgente»: the documents of the two closest tags at most.
const TAGS_ASKED = 2

/**
 * «#etiqueta» (the awesomebar's tag search): the documents that carry the
 * tag the term names. The tags come with the palette reach, so a site
 * without tags never asks the server; only the `#` prefix reaches this.
 */
export function createEtiquetasProvider({ boot }) {
  return {
    key: 'etiquetas',
    label: 'Tags',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.scope !== 'documents' || query.kind === 'empty') return []
      const text = String(query.text || '')
        .trim()
        .slice(0, 80)
      if (text.length < 2) return []
      const tags = (await loadPaletteReach())?.tags || []
      const asked = reachRanked(tags, text)
        .filter(({ fit }) => fit <= REACH_FIT.inside)
        .slice(0, TAGS_ASKED)
      if (!asked.length) return []
      const found = await Promise.all(
        asked.map(async ({ row }) => {
          const rows = await call('crm.api.shell.tagged', { tag: row.tag })
          return (rows || []).map((doc) =>
            recordItem(doc, boot.value, `#${row.tag}`),
          )
        }),
      )
      if (signal?.aborted) return []
      const seen = new Set()
      return found
        .flat()
        .filter((item) => !seen.has(item.id) && seen.add(item.id))
    },
  }
}

export function createDocumentosProvider({ boot }) {
  return {
    key: 'documentos',
    label: 'Documentos',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty') return []
      if (
        !moduleEnabled(boot.value, 'documentos') &&
        !moduleEnabled(boot.value, 'inventario')
      )
        return []
      const text = String(query.text || '').trim()
      if (text.length < 2) return []
      const rows = await call('crm.api.documentos.search', {
        q: text.slice(0, 80),
      })
      if (signal?.aborted) return []
      return (rows || []).map((row) => documentItem(row, boot.value))
    },
  }
}

/** «Documentos», «Documentos › Facturas»…: the hub and every list this worker reads. */
export function documentosPlaces(boot) {
  const items = []
  const readable = readableDoctypes(boot) || new Set()
  for (const key of ['documentos', 'inventario']) {
    if (!moduleEnabled(boot, key)) continue
    const module = key === 'documentos' ? 'Documentos' : 'Inventario'
    items.push({
      id: `${key}.hub`,
      group: 'ir_a',
      title: module,
      keywords:
        key === 'documentos'
          ? 'documentos ventas compras pagos facturas'
          : 'inventario almacen existencias',
      icon: key === 'documentos' ? 'lucide-file-text' : 'lucide-package-open',
      href: `/${key}`,
    })
  }
  if (moduleEnabled(boot, 'inventario'))
    items.push({
      id: 'inventario.movimientos',
      group: 'ir_a',
      title: 'Inventario › Movimientos',
      keywords: 'kardex movimientos existencias stock ledger',
      icon: 'lucide-history',
      href: '/inventario/movimientos',
    })
  for (const entry of PROFILES)
    if (readable.has(entry.doctype)) items.push(listPlace(entry))
  return items
}

/** A curated list as a place: «Documentos › Facturas». */
function listPlace(entry) {
  const module = entry.base === '/inventario' ? 'Inventario' : 'Documentos'
  return {
    id: `documentos.${entry.slug}`,
    group: 'ir_a',
    title: `${module} › ${entry.label}`,
    keywords: [kindLabel(entry.doctype), entry.doctype, entry.hint]
      .filter(Boolean)
      .join(' '),
    icon: entry.icon,
    href: listRoute(entry).path,
  }
}

// Case- and accent-insensitive words, space-bounded («Pronóstico de ventas» → ' pronostico de ventas').
const words = (value) =>
  ` ${String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`
/** The term starts a word of a value («ventas» in «Socio de ventas», not «venta» in «Preventa»). */
const startsAWord = (term, ...values) =>
  values.some((value) => words(value).includes(words(term)))

// «Crear X» rows per query (E7b): generic fan-out, so a few at most.
const CREATE_CAP = 3
// The matching types a query weighs, as many as the server's search answers (60).
const LIST_ROWS = 60
// «nuevo almacén», «new warehouse», «crear tarea»: a first word that asks to
// create, as the awesomebar's «New X».
const CREATE_WORDS = new Set(['new', 'nuevo', 'nueva', 'crear', 'create'])

/** The words after a create word («nuevo almacén» → «almacén»), or '' when the query asks for none. */
export function createTerm(text) {
  const [first, ...rest] = String(text || '')
    .trim()
    .split(/\s+/)
  return rest.length && CREATE_WORDS.has(normalizeSearch(first))
    ? rest.join(' ')
    : ''
}

// «juan en clientes», «bateria in item»: the awesomebar's «Find X in Y».
const FIND_IN = /^(.+)\s+(?:in|en)\s+(.{2,})$/i

/** «X en Y» as { what, where }, or null. The last «en» divides: «funda en uso en clientes». */
export function findIn(text) {
  const match = FIND_IN.exec(String(text || '').trim())
  return match ? { what: match[1].trim(), where: match[2].trim() } : null
}

/** «Buscar «X» en <lista>»: the list, opened on that search. */
export const findItem = (what, label, path, id, rank) => ({
  id,
  group: 'acciones',
  title: __('Find «{0}» in {1}', [what, label]),
  icon: 'lucide-search',
  href: `${path}${path.includes('?') ? '&' : '?'}q=${encodeURIComponent(what)}`,
  rank,
})

/**
 * The lists of Documentos a «buscar X en Y» can name, each ready for
 * reachRanked: the curated ones by their shell label («Facturas»), their
 * kind, their type's label («Factura de venta») and their DocType, then
 * every other readable type on the generic floor. `owned` are the types another place of the shell lists (Contactos
 * has the customers): they are left to it.
 */
export function listsToSearch(boot, lists, owned = new Set()) {
  const readable = readableDoctypes(boot) || new Set()
  const labels = new Map(lists.map((row) => [row.doctype, row.label]))
  const curated = PROFILES.filter((entry) => readable.has(entry.doctype)).map(
    (entry) =>
      named(
        {
          id: `buscar:${entry.slug}`,
          label: entry.label,
          path: listRoute(entry).path,
        },
        entry.label,
        kindLabel(entry.doctype),
        labels.get(entry.doctype),
        entry.doctype,
      ),
  )
  const floor = moduleEnabled(boot, 'documentos')
    ? lists
        .filter((row) => !profileFor(row.doctype) && !owned.has(row.doctype))
        .map((row) => ({
          ...row,
          id: `buscar:${row.doctype}`,
          path: floorRoute(row.doctype).path,
        }))
    : []
  return [...curated, ...floor]
}

/** The list the worker is on («Facturas», a type's floor), by the address bar; null elsewhere. */
function listOnScreen(lists) {
  const path = globalThis.location?.pathname || ''
  const floor = /\/crm\/documentos\/tipo\/([^/]+)\/?$/.exec(path)
  if (floor) {
    let doctype = ''
    try {
      doctype = decodeURIComponent(floor[1])
    } catch {
      return null
    }
    const row = lists.find((list) => list.doctype === doctype)
    return row ? { label: row.label, path: floorRoute(doctype).path } : null
  }
  const curated = /\/crm\/(documentos|inventario)\/([^/]+)\/?$/.exec(path)
  const entry = curated && profileBySlug(curated[2], `/${curated[1]}`)
  return entry ? { label: entry.label, path: listRoute(entry).path } : null
}

/**
 * «Listas» (Shell E7, DE9): every DocType this worker reads, by its Spanish
 * label or English name, on the generic floor, the closest name first
 * (reachRanked): «employee» lists Employee before the types that mention it.
 * «Crear <label>» where the worker may create one, at most CREATE_CAP of them
 * and only where the term starts a word of the label or the name (the list
 * matches any substring). Those rows are generic fan-out (rank 2,
 * utils/shellPalette PALETTE_RANK): a shell place matching the term renders
 * above them, and so does the list the term names (`named`: «almacén»,
 * «wareh»). A term no list answers still finds the one a slip away
 * («warehuose»), without its «Crear». «nuevo almacén» asks to create: the
 * rest of the term finds the lists, and «Crear Almacén» is an action of its
 * own (rank 1) for the closest of them, so it leads; a worker who may not
 * create one still gets the list. The curated lists are already places
 * (above). The types come from the palette reach, read once
 * (utils/paletteReach): a keystroke filters them here.
 *
 * As the awesomebar: «customer list» is the Customer list (a last word that
 * names the kind), and on a list the term can be searched right there.
 */
export function createTiposProvider({ boot }) {
  return {
    key: 'tipos',
    label: 'Lists',
    scopes: ['documents'],
    local: true,
    async search(query) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'documentos'))
        return []
      const text = String(query.text || '')
        .trim()
        .slice(0, 80)
      if (text.length < 2) return []
      const all = (await loadPaletteReach())?.lists || []
      const lists = all.filter((row) => !profileFor(row.doctype))
      const readable = readableDoctypes(boot.value) || new Set()
      // A type called «New …» is still a list: the create word counts only
      // when the words after it find one.
      const wanted = createTerm(text)
      const asked = wanted.length >= 2 ? reachRanked(lists, wanted) : []
      const byKind = asked.length ? null : reachRankedAs(lists, text, 'list')
      const term = asked.length ? wanted : byKind.term
      const found = asked.length ? asked : byKind.found
      const items = []
      // A curated list is a place («Documentos › Facturas», above), found by
      // the shell's rule. Where that rule misses and this one finds it (an
      // abbreviation, initials, a slip: «slsinv», «si»), the place is a row here.
      const curated = all.filter(
        (row) => profileFor(row.doctype) && readable.has(row.doctype),
      )
      for (const { row } of reachRanked(curated, term))
        for (const entry of PROFILES.filter((e) => e.doctype === row.doctype)) {
          const place = listPlace(entry)
          if (!matchTokens(term, place.title, place.keywords)) items.push(place)
        }
      const here = listOnScreen(all)
      if (here)
        items.push(findItem(text, here.label, here.path, 'buscar.aqui', 2))
      let creates = 0
      for (const { row, fit } of found.slice(0, LIST_ROWS)) {
        const near = fit === REACH_FIT.near
        items.push({
          id: `tipos:${row.doctype}`,
          group: 'listas',
          title: row.label,
          subtitle: row.module,
          keywords: row.doctype,
          icon: 'lucide-list',
          href: floorRoute(row.doctype).path,
          ...(namesIt(fit, term) ? { named: true } : {}),
        })
        if (
          row.create &&
          !near &&
          creates < CREATE_CAP &&
          startsAWord(term, row.label, row.doctype)
        ) {
          creates += 1
          // Asked for by name («nuevo almacén»): the closest lists' «Crear» leads.
          const leads = asked.length && fit === found[0].fit
          items.push({ ...createItem(row), rank: leads ? 1 : 2 })
        }
      }
      return items
    },
  }
}

const createItem = (row) => ({
  id: `tipos:${row.doctype}:nuevo`,
  group: 'acciones',
  title: __('Create {0}', [row.label]),
  keywords: row.doctype,
  icon: 'lucide-plus',
  href: `${floorRoute(row.doctype).path}/nuevo`,
})
