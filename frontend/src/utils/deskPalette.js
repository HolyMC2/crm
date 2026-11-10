// The palette reaches what the Desk awesomebar reaches (Shell E7, DE9): the
// reports this worker may run, the Desk workspaces, pages and dashboards, and
// the forms only Desk opens (a single such as Books Assistant Settings, a
// tree, a virtual list), as Desk rows (`desk`, a /app/… URL) after the shell's
// own places. A workspace or page that a shell module already is (Compras,
// Inventario…) stays out: the shell has the page, Desk is not the way there.
// All of them filter the palette reach (utils/paletteReach), read once: they
// answer every keystroke from memory, the closest name first.
import { shellT } from '@/composables/shellKeyboard'
import {
  REACH_FIT,
  loadPaletteReach,
  namesIt,
  reachMatches,
  reachRanked,
} from '@/utils/paletteReach'

const term = (query) => {
  if (query.kind === 'empty') return ''
  const text = String(query.text || '').trim()
  return text.length < 2 ? '' : text.slice(0, 80)
}

// The palette shows five per group; the rest of a long match is never drawn.
const REPORT_ROWS = 20
const DESK_ROWS = 20
// «Factura de venta · Vista de reporte»: the awesomebar's «X Report», for the
// types the term names, never for every type that mentions it.
const REPORT_VIEW_ROWS = 2

// Every row here leaves the shell, and says so: «Desk · Página», «Desk · Árbol».
const subtitle = (...parts) =>
  [shellT('Desk'), ...parts].filter(Boolean).join(' · ')
// Desk's router.slug: lower case, spaces to hyphens (crm.api.shell._desk_slug).
const deskSlug = (name) => String(name).toLowerCase().replace(/ /g, '-')
// The closest first across kinds of row; at the same fit the first kind leads.
const merged = (...found) =>
  found
    .flat()
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.fit - b.fit || a.index - b.index)
// Typos are only looked for when nothing answers as typed, in any of the kinds.
const closest = (found) => {
  const typed = found.filter((entry) => entry.fit !== REACH_FIT.near)
  return typed.length ? typed : found
}

const DESK_TYPE_ICONS = {
  single: 'lucide-settings',
  tree: 'lucide-list-tree',
  list: 'lucide-list',
}

