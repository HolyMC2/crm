// The palette reaches what the Desk awesomebar reaches (Shell E7, DE9):
// the reports this worker may run and the Desk workspaces, as Desk rows
// (`desk`, a /app/… URL) after the shell's own places. A workspace that a
// shell module already is (Compras, Inventario…) stays out: the shell has
// the page, Desk is not the way there. Both filter the palette reach
// (utils/paletteReach), read once: they answer every keystroke from memory.
import { shellT } from '@/composables/shellKeyboard'
import { loadPaletteReach, reachMatches } from '@/utils/paletteReach'

const term = (query) => {
  if (query.kind === 'empty') return ''
  const text = String(query.text || '').trim()
  return text.length < 2 ? '' : text.slice(0, 80)
}

// The palette shows five per group; the rest of a long match is never drawn.
const REPORT_ROWS = 20

export function createDeskProviders({ modules }) {
  // The palette opens: read the reach now, so it is in by the second letter.
  loadPaletteReach()
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
      // before the many that only report on that DocType.
      const named = reachMatches(rows, search, 'named')
      const about = reachMatches(rows, search, 'about').filter(
        (row) => !named.includes(row),
      )
      return [...named, ...about].slice(0, REPORT_ROWS).map((row) => ({
        id: `reporte:${row.name}`,
        group: 'reportes',
        title: row.title || row.name,
        subtitle: [shellT('Desk'), row.ref_label].filter(Boolean).join(' · '),
        keywords: row.name,
        icon: 'lucide-bar-chart-3',
        desk: row.href,
      }))
    },
  }
  const desk = {
    key: 'desk',
    label: 'Desk',
    scopes: [],
    local: true,
    async search(query) {
      const search = term(query)
      if (!search) return []
      const rows = (await loadPaletteReach())?.workspaces || []
      const own = new Set(
        (modules.value || []).map((module) => module.label.toLowerCase()),
      )
      return reachMatches(rows, search, 'words')
        .filter(
          (row) =>
            !own.has(String(row.title || '').toLowerCase()) &&
            !own.has(String(row.label || '').toLowerCase()),
        )
        .map((row) => ({
          id: `desk:${row.name}`,
          group: 'desk',
          title: row.label || row.title || row.name,
          subtitle: shellT('Desk'),
          keywords: row.name,
          icon: 'lucide-layout-grid',
          desk: row.href,
        }))
    },
  }
  return [reportes, desk]
}
