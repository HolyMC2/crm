// Surtido: a supplier catalog dropped on the page uploads in place, on the
// chunked protocol of doco's «catalogo_subir» page
// (doco.docoutils.books.catalogs.uploads: initiate → PUT each part → complete).
// The session token comes from new_catalog / upload_link; the server owns the
// quota, the verification and the attachment, then indexes the file in the
// background. A part goes to object storage (presigned) or to the site itself.
import { comprasApi } from '@/composables/useCompras'
import { callError } from '@/utils/contactos'

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
    if (new URL(target).origin === location.origin)
      for (const [name, value] of Object.entries(csrfHeader()))
        xhr.setRequestHeader(name, value)
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

/** Upload `file` on the session of `link`; `onProgress` gets 0–100. With
 *  `more`, the server waits for the drop's other pictures (`addPicture`, then
 *  `indexPictures`) before reading the list. */
export async function uploadCatalog(
  link,
  file,
  { onProgress = () => {}, api = comprasApi, put = putPart, more = false } = {},
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
  await api(
    API + 'complete',
    more ? { token, parts, more: 1 } : { token, parts },
  )
  onProgress(100)
}

function csrfHeader() {
  return window.csrf_token && window.csrf_token !== '{{ csrf_token }}'
    ? { 'X-Frappe-CSRF-Token': window.csrf_token }
    : {}
}

/** The same request with its progress: fetch cannot report an upload's. */
function postWithProgress(url, body, headers, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    for (const [name, value] of Object.entries(headers))
      xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(99, Math.round((100 * event.loaded) / event.total)))
    }
    xhr.onerror = xhr.ontimeout = () => resolve(null)
    xhr.onload = () => {
      let data
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = {}
      }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      })
    }
    xhr.send(body)
  })
}

/**
 * POST one file as multipart to a doco method (`add_picture`, `set_photo`,
 * `add_photo`). With `onProgress` (0–100) the upload reports how far it is.
 * A refusal rejects with the server's sentence in `messages`; a request that
 * never arrived rejects with `offline`.
 */
export async function postPicture(
  method,
  args,
  file,
  { fetcher = fetch, onProgress = null } = {},
) {
  const body = new FormData()
  body.append('file', file, file.name || 'foto.jpg')
  const headers = { Accept: 'application/json', ...csrfHeader() }
  const url = `/api/method/${method}?${new URLSearchParams(args).toString()}`
  let answer
  if (onProgress)
    answer = await postWithProgress(url, body, headers, onProgress)
  else {
    const response = await fetcher(url, { method: 'POST', headers, body })
    answer = {
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => ({})),
    }
  }
  if (!answer) {
    const error = new Error(method)
    error.offline = true
    error.messages = []
    throw error
  }
  if (!answer.ok) throw callError(method, answer.status, answer.data)
  onProgress?.(100)
  return answer.data.message
}

/** One more picture of a list already created. */
export function addPicture(catalog, file, options) {
  return postPicture(API + 'add_picture', { catalogo: catalog }, file, options)
}

/** More pictures of a list that already has its first: each one, then the
 *  read. `onProgress(done, total)`. */
export async function addPictures(
  catalog,
  files,
  { onProgress = () => {}, api = comprasApi, post = postPicture } = {},
) {
  let done = 0
  for (const file of files) {
    await post(API + 'add_picture', { catalogo: catalog }, file)
    done += 1
    onProgress(done, files.length)
  }
  if (done) await api(API + 'index_now', { catalogo: catalog })
}

/** The whole drop: the first picture through the upload session (the list's
 *  file), the rest as extra pictures, then the read. `onProgress(done, total)`. */
export async function uploadPictures(
  link,
  catalog,
  files,
  {
    onProgress = () => {},
    api = comprasApi,
    put = putPart,
    post = postPicture,
  } = {},
) {
  const [first, ...rest] = files
  const total = files.length
  await uploadCatalog(link, first, {
    api,
    put,
    more: rest.length > 0,
    onProgress: (pct) => onProgress(pct / 100, total),
  })
  let done = 1
  for (const file of rest) {
    await post(API + 'add_picture', { catalogo: catalog }, file)
    done += 1
    onProgress(done, total)
  }
  if (rest.length) await api(API + 'index_now', { catalogo: catalog })
}

/**
 * Lists dropped together, one after the other (a supplier that sends one list
 * per line of product): `send(file)` resolves false to stop at a problem, so
 * the worker sees it before the rest go; `onStep` gets {at, of} before each
 * file of a batch, null for a single file and once the batch ends. Resolves
 * how many were sent.
 */
export async function sendEach(files, send, onStep = () => {}) {
  let sent = 0
  try {
    for (const [i, file] of files.entries()) {
      onStep(files.length > 1 ? { at: i + 1, of: files.length } : null)
      if ((await send(file)) === false) break
      sent += 1
    }
  } finally {
    onStep(null)
  }
  return sent
}
