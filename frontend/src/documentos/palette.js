// Palette entries of Documentos and Inventario (Shell SPEC §6): the `#`
// documents provider (a number or a party name → records) and the places of
// the hubs and each readable list.
import { call } from 'frappe-ui'
import { moduleEnabled, normalizeSearch } from '@/vendor/muelle-shell/contracts'
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
  profileFor,
  readableDoctypes,
} from './registry'
import {
  REACH_FIT,
  loadPaletteReach,
  namesIt,
  reachRanked,
} from '@/utils/paletteReach'

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
  for (const entry of PROFILES) {
    if (!readable.has(entry.doctype)) continue
    const module = entry.base === '/inventario' ? 'Inventario' : 'Documentos'
    items.push({
      id: `documentos.${entry.slug}`,
      group: 'ir_a',
      title: `${module} › ${entry.label}`,
      keywords: [kindLabel(entry.doctype), entry.doctype, entry.hint]
        .filter(Boolean)
        .join(' '),
      icon: entry.icon,
      href: listRoute(entry).path,
    })
  }
  return items
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
      const lists = ((await loadPaletteReach())?.lists || []).filter(
        (row) => !profileFor(row.doctype),
      )
      // A type called «New …» is still a list: the create word counts only
      // when the words after it find one.
      const wanted = createTerm(text)
      const asked = wanted.length >= 2 ? reachRanked(lists, wanted) : []
      const term = asked.length ? wanted : text
      const found = asked.length ? asked : reachRanked(lists, text)
      const items = []
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
