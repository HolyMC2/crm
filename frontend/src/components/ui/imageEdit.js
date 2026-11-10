// Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The arithmetic of a quick photo edit (PhotoEditor): quarter turns, a mirror, a crop and a
// touch of light, kept as numbers while the worker plays and drawn once when
// they save (`bakeEdit`). The crop is in fractions (0 to 1) of the picture as
// it shows after the turns and the mirror, so it stays put under the finger
// whatever the picture's real size.
import { canvasBlob, canvasOf, fitWithin, MAX_SIDE, QUALITY } from './imageFiles'

const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 })
/** The smallest crop, as a fraction of a side. */
export const MIN_CROP = 0.08
/** Light runs from -LIGHT_RANGE (darker) to +LIGHT_RANGE (lighter). */
export const LIGHT_RANGE = 60

export function newEdit() {
  return { turns: 0, flip: false, crop: { ...FULL }, light: 0, ratio: 0 }
}

const near = (a, b) => Math.abs(a - b) < 1e-4

export function isFullCrop(crop) {
  return (
    near(crop.x, 0) && near(crop.y, 0) && near(crop.w, 1) && near(crop.h, 1)
  )
}

/** Whether saving would change the picture. */
export function isEdited(edit) {
  return Boolean(
    edit.turns % 4 || edit.flip || edit.light || !isFullCrop(edit.crop),
  )
}

/** The picture's size as it shows: sides swapped on an odd number of turns. */
export function shownSize(width, height, turns) {
  return turns % 2 ? { width: height, height: width } : { width, height }
}

function clampCrop(crop) {
  const w = Math.min(1, Math.max(MIN_CROP, crop.w))
  const h = Math.min(1, Math.max(MIN_CROP, crop.h))
  return {
    x: Math.min(1 - w, Math.max(0, crop.x)),
    y: Math.min(1 - h, Math.max(0, crop.y)),
    w,
    h,
  }
}

/** A quarter turn clockwise (`by` 1) or back (`by` -1); the crop turns with it. */
export function turnEdit(edit, by = 1) {
  const { x, y, w, h } = edit.crop
  const crop =
    by > 0
      ? { x: 1 - (y + h), y: x, w: h, h: w }
      : { x: y, y: 1 - (x + w), w: h, h: w }
  return {
    ...edit,
    turns: (edit.turns + (by > 0 ? 1 : 3)) % 4,
    crop: clampCrop(crop),
    ratio: edit.ratio ? 1 / edit.ratio : 0,
  }
}

/** Mirror the picture as it shows, left to right; the crop mirrors with it. */
export function flipEdit(edit) {
  const { x, w } = edit.crop
  return {
    ...edit,
    // Mirroring what shows after t turns is t turns the other way of a mirrored source.
    turns: (4 - edit.turns) % 4,
    flip: !edit.flip,
    crop: clampCrop({ ...edit.crop, x: 1 - (x + w) }),
  }
}

/**
 * The largest centred crop of `ratio` (width over height, 0 for free) inside
 * the picture as it shows.
 */