export function createDeskProviders({ modules }) {
  // The palette opens: read the reach now, so it is in by the second letter.
  loadPaletteReach()
  const ownLabels = () =>
    new Set((modules.value || []).map((module) => module.label.toLowerCase()))
  const reportes = {
    key: 'reportes',
    label: 'Reports',
    scopes: [],
    local: true,
    async search(query) {
      const search = term(query)
      if (!search) return []
      const rows = (await loadPaletteReach())?.reports || []
      // A report named by the term («Kárdex de inventario» for «kardex») comes
      // before the many that only report on that DocType, and one a slip away
      // from it («kardx») only when neither answers.
      const named = reachRanked(rows, search)
      const typed = named.filter(({ fit }) => fit !== REACH_FIT.near)
      const about = reachMatches(rows, search, 'about')
        .filter((row) => !typed.some((entry) => entry.row === row))
        .map((row) => ({ row, fit: REACH_FIT.inside }))
      const found = typed.length || about.length ? [...typed, ...about] : named
      return found.slice(0, REPORT_ROWS).map(({ row, fit }) => ({
        id: `reporte:${row.name}`,
        group: 'reportes',
        title: row.title || row.name,
        subtitle: subtitle(row.ref_label),
        keywords: row.name,
        icon: 'lucide-bar-chart-3',
        desk: row.href,
        ...(namesIt(fit, search) ? { named: true } : {}),
      }))
    },
  }
  // The report view of a list (Report Builder: group by, pick columns), the
  // awesomebar's «X Report». A provider of its own, so the named reports keep
  // their five rows.
  const vistas = {
    key: 'reporte_vistas',
    label: 'Reports',
    scopes: [],
    local: true,
    async search(query) {
      const search = term(query)
      if (!search) return []
      const rows = ((await loadPaletteReach())?.lists || []).filter(
        (row) => row.report,
      )
      return reachRanked(rows, search)
        .filter(({ fit }) => fit <= REACH_FIT.start)
        .slice(0, REPORT_VIEW_ROWS)
        .map(({ row, fit }) => ({
          id: `reporte_vista:${row.doctype}`,
          group: 'reportes',
          title: row.label,
          subtitle: subtitle(__('Report view', null, 'Palette')),
          keywords: row.doctype,
          icon: 'lucide-table-2',
          desk: `/app/${deskSlug(row.doctype)}/view/report`,
          ...(namesIt(fit, search) ? { named: true } : {}),
        }))
    },
  }
  // Places in Desk: its workspaces, its pages (Role Permissions Manager,
  // Print Format Builder) and its dashboards.
  const desk = {
    key: 'desk',
    label: 'Desk',
    scopes: [],
    local: true,
    async search(query) {
      const search = term(query)
      if (!search) return []
      const reach = await loadPaletteReach()
      const own = ownLabels()
      const outside = (...labels) =>
        !labels.some((label) => own.has(String(label || '').toLowerCase()))
      const workspaces = reachRanked(
        (reach?.workspaces || []).filter((row) =>
          outside(row.title, row.label),
        ),
        search,
      ).map(({ row, fit }) => ({
        fit,
        item: {
          id: `desk:${row.name}`,
          group: 'desk',
          title: row.label || row.title || row.name,
          subtitle: subtitle(),
          keywords: row.name,
          icon: 'lucide-layout-grid',
          desk: row.href,
        },
      }))
      // Two pages may share a title (POS Awesome): Desk lists one, so do we.
      const titles = new Set()
      const pages = reachRanked(
        (reach?.pages || []).filter((row) => outside(row.title, row.label)),
        search,
      )
        .filter(({ row }) => !titles.has(row.label) && titles.add(row.label))
        .map(({ row, fit }) => ({
          fit,
          item: {
            id: `pagina:${row.name}`,
            group: 'desk',
            title: row.label,
            subtitle: subtitle(__('Page', null, 'Palette')),
            keywords: row.name,
            icon: 'lucide-app-window',
            desk: row.href,
          },
        }))
      const dashboards = reachRanked(reach?.dashboards || [], search).map(
        ({ row, fit }) => ({
          fit,
          item: {
            id: `tablero:${row.name}`,
            group: 'desk',
            title: row.label,
            subtitle: subtitle(__('Dashboard', null, 'Palette')),
            keywords: row.name,
            icon: 'lucide-layout-dashboard',
            desk: row.href,
          },
        }),
      )
      return closest(merged(workspaces, pages, dashboards))
        .slice(0, DESK_ROWS)
        .map(({ item, fit }) => ({
          ...item,
          ...(namesIt(fit, search) ? { named: true } : {}),
        }))
    },
  }
  // Forms only Desk opens, as the awesomebar offers them: a single (Books
  // Assistant Settings, Stock Settings), a tree (Warehouse) and a virtual
  // type's list (RQ Job). A provider of its own, so five settings never push
  // the workspaces out of the Desk group.
  const formularios = {
    key: 'desk_tipos',
    label: 'Desk',
    scopes: [],
    local: true,
    async search(query) {
      const search = term(query)
      if (!search) return []
      const rows = (await loadPaletteReach())?.deskTypes || []
      return reachRanked(rows, search)
        .slice(0, DESK_ROWS)
        .map(({ row, fit }) => ({
          id: `desk_tipo:${row.kind}:${row.doctype}`,
          group: 'desk',
          title: row.label,
          subtitle: subtitle(
            row.kind === 'tree' ? __('Tree', null, 'Palette') : row.module,
          ),
          keywords: row.doctype,
          icon: DESK_TYPE_ICONS[row.kind] || 'lucide-settings',
          desk: row.href,
          ...(namesIt(fit, search) ? { named: true } : {}),
        }))
    },
  }
  return [reportes, desk, vistas, formularios]
}
