// Palette entries of Documentos and Inventario (Shell SPEC §6): the `#`
// documents provider (a number or a party name → records) and the places of
// the hubs and each readable list.
import { call } from 'frappe-ui'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
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
import { docApi } from './api'

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

/**
 * «Listas» (Shell E7, DE9): every DocType this worker reads, by its Spanish
 * label or English name, on the generic floor; «Crear <label>» where the
 * worker may create one. The curated lists are already places (above).
 */
export function createTiposProvider({ boot }) {
  return {
    key: 'tipos',
    label: 'Lists',
    scopes: ['documents'],
    async search(query, signal) {
      if (query.kind === 'empty' || !moduleEnabled(boot.value, 'documentos'))
        return []
      const text = String(query.text || '').trim()
      if (text.length < 2) return []
      const rows = await docApi('doctypes', { search: text.slice(0, 80) })
      if (signal?.aborted) return []
      const items = []
      for (const row of rows || []) {
        if (profileFor(row.doctype)) continue
        const floor = floorRoute(row.doctype).path
        items.push({
          id: `tipos:${row.doctype}`,
          group: 'listas',
          title: row.label,
          subtitle: row.module,
          keywords: row.doctype,
          icon: 'lucide-list',
          href: floor,
        })
        if (row.create)
          items.push({
            id: `tipos:${row.doctype}:nuevo`,
            group: 'acciones',
            title: __('Create {0}', [row.label]),
            keywords: row.doctype,
            icon: 'lucide-plus',
            href: `${floor}/nuevo`,
          })
      }
      return items
    },
  }
}