export function ratioCrop(width, height, turns, ratio) {
  if (!ratio) return { ...FULL }
  const shown = shownSize(width, height, turns)
  const own = shown.width / shown.height
  const w = own > ratio ? ratio / own : 1
  const h = own > ratio ? 1 : own / ratio
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/** Set the crop's shape (0 frees it) and start from the largest centred one. */
export function shapeEdit(edit, ratio, width, height) {
  return {
    ...edit,
    ratio,
    crop: ratio ? ratioCrop(width, height, edit.turns, ratio) : edit.crop,
  }
}

/**
 * Drag the crop: `handle` is 'move' or the sides it pulls ('n', 'se', 'w'…),
 * `dx`/`dy` the finger's travel as fractions of the picture as it shows, from
 * `start` (the crop when the drag began). `shape` is the fixed ratio of the
 * crop's fractions (ratio × shown height ÷ shown width), 0 when free.
 */
export function dragCrop(start, handle, dx, dy, shape = 0) {
  if (handle === 'move')
    return {
      ...start,
      x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
      y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
    }
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (handle.includes('w'))
    left = Math.min(right - MIN_CROP, Math.max(0, left + dx))
  if (handle.includes('e'))
    right = Math.max(left + MIN_CROP, Math.min(1, right + dx))
  if (handle.includes('n'))
    top = Math.min(bottom - MIN_CROP, Math.max(0, top + dy))
  if (handle.includes('s'))
    bottom = Math.max(top + MIN_CROP, Math.min(1, bottom + dy))
  if (!shape) return { x: left, y: top, w: right - left, h: bottom - top }

  // A fixed shape: the pulled side leads, the other follows from the anchor.
  const sideways = handle === 'e' || handle === 'w'
  const upright = handle === 'n' || handle === 's'
  let w = right - left
  let h = bottom - top
  if (upright || (!sideways && h * shape > w)) w = h * shape
  else h = w / shape
  // Room from the anchor (the side or corner that does not move).
  const anchorX = handle.includes('w')
    ? start.x + start.w
    : handle.includes('e')
      ? start.x
      : start.x + start.w / 2
  const anchorY = handle.includes('n')
    ? start.y + start.h
    : handle.includes('s')
      ? start.y
      : start.y + start.h / 2
  const roomW = handle.includes('w')
    ? anchorX
    : handle.includes('e')
      ? 1 - anchorX
      : 2 * Math.min(anchorX, 1 - anchorX)
  const roomH = handle.includes('n')
    ? anchorY
    : handle.includes('s')
      ? 1 - anchorY
      : 2 * Math.min(anchorY, 1 - anchorY)
  // Never smaller than the smallest crop, never past the picture's edge.
  const grow = Math.max(1, MIN_CROP / w, MIN_CROP / h)
  const scale = grow * Math.min(1, roomW / (w * grow), roomH / (h * grow))
  w *= scale
  h *= scale
  return {
    x: handle.includes('w')
      ? anchorX - w
      : handle.includes('e')
        ? anchorX
        : anchorX - w / 2,
    y: handle.includes('n')
      ? anchorY - h
      : handle.includes('s')
        ? anchorY
        : anchorY - h / 2,
    w,
    h,
  }
}

/** The saved picture's size in pixels: the crop, at most `maxSide` long. */
export function outputSize(width, height, edit, maxSide = MAX_SIDE) {
  const shown = shownSize(width, height, edit.turns)
  return fitWithin(
    Math.max(1, Math.round(shown.width * edit.crop.w)),
    Math.max(1, Math.round(shown.height * edit.crop.h)),
    maxSide,
  )
}

/** How much each channel is multiplied by for a `light` setting. */
export function lightGain(light) {
  return 1 + Math.max(-LIGHT_RANGE, Math.min(LIGHT_RANGE, light || 0)) / 100
}

/** Lighten or darken the pixels in place (RGBA bytes). */
export function applyLight(pixels, light) {
  const gain = lightGain(light)
  if (gain === 1) return pixels
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.min(255, pixels[i] * gain)
    pixels[i + 1] = Math.min(255, pixels[i + 1] * gain)
    pixels[i + 2] = Math.min(255, pixels[i + 2] * gain)
  }
  return pixels
}

/**
 * Paint `source` (an image or bitmap of `width` × `height`, upright) turned
 * and mirrored onto `ctx`, whose origin is the top left of the picture as it
 * shows. The preview and the saved file share it, so what shows is what saves.
 */
export function paintTurned(ctx, source, width, height, turns, flip) {
  const shown = shownSize(width, height, turns)
  ctx.translate(shown.width / 2, shown.height / 2)
  ctx.rotate((turns * Math.PI) / 2)
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(source, -width / 2, -height / 2, width, height)
}

/**
 * Draw the edit once: the picture turned, mirrored, cropped and lit, as a
 * Blob. PNG stays PNG (pass its `type`); anything else is saved as JPEG.
 */
export async function bakeEdit(
  source,
  width,
  height,
  edit,
  { type = 'image/jpeg', quality = QUALITY, maxSide = MAX_SIDE } = {},
) {
  const shown = shownSize(width, height, edit.turns)
  const size = outputSize(width, height, edit, maxSide)
  const scale = size.width / (shown.width * edit.crop.w)
  const canvas = canvasOf(size.width, size.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(edit.light) })
  if (type !== 'image/png') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size.width, size.height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(scale, scale)
  ctx.translate(-edit.crop.x * shown.width, -edit.crop.y * shown.height)
  paintTurned(ctx, source, width, height, edit.turns, edit.flip)
  if (edit.light) {
    const image = ctx.getImageData(0, 0, size.width, size.height)
    applyLight(image.data, edit.light)
    ctx.putImageData(image, 0, 0)
  }
  return canvasBlob(canvas, type, quality)
}
