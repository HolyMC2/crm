// List export: the columns on screen, with the list's own filters and order.
//
// `crm.api.list_export.export_list` resolves the same filter tokens and fills
// the virtual (`_v_*`) columns get_data shows. Until a site runs a crm build
// that has it, the list falls back to Frappe's report export with the native
// columns only, so the Export button keeps working either way.
import { isVirtualKey } from './listColumns'

export const EXPORT_METHOD = 'crm.api.list_export.export_list'
export const LEGACY_EXPORT_METHOD = 'frappe.desk.reportview.export_query'

function isEmpty(value) {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * The export_list arguments for the list as it is on screen.
 * `selectedItems` only applies when not exporting everything.
 */
export function buildExportParams({
  doctype,
  columns = [],
  defaultFilters = {},
  filters = {},
  orFilters = {},
  orderBy = '',
  pageLength = 20,
  totalCount = 0,
  exportAll = false,
  fileFormat = 'Excel',
  selectedItems = [],
  view = '',
}) {
  const params = {
    doctype,
    fields: columns.map((column) => column.key).filter(Boolean),
    filters: { ...(defaultFilters || {}), ...(filters || {}) },
    order_by: orderBy || 'modified desc',
    page_length: exportAll ? totalCount || pageLength : pageLength,
    file_format: fileFormat === 'CSV' ? 'CSV' : 'Excel',
  }
  if (!isEmpty(orFilters)) params.or_filters = orFilters
  if (!exportAll && selectedItems?.length) {
    params.selected_items = [...selectedItems]
  }
  if (view) params.view = view
  return params
}

function query(pairs) {
  return pairs
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(
          typeof value === 'string' || typeof value === 'number'
            ? value
            : JSON.stringify(value),
        )}`,
    )
    .join('&')
}

export function exportListUrl(params) {
  return `/api/method/${EXPORT_METHOD}?${query(Object.entries(params))}`
}

/** Frappe's report export: native columns only, it cannot compute `_v_*`. */
export function legacyExportUrl(params) {
  return (
    `/api/method/${LEGACY_EXPORT_METHOD}?` +
    query([
      ['file_format_type', params.file_format],
      ['title', params.doctype],
      ['doctype', params.doctype],
      ['fields', params.fields.filter((key) => !isVirtualKey(key))],
      ['filters', params.filters],
      ['order_by', params.order_by],
      ['page_length', params.page_length],
      ['start', 0],
      ['view', 'Report'],
      ['with_comment_count', 1],
      ['selected_items', params.selected_items],
    ])
  )
}

/**
 * Whether a failed export_list answer means «this site has no export_list»
 * (fall back) rather than a real refusal such as a permission error (report).
 */
export function shouldFallbackToLegacyExport(status, body = '') {
  if (status === 404) return true
  const text = typeof body === 'string' ? body : JSON.stringify(body || '')
  return /Failed to get method|No module named|has no attribute|ModuleNotFoundError|DoesNotExistError/.test(
    text,
  )
}

/** The file name from a Content-Disposition header, else the fallback. */
export function filenameFromDisposition(header, fallback) {
  const value = String(header || '')
  const star = value.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* a malformed encoded name falls through to the plain one */
    }
  }
  const plain = value.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : fallback
}

/**
 * Download the export: export_list when the site has it, else the legacy URL.
 * `fetchImpl` and `navigate` are injectable for tests.
 */
export async function downloadListExport(
  params,
  {
    fetchImpl = globalThis.fetch?.bind(globalThis),
    navigate = (url) => (window.location.href = url),
    saveBlob = saveBlobToDisk,
  } = {},
) {
  const url = exportListUrl(params)
  let response
  try {
    response = await fetchImpl(url, {
      credentials: 'same-origin',
      headers: { Accept: '*/*' },
    })
  } catch {
    navigate(legacyExportUrl(params))
    return 'legacy'
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (shouldFallbackToLegacyExport(response.status, body)) {
      navigate(legacyExportUrl(params))
      return 'legacy'
    }
    const error = new Error(`export failed (${response.status})`)
    error.status = response.status
    error.body = body
    throw error
  }
  const ext = params.file_format === 'CSV' ? 'csv' : 'xlsx'
  const name = filenameFromDisposition(
    response.headers?.get?.('Content-Disposition'),
    `${params.doctype}.${ext}`,
  )
  saveBlob(await response.blob(), name)
  return 'export_list'
}

function saveBlobToDisk(blob, name) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
