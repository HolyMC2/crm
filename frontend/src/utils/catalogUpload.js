// Surtido: a supplier catalog dropped on the page uploads in place, on the
// chunked protocol of doco's «catalogo_subir» page
// (doco.docoutils.books.catalogs.uploads: initiate → PUT each part → complete).
// The session token comes from new_catalog / upload_link; the server owns the
// quota, the verification and the attachment, then indexes the file in the
// background. A part goes to object storage (presigned) or to the site itself.
import { comprasApi } from '@/composables/useCompras'

const API = 'doco.docoutils.books.catalogs.uploads.'
const PART_TIMEOUT_MS = 10 * 60 * 1000

/** The kinds the catalog index reads (PDF and spreadsheets). */
export const CATALOG_ACCEPT = '.pdf,.xlsx,.xls,.ods,.csv'

const MIME = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
}

/** The session token inside an upload link (`/catalogo_subir?t=…`). */
export function tokenOf(link) {
  try {
    return new URL(link, 'https://site.invalid').searchParams.get('t') || ''
  } catch {
    return ''
  }
}

/** A phone may send a file without its type: the extension says it. */
export function mimeOf(file) {
  const ext = String(file?.name || '')
    .split('.')
    .pop()
    .toLowerCase()
  return file?.type || MIME[ext] || 'application/octet-stream'
}

/** Each part the server asked for, with its byte range in the file. */
export function partRanges(session, size) {
  return (session?.parts || []).map((part) => {
    const start = (part.n - 1) * session.part_size
    return { ...part, start, end: Math.min(start + session.part_size, size) }
  })
}

const RECEIVE_PART = `/api/method/${API}receive_part`

/** Where a part goes: the site's own part endpoint on this page's origin (its
 *  signed query names no host, and the site's configured host is another origin
 *  when the page is open on another of the site's domains); object storage as
 *  presigned. */
export function partTarget(url, origin = location.origin) {
  const target = new URL(url, origin)
  return target.pathname === RECEIVE_PART
    ? origin + target.pathname + target.search
    : target.href
}

/** An upload failure the page words: `part` (a part was refused) or `network`. */
function failure(code) {
  const error = new Error(code)
  error.uploadFailure = code
  return error
}

/** PUT one part; resolves with its ETag (the header, or the site's JSON). */
export function putPart(url, bytes, onLoaded = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const target = partTarget(url)
    xhr.open('PUT', target)
    xhr.timeout = PART_TIMEOUT_MS
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    const sameSite = new URL(target).origin === location.origin
    if (
      sameSite &&
      window.csrf_token &&
      window.csrf_token !== '{{ csrf_token }}'
    )
      xhr.setRequestHeader('X-Frappe-CSRF-Token', window.csrf_token)
    xhr.upload.onprogress = (event) => onLoaded(event.loaded)
    xhr.onload = () => {
      let etag = xhr.getResponseHeader('ETag') || ''
      if (!etag)
        try {
          etag = JSON.parse(xhr.responseText).message.etag || ''
        } catch {
          etag = ''
        }
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag)
      else reject(failure('part'))
    }
    xhr.onerror = xhr.ontimeout = () => reject(failure('network'))
    xhr.send(bytes)
  })
}

/** Upload `file` on the session of `link`; `onProgress` gets 0–100. */
export async function uploadCatalog(
  link,
  file,
  { onProgress = () => {}, api = comprasApi, put = putPart } = {},
) {
  const token = tokenOf(link)
  if (!token) throw failure('part')
  const session = await api(API + 'initiate', {
    token,
    size: file.size,
    mime: mimeOf(file),
  })
  const parts = []
  let done = 0
  for (const part of partRanges(session, file.size)) {
    const bytes = file.slice(part.start, part.end)
    const etag = await put(part.url, bytes, (loaded) =>
      onProgress(Math.min(99, Math.round((100 * (done + loaded)) / file.size))),
    )
    parts.push({ n: part.n, etag })
    done += bytes.size
  }
  await api(API + 'complete', { token, parts })
  onProgress(100)
}
