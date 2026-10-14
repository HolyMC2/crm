import { can, moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { TITLE, manualApi } from '@/composables/useManual'

// ⌘K provider for Manual de la tienda: the articles this person may read
// (the server search applies every permission), its categories under «Ir a»
// and «Nuevo artículo» for the people who write it.
const PER_GROUP = 5

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}
const has = (text, ...values) =>
  values.some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(text.toLowerCase()),
  )

export function createManualProvider({ boot, api = manualApi }) {
  return {
    key: 'manual',
    label: TITLE,
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'manual'))
        return []
      const items = []
      const title = tr('New article in the shop manual')
      if (
        can(boot.value, 'manual', 'write') &&
        has(query.text, title, 'nuevo artículo manual de la tienda')
      )
        items.push({
          id: 'manual.new',
          group: 'acciones',
          title,
          icon: 'lucide-file-plus',
          href: '/manual/nuevo',
        })
      let page
      try {
        page = await api('list_articles', {
          q: query.text,
          limit: PER_GROUP + 1,
        })
      } catch {
        return items
      }
      if (signal?.aborted) return []
      const rows = page?.rows || []
      for (const row of rows.slice(0, PER_GROUP))
        items.push({
          id: `manual:${row.name}`,
          group: 'registros',
          title: row.title || row.name,
          subtitle: [row.category, TITLE].filter(Boolean).join(' · '),
          icon: 'lucide-book-open',
          href: `/manual/${encodeURIComponent(row.name)}`,
        })
      if (rows.length)
        items.push({
          id: 'manual.all',
          group: 'ir_a',
          title: tr('See all in the shop manual: «{0}»', [query.text]),
          icon: 'lucide-book-open',
          href: `/manual?q=${encodeURIComponent(query.text)}`,
        })
      for (const category of page?.categories || [])
        if (has(query.text, category))
          items.push({
            id: `manual.categoria.${category}`,
            group: 'ir_a',
            title: `${TITLE} › ${category}`,
            icon: 'lucide-book-open',
            href: `/manual?categoria=${encodeURIComponent(category)}`,
          })
      return items
    },
  }
}
