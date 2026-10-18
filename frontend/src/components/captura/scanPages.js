// The document camera's light processing (Shell D7, SPEC DD14): crop a shot to
// the page, downscale each page to a JPEG of at most 2 MB, and bind several
// pages into ONE PDF the books capture engine reads (it renders up to 8 PDF
// pages for the vision tier, so the sheet stops at 8). No library: a PDF of
// JPEG pages is a few objects and a cross-reference table.

export const MAX_PAGES = 8
export const PAGE_MAX_BYTES = 2 * 1024 * 1024
// The engine refuses files over 10 MB; keep the bound PDF under it.
export const TOTAL_MAX_BYTES = 9 * 1024 * 1024
export const MAX_SIDE = 2200

/** Bytes budget for each page when `count` pages are bound together. */
export function pageBudget(count) {
  return Math.min(
    PAGE_MAX_BYTES,
    Math.floor(TOTAL_MAX_BYTES / Math.max(1, count)),
  )
}

/** The size that fits `w×h` inside `max` on its long side (never upscales). */
export function fitSize(w, h, max = MAX_SIDE) {
  const long = Math.max(w, h)
  if (!long || long <= max) return { width: w, height: h }
  const k = max / long
  return { width: Math.round(w * k), height: Math.round(h * k) }
}

/**
 * Otsu's threshold of a luminance histogram (256 bins): the cut that best
 * separates paper from the table under it.
 */
export function otsu(histogram) {
  let total = 0
  let sum = 0
  for (let i = 0; i < 256; i++) {
    total += histogram[i]
    sum += i * histogram[i]
  }
  let background = 0
  let sumB = 0
  let best = 0
  let cut = 127
  for (let t = 0; t < 256; t++) {
    background += histogram[t]
    if (!background) continue
    const foreground = total - background
    if (!foreground) break
    sumB += t * histogram[t]
    const meanB = sumB / background
    const meanF = (sum - sumB) / foreground
    const between = background * foreground * (meanB - meanF) ** 2
    if (between > best) {
      best = between
      cut = t
    }
  }
  return cut
}

/**
 * The page's box in a small RGBA frame (`data` of `w×h`), as fractions of the
 * frame, or null when no clear page stands out (then the whole shot is kept).
 * The page is the bright side of Otsu's cut; rows and columns count as page
 * when more than a fifth of their pixels are, so text and shadows don't break
 * the box. A box under 15% or over 96% of the frame is no crop.
 */
export function pageBox(data, w, h) {
  const lum = new Uint8Array(w * h)
  const histogram = new Array(256).fill(0)
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const y = Math.round(
      0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2],
    )
    lum[i] = y
    histogram[y]++
  }
  const cut = otsu(histogram)
  const rows = new Array(h).fill(0)
  const cols = new Array(w).fill(0)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (lum[y * w + x] > cut) {
        rows[y]++
        cols[x]++
      }
  const rowMin = w / 5
  const colMin = h / 5
  let top = rows.findIndex((n) => n > rowMin)
  let left = cols.findIndex((n) => n > colMin)
  if (top < 0 || left < 0) return null
  let bottom = h - 1 - [...rows].reverse().findIndex((n) => n > rowMin)
  let right = w - 1 - [...cols].reverse().findIndex((n) => n > colMin)
  const area = ((bottom - top + 1) * (right - left + 1)) / (w * h)
  if (area < 0.15 || area > 0.96) return null
  // a small margin so a slightly rotated page keeps its corners
  const mx = Math.round(w * 0.02)
  const my = Math.round(h * 0.02)
  top = Math.max(0, top - my)
  left = Math.max(0, left - mx)
  bottom = Math.min(h - 1, bottom + my)
  right = Math.min(w - 1, right + mx)
  return {
    x: left / w,
    y: top / h,
    width: (right - left + 1) / w,
    height: (bottom - top + 1) / h,
  }
}

