// Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// A picture on the worker's device, before it travels: read it upright, fit it
// to what a screen shows, and write it back as a file. A 6 MB phone photo goes
// up as a few hundred KB, so a shelf of products gets its pictures over a
// shop's mobile data. The canvas helpers are the one copy for every app screen
// that draws a picture (the document camera, the photo editor, uploads).

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i
const VIDEO_FILE = /\.(mp4|mov|m4v|webm|3gp)$/i

/**
 * 'image', 'video' or '' for a file name or URL, or for its MIME type: one
 * answer for every screen that sorts files into what the viewer can show.
 */
export function mediaKind(name, type = '') {
  const path = String(name || '').split(/[?#]/)[0]
  const mime = String(type || '')
  if (mime.startsWith('image/') || IMAGE_FILE.test(path)) return 'image'
  if (mime.startsWith('video/') || VIDEO_FILE.test(path)) return 'video'
  return ''
}

/** The long side a picture is sent at, and the JPEG quality it is saved with. */
export const MAX_SIDE = 2000
export const QUALITY = 0.86
// A JPEG already this light, within MAX_SIDE, goes up as it is (`lightBytes`;
// 0 re-encodes every picture, which also drops its camera data).
const LIGHT_BYTES = 700 * 1024

/** `width` × `height` scaled down so the long side is at most `max` (never up). */
export function fitWithin(width, height, max = MAX_SIDE) {
  const long = Math.max(width, height)
  if (!long || long <= max) return { width, height }
  const ratio = max / long
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/** A canvas of that size, off the page where the browser has one. */
export function canvasOf(width, height) {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** The canvas as a Blob of `type` (a browser answers PNG for a type it cannot write). */
export function canvasBlob(canvas, type = 'image/jpeg', quality = QUALITY) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * A picture file, Blob or URL as something a canvas draws, upright (the
 * camera's orientation tag applied). Resolves { source, width, height, close }.
 */
export async function decodeImage(input) {
  if (typeof createImageBitmap === 'function' && typeof input !== 'string') {
    try {
      const bitmap = await createImageBitmap(input, {
        imageOrientation: 'from-image',
      })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      }
    } catch {
      // Some browsers refuse a kind they still show in <img>: try that way.
    }
  }
  const own = typeof input !== 'string'
  const url = own ? URL.createObjectURL(input) : input
  const done = () => own && URL.revokeObjectURL(url)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch (error) {
    done()
    throw error
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: done,
  }
}

/**
 * A stored picture (a URL of this origin) or a Blob, read as bytes so the
 * canvas that draws it can be saved again. Resolves decodeImage's answer plus
 * the picture's `type`.
 */
export async function openImage(src) {
  let blob = src
  if (typeof src === 'string') {
    const answer = await fetch(src, { credentials: 'same-origin' })
    if (!answer.ok) throw new Error('fetch')
    blob = await answer.blob()
  }
  return { ...(await decodeImage(blob)), type: blob.type || 'image/jpeg' }
}

function renamed(name, extension) {
  const stem = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '')
  return `${stem || 'foto'}.${extension}`
}

/**
 * The file as it should travel. A picture comes back at most `maxSide` on its
 * long side: JPEG for photos, PNG kept as PNG (it may be a cut-out) unless
 * `keepPng` is off (evidence, where a screenshot is lighter as JPEG). A video,
 * a GIF, or a picture this browser cannot read goes as it is, and the server
 * says what is wrong with it.
 */
export async function prepareImage(
  file,
  {
    maxSide = MAX_SIDE,
    quality = QUALITY,
    keepPng = true,
    lightBytes = LIGHT_BYTES,
    decode = decodeImage,
    blobOf = canvasBlob,
    canvas = canvasOf,
  } = {},
) {
  const type = String(file?.type || '')
  const name = String(file?.name || '')
  if (mediaKind(name, type) !== 'image') return file
  if (type === 'image/gif' || /\.gif$/i.test(name)) return file
  let picture
  try {
    picture = await decode(file)
  } catch {
    return file
  }
  try {
    const size = fitWithin(picture.width, picture.height, maxSide)
    const scaled = size.width !== picture.width
    const png = keepPng && (type === 'image/png' || /\.png$/i.test(name))
    const jpeg = type === 'image/jpeg' || /\.jpe?g$/i.test(name)
    if (!scaled && (png || (jpeg && file.size <= lightBytes))) return file
    const target = canvas(size.width, size.height)
    const ctx = target.getContext('2d')
    if (!png) {
      // A picture with transparency saved as JPEG gets a white ground.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(picture.source, 0, 0, size.width, size.height)
    const blob = await blobOf(target, png ? 'image/png' : 'image/jpeg', quality)
    if (!blob || (!scaled && blob.size >= file.size)) return file
    const kept = blob.type === 'image/png' ? 'png' : 'jpg'
    return new File([blob], renamed(name, kept), {
      type: blob.type || 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    })
  } catch {
    return file
  } finally {
    picture.close?.()
  }
}
