// The palette reaches what the Desk awesomebar reaches (Shell E7, DE9):
// the reports this worker may run and the Desk workspaces, as Desk rows
// (`desk`, a /app/… URL) after the shell's own places. A workspace that a
// shell module already is (Compras, Inventario…) stays out: the shell has
// the page, Desk is not the way there.
import { call } from 'frappe-ui'
import { shellT } from '@/composables/shellKeyboard'

const term = (query) => {
  if (query.kind === 'empty') return ''
  const text = String(query.text || '').trim()
  return text.length < 2 ? '' : text.slice(0, 80)
}

export function createDeskProviders({ modules }) {
  const reportes = {
    key: 'reportes',
    label: 'Reports',
    scopes: [],
    async search(query, signal) {
      const search = term(query)
      if (!search) return []
      const rows = await call('crm.api.shell.reports', { search })
      if (signal?.aborted) return []
      return (rows || []).map((row) => ({
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
    async search(query, signal) {
      const search = term(query)
      if (!search) return []
      const rows = await call('crm.api.shell.workspaces', { search })
      if (signal?.aborted) return []
      const own = new Set(
        (modules.value || []).map((module) => module.label.toLowerCase()),
      )
      return (rows || [])
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