function canvasOf(width, height) {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function toBlob(canvas, quality) {
  if (canvas.convertToBlob)
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * One page from a video frame or an image: cropped to the page when `crop`,
 * downscaled, JPEG under `maxBytes`. Returns { blob, width, height, url }.
 */
export async function makePage(
  source,
  { crop = true, maxBytes = PAGE_MAX_BYTES } = {},
) {
  const sw = source.videoWidth || source.naturalWidth || source.width
  const sh = source.videoHeight || source.naturalHeight || source.height
  if (!sw || !sh) throw new Error('empty frame')
  let box = { x: 0, y: 0, width: 1, height: 1 }
  if (crop) {
    const small = fitSize(sw, sh, 160)
    const probe = canvasOf(small.width, small.height)
    const pctx = probe.getContext('2d', { willReadFrequently: true })
    pctx.drawImage(source, 0, 0, small.width, small.height)
    const found = pageBox(
      pctx.getImageData(0, 0, small.width, small.height).data,
      small.width,
      small.height,
    )
    if (found) box = found
  }
  const cx = Math.round(box.x * sw)
  const cy = Math.round(box.y * sh)
  const cw = Math.round(box.width * sw)
  const ch = Math.round(box.height * sh)
  let size = fitSize(cw, ch)
  let quality = 0.86
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = canvasOf(size.width, size.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(source, cx, cy, cw, ch, 0, 0, size.width, size.height)
    const blob = await toBlob(canvas, quality)
    if (blob && (blob.size <= maxBytes || attempt === 7))
      return {
        blob,
        width: size.width,
        height: size.height,
        url: URL.createObjectURL(blob),
      }
    if (quality > 0.6) quality -= 0.12
    else
      size = fitSize(
        size.width,
        size.height,
        Math.round(Math.max(size.width, size.height) * 0.8),
      )
  }
  throw new Error('page too large')
}

const encoder = new TextEncoder()

/**
 * Bind JPEG pages ({ bytes: Uint8Array, width, height }) into one PDF, one page
 * per image at 150 dpi. Returns a Uint8Array.
 */
export function pagesToPdf(pages) {
  if (!pages.length) throw new Error('no pages')
  const chunks = []
  const offsets = []
  let length = 0
  const push = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (n, ...parts) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    parts.forEach(push)
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')
  const count = pages.length
  // 1 catalog, 2 pages tree, then per page: page, image, content
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`)
  pages.forEach((page, i) => {
    const pageNo = 3 + i * 3
    const w = Math.round((page.width * 72) / 150)
    const h = Math.round((page.height * 72) / 150)
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    object(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${pageNo + 1} 0 R >> >> /Contents ${pageNo + 2} 0 R >>`,
    )
    object(
      pageNo + 1,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      '\nendstream',
    )
    object(
      pageNo + 2,
      `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
    )
  })
  const size = 3 + count * 3
  const xref = length
  push(`xref\n0 ${size}\n0000000000 65535 f \n`)
  for (let n = 1; n < size; n++)
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const part of chunks) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Move the page at `from` to `to` (a new array). */
export function movePage(pages, from, to) {
  if (to < 0 || to >= pages.length || from === to) return pages
  const next = [...pages]
  const [page] = next.splice(from, 1)
  next.splice(to, 0, page)
  return next
}

/** File name of a scan: «escaneo-2026-10-18-1305.pdf» (local time). */
export function scanName(now = new Date(), ext = 'pdf') {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `escaneo-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}.${ext}`
  )
}

/**
 * What the camera may say about a failed getUserMedia, in the worker's words,
 * with the way out. `kind`: denied | missing | busy | insecure | other.
 */
export function cameraProblem(error, { secure = true } = {}) {
  if (!secure) return 'insecure'
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'missing'
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'other'
}

/** The «¿Qué es?» kinds a door offers: all, or those whose target it asked for. */
export function offeredKinds(options, { targets = [], invoice = '' } = {}) {
  const usable = (options || []).filter((o) => o.allowed)
  if (invoice) return usable.filter((o) => o.kind === 'transferencia')
  if (!targets?.length) return usable
  return usable.filter((o) => o.target && targets.includes(o.target))
}

/** The kind picked first: the guess when offered; with no guess, the first
 * offered only when the door preset the intent (or there is one choice), so the
 * worker picks it themselves instead of confirming a guess nobody made. */
export function initialKind(guess, offered, { preset = false } = {}) {
  if (guess && offered.some((o) => o.kind === guess)) return guess
  if (preset || offered.length === 1) return offered[0]?.kind || ''
  return ''
}
