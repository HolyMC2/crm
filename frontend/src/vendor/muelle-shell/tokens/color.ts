// Vendored from muelle/workspace/packages/tokens@0.1.0 (b144ac6b7530). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Color math shared with Doco's `erp_experience/appearance.py`. Ported
// operation for operation (Python `colorsys`, `round` half-to-even) so an
// accent resolves to the same hex in Desk and in every SPA.

export type Rgb = readonly [number, number, number]

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Lowercase `#rrggbb`, `null` for empty, or throws on an invalid color. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (value == null || !String(value).trim()) return null
  const match = HEX.exec(String(value).trim())
  if (!match) throw new RangeError(`Color inválido: ${value}`)
  let digits = (match[1] as string).toLowerCase()
  if (digits.length === 3) digits = Array.from(digits, (c) => c + c).join('')
  return `#${digits}`
}

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb
}

/** Python's `round()`: nearest, ties to even. */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x)
  const diff = x - floor
  if (diff > 0.5) return floor + 1
  if (diff < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

export function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => roundHalfEven(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as unknown as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio of two opaque colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const pymod1 = (x: number) => ((x % 1) + 1) % 1

/** Python `colorsys.rgb_to_hls` (3.13), channels 0–1. */
export function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  const sumc = maxc + minc
  const rangec = maxc - minc
  const l = sumc / 2.0
  if (minc === maxc) return [0.0, l, 0.0]
  const s = l <= 0.5 ? rangec / sumc : rangec / (2.0 - maxc - minc)
  const rc = (maxc - r) / rangec
  const gc = (maxc - g) / rangec
  const bc = (maxc - b) / rangec
  let h: number
  if (r === maxc) h = bc - gc
  else if (g === maxc) h = 2.0 + rc - bc
  else h = 4.0 + gc - rc
  return [pymod1(h / 6.0), l, s]
}

const ONE_THIRD = 1.0 / 3.0
const ONE_SIXTH = 1.0 / 6.0
const TWO_THIRD = 2.0 / 3.0

function v(m1: number, m2: number, hue: number): number {
  hue = pymod1(hue)
  if (hue < ONE_SIXTH) return m1 + (m2 - m1) * hue * 6.0
  if (hue < 0.5) return m2
  if (hue < TWO_THIRD) return m1 + (m2 - m1) * (TWO_THIRD - hue) * 6.0
  return m1
}

/** Python `colorsys.hls_to_rgb`, channels 0–1. */
export function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0.0) return [l, l, l]
  const m2 = l <= 0.5 ? l * (1.0 + s) : l + s - l * s
  const m1 = 2.0 * l - m2
  return [v(m1, m2, h + ONE_THIRD), v(m1, m2, h), v(m1, m2, h - ONE_THIRD)]
}

export const MIN_CONTRAST = 4.5

/**
 * Shift `accent`'s HLS lightness toward `toward` in 40 steps until it reads on
 * `surface` (≥ 4.5:1), keeping hue and saturation; `toward` itself if none does.
 */
export function readableOn(accent: string, surface: string, toward: string, min = MIN_CONTRAST): string {
  const [h, lightness, s] = rgbToHls(...(hexToRgb(accent).map((c) => c / 255) as unknown as Rgb))
  const target = rgbToHls(...(hexToRgb(toward).map((c) => c / 255) as unknown as Rgb))[1]
  for (let step = 0; step < 41; step++) {
    const level = lightness + ((target - lightness) * step) / 40
    const candidate = rgbToHex(hlsToRgb(h, level, s).map((c) => c * 255) as unknown as Rgb)
    if (contrast(candidate, surface) >= min) return candidate
  }
  return toward
}

/** `weight` of `a` over `b` (0–1), opaque sRGB mix. */
export function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([0, 1, 2].map((i) => (x[i] as number) * weight + (y[i] as number) * (1 - weight)) as unknown as Rgb)
}
