// Vendored from muelle/workspace/packages/tokens@0.2.0 (bf6aaf7d558c). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Material Design 3 colour roles, derived from the shop's accent. Tonal
// surfaces are the accent mixed into the page surface, so a grey shop stays
// grey and a coloured one gets a faint tint. Every value is resolved hex per
// theme (the AA checks, the Vuetify themes and the runtime `<style>` all work
// in hex). Primary and on-primary are not repeated here: they are
// `--muelle-accent` and `--muelle-accent-ink` (`shellAccent`).
import { shellAccent, type Appearance, type ThemeName } from './appearance'
import { contrast, luminance, mix, readableOn, MIN_CONTRAST } from './color'
import { FRAPPE_THEMES } from './frappe-ui'
import { LIGHT_INK } from './presets'

export interface MaterialRoles {
  /** Sheets, dialogs, tiles: the first step of tone above the page. */
  'surface-container-low': string
  /** Bars and navigation. */
  'surface-container': string
  /** A track or a group inside a container. */
  'surface-container-high': string
  /** Filled fields, discs, the strongest step of tone. */
  'surface-container-highest': string
  /** What is selected: chips, segments, nav items, rows; tonal buttons. */
  'secondary-container': string
  /** Text and icons on `secondary-container`. */
  'on-secondary-container': string
  /** Secondary text; reads on every container, the highest included. */
  'on-surface-variant': string
  /** A boundary that has to be seen: an outlined control. */
  outline: string
  /** A hairline between or around surfaces: never heavier than frappe-ui's own. */
  'outline-variant': string
  /** A filled accent under the pointer. */
  'accent-hover': string
  /** Tooltips and snackbars: the surface of the opposite theme. */
  'inverse-surface': string
  /** Text on `inverse-surface`. */
  'inverse-on-surface': string
}

export type MaterialRole = keyof MaterialRoles

/** Share of the accent mixed into the page surface, per container step. */
export const CONTAINER_WEIGHTS: Readonly<Record<ThemeName, Readonly<Record<'low' | 'base' | 'high' | 'highest', number>>>> = Object.freeze({
  light: Object.freeze({ low: 0.04, base: 0.06, high: 0.09, highest: 0.12 }),
  dark: Object.freeze({ low: 0.05, base: 0.08, high: 0.11, highest: 0.15 }),
})
export const SECONDARY_CONTAINER_WEIGHT: Readonly<Record<ThemeName, number>> = Object.freeze({ light: 0.16, dark: 0.21 })
/** How far a filled accent moves under the pointer. */
export const ACCENT_HOVER_WEIGHT = 0.08

/**
 * The accent moved 8 % toward its label colour. When the label, or `ink-base`
 * (hand-rolled primaries write their label with it), would drop under AA
 * there, it moves 8 % the other way instead: a pointer never costs contrast.
 */
function accentHover(accent: string, ink: string, inkBase: string): string {
  const toward = mix(ink, accent, ACCENT_HOVER_WEIGHT)
  if (contrast(ink, toward) >= MIN_CONTRAST && contrast(inkBase, toward) >= MIN_CONTRAST) return toward
  const away = luminance(ink) > luminance(accent) ? '#000000' : '#ffffff'
  return mix(away, accent, ACCENT_HOVER_WEIGHT)
}

function themeRoles(appearance: Appearance, theme: ThemeName): MaterialRoles {
  const t = FRAPPE_THEMES[theme]
  const { accent, 'accent-ink': accentInk } = shellAccent(appearance)[theme]
  const base = t['surface-base']
  const weights = CONTAINER_WEIGHTS[theme]
  const highest = mix(accent, base, weights.highest)
  const secondary = mix(accent, base, SECONDARY_CONTAINER_WEIGHT[theme])
  const variant = t['ink-gray-6']
  return {
    'surface-container-low': mix(accent, base, weights.low),
    'surface-container': mix(accent, base, weights.base),
    'surface-container-high': mix(accent, base, weights.high),
    'surface-container-highest': highest,
    'secondary-container': secondary,
    'on-secondary-container':
      contrast(accent, secondary) >= MIN_CONTRAST ? accent : readableOn(accent, secondary, theme === 'light' ? LIGHT_INK : '#ffffff'),
    'on-surface-variant': contrast(variant, highest) >= MIN_CONTRAST ? variant : readableOn(variant, highest, t['ink-gray-9']),
    outline: t['outline-gray-4'],
    // The hairline is frappe-ui's lightest outline as it is: tone parts the
    // surfaces, so a rule between rows must not weigh more than it did before
    // the roles. No accent goes into it: mixed in, any accent darkens it.
    'outline-variant': t['outline-gray-1'],
    'accent-hover': accentHover(accent, accentInk, t['ink-base']),
    'inverse-surface': t['surface-gray-10'],
    'inverse-on-surface': t['ink-base'],
  }
}

/** The Material roles for both themes. */
export function materialRoles(appearance: Appearance): Record<ThemeName, MaterialRoles> {
  return { light: themeRoles(appearance, 'light'), dark: themeRoles(appearance, 'dark') }
}
