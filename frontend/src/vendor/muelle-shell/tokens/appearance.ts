// Vendored from muelle/workspace/packages/tokens@0.1.0 (b144ac6b7530). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Accent resolution. `resolveAppearance` is Doco's `appearance.resolve()`
// (same inputs, same hex out); `shellAccent` turns it into the four
// `--muelle-accent*` values per theme, re-checked against the frappe-ui
// surfaces the SPAs actually paint, so text, focus rings and filled buttons
// keep WCAG AA for every preset and any custom accent.
import { contrast, mix, normalizeHex, readableOn, MIN_CONTRAST } from './color'
import { FRAPPE_THEMES } from './frappe-ui'
import { DEFAULT_ACCENT, DEFAULT_TONE, LIGHT_INK, PRESETS, TONE_COLORS, TONES, type Tone } from './presets'

export interface Appearance {
  accent: string
  accent_light: string
  accent_light_ink: string
  accent_dark: string
  accent_dark_ink: string
  tone: Lowercase<Tone>
  /** True when the chosen accent had to be darkened to read on white. */
  adjusted: boolean
}

const DARK_LIFTS: ReadonlyMap<string, string> = new Map(PRESETS.map((p) => [p.accent, p.lift]))

/** Label color for text on a filled accent. */
export function inkFor(fill: string): string {
  return contrast(fill, '#ffffff') >= contrast(fill, LIGHT_INK) ? '#ffffff' : LIGHT_INK
}

/** Port of Doco `appearance.resolve(accent, tone)`; density is not a token. */
export function resolveAppearance(accent?: string | null, tone?: string | null): Appearance {
  const chosen = normalizeHex(accent) ?? DEFAULT_ACCENT
  const t: Tone = (TONES as readonly string[]).includes(tone ?? '') ? (tone as Tone) : DEFAULT_TONE
  const light = readableOn(chosen, '#ffffff', LIGHT_INK)
  const lift = DARK_LIFTS.get(chosen)
  const surface = TONE_COLORS[t].surface_dark
  const dark = lift && contrast(lift, surface) >= MIN_CONTRAST ? lift : readableOn(chosen, surface, '#ffffff')
  return {
    accent: chosen,
    accent_light: light,
    accent_light_ink: inkFor(light),
    accent_dark: dark,
    accent_dark_ink: inkFor(dark),
    tone: t.toLowerCase() as Lowercase<Tone>,
    adjusted: light !== chosen,
  }
}

/** Accept the boot `palette` field (a resolved Doco appearance) or resolve a bare accent. */
export function appearanceFrom(palette: Partial<Appearance> | null | undefined): Appearance {
  const base = resolveAppearance(palette?.accent, palette?.tone ? palette.tone[0]?.toUpperCase() + palette.tone.slice(1) : null)
  const valid = (value: unknown) => {
    try {
      return typeof value === 'string' ? normalizeHex(value) : null
    } catch {
      return null
    }
  }
  return {
    ...base,
    accent_light: valid(palette?.accent_light) ?? base.accent_light,
    accent_dark: valid(palette?.accent_dark) ?? base.accent_dark,
    accent_light_ink: valid(palette?.accent_light_ink) ?? base.accent_light_ink,
    accent_dark_ink: valid(palette?.accent_dark_ink) ?? base.accent_dark_ink,
  }
}

export type ThemeName = 'light' | 'dark'

export interface AccentTokens {
  /** Accent text, icons, focus ring and filled-button background. */
  accent: string
  /** Label on a filled accent. */
  'accent-ink': string
  /** Tinted background for selected rows, active nav and chips. */
  'accent-soft': string
  /** Accent-colored text on `accent-soft`. */
  'accent-soft-ink': string
}

const SOFT_WEIGHT: Readonly<Record<ThemeName, number>> = { light: 0.1, dark: 0.18 }
/** Surfaces accent text sits on in the shell: page and sidebar. */
const ACCENT_SURFACES = ['surface-base', 'surface-gray-1'] as const

function worstSurface(color: string, theme: ThemeName): string {
  return ACCENT_SURFACES.map((key) => FRAPPE_THEMES[theme][key] as string).sort((a, b) => contrast(color, a) - contrast(color, b))[0] as string
}

function themeAccent(seed: string, ink: string, theme: ThemeName): AccentTokens {
  const toward = theme === 'light' ? LIGHT_INK : '#ffffff'
  const surface = worstSurface(seed, theme)
  const accent = contrast(seed, surface) >= MIN_CONTRAST ? seed : readableOn(seed, surface, toward)
  const label = accent === seed ? ink : inkFor(accent)
  const fallbackInk = theme === 'light' ? '#ffffff' : '#000000'
  const accentInk = contrast(label, accent) >= MIN_CONTRAST ? label : fallbackInk
  const soft = mix(accent, FRAPPE_THEMES[theme]['surface-base'], SOFT_WEIGHT[theme])
  const softInk = contrast(accent, soft) >= MIN_CONTRAST ? accent : readableOn(accent, soft, toward)
  return { accent, 'accent-ink': accentInk, 'accent-soft': soft, 'accent-soft-ink': softInk }
}

/** The accent tokens for both themes. */
export function shellAccent(appearance: Appearance): Record<ThemeName, AccentTokens> {
  return {
    light: themeAccent(appearance.accent_light, appearance.accent_light_ink, 'light'),
    dark: themeAccent(appearance.accent_dark, appearance.accent_dark_ink, 'dark'),
  }
}
