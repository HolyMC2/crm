import { capturaApi } from '@/composables/useCaptura'

// The document camera's calls to the ONE books capture engine
// (doco books/shell_capture.py, D7 section). Every answer is the server's;
// permission (D9: may create the record it leads to) is decided there.

/** Base64 of a Blob/File, without the data: prefix. */
export function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** «¿Qué es?»: the scan is kept once (staged) and guessed. */
export async function classifyScan(file, { company } = {}) {
  return capturaApi('classify', {
    file_name: file.name,
    content_b64: await blobBase64(file),
    company: company || '',
  })
}

/** Capture a staged scan as the confirmed kind; returns the review (open_url). */
export function captureScan(args) {
  return capturaApi('capture_scan', args)
}

/** File a staged scan (`file`) or a new one (`blob`) on a record. */
export async function fileToRecord({
  doctype,
  name,
  file = '',
  blob = null,
  kind = '',
  company = '',
}) {
  const args = { doctype, name, kind, company }
  if (file) args.file = file
  if (blob) {
    args.file_name = blob.name
    args.content_b64 = await blobBase64(blob)
  }
  return capturaApi('file_to_record', args)
}

export function discardScan(file) {
  return capturaApi('discard_scan', { file }).catch(() => null)
}

/** Contacts or customers the worker may read, for «¿De quién es?». */
export async function searchRecords(doctype, txt) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch('/api/method/frappe.desk.search.search_link', {
    method: 'POST',
    headers,
    body: JSON.stringify({ doctype, txt: txt || '', page_length: 8 }),
  })
  if (!response.ok) return []
  const data = await response.json().catch(() => ({}))
  return (data.message || []).map((row) => ({
    value: row.value,
    label: row.label || row.description?.split(',')[0] || row.value,
    description: row.label ? row.description || '' : '',
  }))
}

// D1's documentos registry, when it is on this build: a record route in the
// shell for any doctype («never /app/…»). import.meta.glob keeps this file
// building before D1 lands; the registry loads only when a result needs it.
const registry = import.meta.glob('../../documentos/registry.js')

/** A shell location for a record, or null. */
export async function shellRoute(doctype, name, hint = null) {
  if (doctype === 'Contact')
    return { path: `/contactos/contact/${encodeURIComponent(name)}` }
  if (doctype === 'Customer')
    return { path: `/contactos/customer/${encodeURIComponent(name)}` }
  if (doctype === 'Supplier')
    return { path: `/contactos/supplier/${encodeURIComponent(name)}` }
  const load = Object.values(registry)[0]
  if (!load) return null
  try {
    const mod = await load()
    return mod.documentRoute?.(doctype, name, { hint }) || null
  } catch {
    return null
  }
}

/** Whether the documentos engine can open a new sales order («pedidos»). */
export async function newSalesOrderRoute(customer) {
  const load = Object.values(registry)[0]
  if (!load) return null
  try {
    const mod = await load()
    const entry = mod.profileBySlug?.('pedidos')
    if (!entry) return null
    return { path: '/documentos/pedidos/nuevo', query: { customer } }
  } catch {
    return null
  }
}
