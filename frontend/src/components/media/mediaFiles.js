// Pictures and videos on their way to the server: what a file is, a phone's
// picture cut down to what a screen shows before it travels, and the upload
// itself with its progress. A 6 MB photo goes up as a few hundred KB, so a
// shelf of products gets its pictures over a shop's mobile data.

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp)$/i

/** The long side a picture is sent at, and the JPEG quality it is saved with. */
export const MAX_SIDE = 2000
export const QUALITY = 0.86
// A JPEG already this light, within MAX_SIDE, goes up as it is.
const LIGHT_BYTES = 700 * 1024

/** 'image', 'video' or '' from a file name or URL, or from its type. */
export function mediaKind(name, type = '') {
  const path = String(name || '').split(/[?#]/)[0]
  if (type.startsWith('image/') || IMAGE_EXT.test(path)) return 'image'
  if (type.startsWith('video/') || VIDEO_EXT.test(path)) return 'video'
  return ''
}

/** `width` × `height` scaled down so its long side is at most `max`. */
export function fitWithin(width, height, max = MAX_SIDE) {
  const long = Math.max(width, height)
  if (!long || long <= max) return { width, height, scaled: false }
  const ratio = max / long
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  }
}

/** «2.4 MB», «640 KB»: a file's weight in the worker's units. */
export function weightText(bytes) {
  const size = Number(bytes) || 0
  if (size >= 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function withExtension(name, extension) {
  const stem = String(name || 'foto').replace(/\.[a-z0-9]{1,5}$/i, '')
  return `${stem || 'foto'}.${extension}`
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

/** The canvas as a Blob of `type` (the browser answers PNG for a type it cannot write). */
export function canvasBlob(canvas, type = 'image/jpeg', quality = QUALITY) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas'))),
      type,
      quality,
    ),
  )
}

/**
 * A picture file or URL as something a canvas draws, upright (the camera's
 * orientation tag applied). Resolves { source, width, height, close }.
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
  const url = typeof input === 'string' ? input : URL.createObjectURL(input)
  const done = () => typeof input !== 'string' && URL.revokeObjectURL(url)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await (image.decode
      ? image.decode()
      : new Promise((resolve, reject) => {
          image.onload = resolve
          image.onerror = reject
        }))
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
 * The file as it should travel. A picture comes back at most `maxSide` on its
 * long side: JPEG for photos, PNG kept as PNG (it may be a cut-out). A video,
 * a GIF, or a picture this browser cannot read goes as it is, and the server
 * says what is wrong with it.
 */
export async function prepareImage(
  file,
  {
    maxSide = MAX_SIDE,
    quality = QUALITY,
    decode = decodeImage,
    blobOf = canvasBlob,
    canvas = canvasOf,
  } = {},
) {
  const type = String(file?.type || '')
  if (mediaKind(file?.name, type) !== 'image') return file
  if (type === 'image/gif' || /\.gif$/i.test(file.name || '')) return file
  let picture
  try {
    picture = await decode(file)
  } catch {
    return file
  }
  try {
    const size = fitWithin(picture.width, picture.height, maxSide)
    const png = type === 'image/png' || /\.png$/i.test(file.name || '')
    const jpeg = type === 'image/jpeg' || /\.jpe?g$/i.test(file.name || '')
    if (!size.scaled && (png || (jpeg && file.size <= LIGHT_BYTES))) return file
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
    if (!size.scaled && blob.size >= file.size) return file
    const extension = blob.type === 'image/png' ? 'png' : 'jpg'
    return new File([blob], withExtension(file.name, extension), {
      type: blob.type || (png ? 'image/png' : 'image/jpeg'),
      lastModified: file.lastModified || Date.now(),
    })
  } catch {
    return file
  } finally {
    picture.close?.()
  }
}

function messagesOf(data) {
  let messages = []
  try {
    messages = data?._server_messages ? JSON.parse(data._server_messages) : []
  } catch {
    messages = []
  }
  return messages
    .map((entry) => {
      try {
        return JSON.parse(entry).message
      } catch {
        return entry
      }
    })
    .filter(Boolean)
}

/**
 * POST one file as multipart to a server method, with its progress (0–100).
 * Resolves the method's answer; rejects with an Error carrying `messages` (the
 * server's sentence), `status`, and `offline` when the request never arrived.
 */
export function sendFile(
  method,
  args,
  file,
  { onProgress = () => {}, Request = XMLHttpRequest } = {},
) {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.append('file', file, file.name || 'foto.jpg')
    const query = new URLSearchParams(args).toString()
    const xhr = new Request()
    xhr.open('POST', `/api/method/${method}?${query}`)
    xhr.setRequestHeader('Accept', 'application/json')
    if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
      xhr.setRequestHeader('X-Frappe-CSRF-Token', window.csrf_token)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(99, Math.round((100 * event.loaded) / event.total)))
    }
    const lost = () => {
      const error = new Error(method)
      error.offline = true
      error.messages = []
      reject(error)
    }
    xhr.onerror = lost
    xhr.ontimeout = lost
    xhr.onload = () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        return resolve(data.message)
      }
      const error = new Error(
        [method, data.exc_type].filter(Boolean).join(' '),
      )
      error.status = xhr.status
      error.exc_type = data.exc_type
      error.messages = messagesOf(data)
      reject(error)
    }
    xhr.send(body)
  })
}

/**
 * Run `task(entry)` over `entries`, at most `limit` at a time, in order.
 * A task that throws does not stop the others.
 */
export async function runPool(entries, task, limit = 2) {
  const queue = [...entries]
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, queue.length)) },
    async () => {
      while (queue.length) {
        const entry = queue.shift()
        try {
          await task(entry)
        } catch {
          // The task keeps its own failure; the pool goes on.
        }
      }
    },
  )
  await Promise.all(workers)
}
