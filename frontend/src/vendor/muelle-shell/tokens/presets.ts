// Vendored from muelle/workspace/packages/tokens@0.1.0 (b144ac6b7530). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Named palettes, mirrored from Doco `erp_experience/appearance.py` PRESETS:
// accent = frappe-ui lightMode <hue>/700, lift = darkMode <hue>/300. Red, amber
// and orange stay out because they mean status. A preset fills accent and tone;
// the boot `palette` field carries the site's resolved choice to every SPA.

export type Tone = 'Warm' | 'Neutral' | 'Cool'

export interface Preset {
  key: 'gris' | 'azul' | 'verde' | 'morado' | 'rosa' | 'muelle'
  label: string
  accent: string
  lift: string
  tone: Tone
}

export const GRAY = '#171717'
export const GRAY_LIFT = '#ededed'
export const DEFAULT_ACCENT = GRAY
export const DEFAULT_TONE: Tone = 'Neutral'
/** Doco's label ink for light fills. */
export const LIGHT_INK = '#16222a'

export const TONES: readonly Tone[] = Object.freeze(['Warm', 'Neutral', 'Cool'] as const)

/** Canvas (light) and canvas/panel (dark) per tone, as Doco's Desk skin uses them. */
export const TONE_COLORS: Readonly<Record<Tone, { canvas: string; canvas_dark: string; surface_dark: string }>> = Object.freeze({
  Warm: { canvas: '#f7f6f2', canvas_dark: '#0a1218', surface_dark: '#101c24' },
  Neutral: { canvas: '#f7f7f7', canvas_dark: '#111111', surface_dark: '#1a1a1a' },
  Cool: { canvas: '#f5f8fa', canvas_dark: '#0b141b', surface_dark: '#131f28' },
})

export const PRESETS: readonly Preset[] = Object.freeze([
  { key: 'gris', label: 'Gris', accent: GRAY, lift: GRAY_LIFT, tone: 'Neutral' },
  { key: 'azul', label: 'Azul', accent: '#0070cc', lift: '#5aaef2', tone: 'Neutral' },
  { key: 'verde', label: 'Verde', accent: '#137949', lift: '#58c08e', tone: 'Neutral' },
  { key: 'morado', label: 'Morado', accent: '#6e399d', lift: '#b168e8', tone: 'Neutral' },
  { key: 'rosa', label: 'Rosa', accent: '#9c2671', lift: '#e359ab', tone: 'Neutral' },
  { key: 'muelle', label: 'Muelle', accent: '#0f7a8f', lift: '#5cb8ca', tone: 'Warm' },
] as const satisfies readonly Preset[])

export const DEFAULT_PRESET = PRESETS[0] as Preset
