// Vendored from muelle/workspace/packages/tokens@0.2.0 (f60255e9ba39). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// CSS custom properties. `tokens.css` (committed) is `renderTokensCss()` for
// the default Gris palette; at boot each SPA injects `accentCss(palette)` so
// the site's Doco Business Settings palette recolors the accent and the
// Material roles derived from it. Themes follow frappe-ui: light on `:root`,
// dark under `[data-theme='dark']`.
import { resolveAppearance, shellAccent, type Appearance, type ThemeName } from './appearance'
import { FONT_FAMILY, FONT_SIZES, FONT_WEIGHTS, FRAPPE_THEMES, FRAPPE_UI_VERSION, RADII } from './frappe-ui'
import { materialRoles } from './material'

export const PREFIX = '--muelle-'

/** Motion (spec §4.6): duration in `--m-*`, easing in `--m-*-ease`. Only transform and opacity animate. */
export const MOTION = Object.freeze({
  fast: ['120ms', 'cubic-bezier(0.2,0,0,1)'],
  base: ['180ms', 'cubic-bezier(0.2,0,0,1)'],
  'sheet-in': ['260ms', 'cubic-bezier(0.05,0.7,0.1,1)'],
  out: ['140ms', 'cubic-bezier(0.3,0,0.8,0.15)'],
} as const)
export const REDUCED_MOTION_MS = '80ms'
export const TOUCH_MIN = '44px'

/** Corner scale (`--muelle-shape-*`): 8 chips, 12 small, 16 fields and cards, 20 tiles and groups, 28 sheets and dialogs. */
export const SHAPE = Object.freeze({ xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '28px', chip: '8px' } as const)
/** Elevation is tone; these two are for what has no tone to stand on. */
export const ELEVATION = Object.freeze({
  /** A 1 px edge: a surface that had only a shadow keeps its outline on a page of the same colour. */
  edge: `0 0 0 1px var(${PREFIX}outline-variant)`,
  /** What floats (FAB, menus, desktop dialogs): one soft shadow in light, the edge in dark. */
  float: { light: '0 4px 12px 2px rgba(0, 0, 0, 0.18)', dark: `var(${PREFIX}elevation-edge)` },
} as const)

function block(selector: string, declarations: Array<[string, string]>, indent = ''): string {
  const lines = declarations.map(([name, value]) => `${indent}  ${name}: ${value};`).join('\n')
  return `${indent}${selector} {\n${lines}\n${indent}}\n`
}

/** `--muelle-accent*` declarations for one theme. */
export function accentProperties(appearance: Appearance, theme: ThemeName): Record<string, string> {
  const tokens = shellAccent(appearance)[theme]
  return Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`${PREFIX}${name}`, value]))
}

/** `--muelle-<role>` declarations of the Material roles for one theme. */
export function materialProperties(appearance: Appearance, theme: ThemeName): Record<string, string> {
  return Object.fromEntries(Object.entries(materialRoles(appearance)[theme]).map(([name, value]) => [`${PREFIX}${name}`, value]))
}

/** What a site palette recolors: the accent and the roles derived from it. */
function paletteDeclarations(appearance: Appearance, theme: ThemeName): Array<[string, string]> {
  return [...Object.entries(accentProperties(appearance, theme)), ...Object.entries(materialProperties(appearance, theme))]
}

function colorDeclarations(theme: ThemeName, appearance: Appearance): Array<[string, string]> {
  return [
    ['color-scheme', theme],
    ...Object.entries(FRAPPE_THEMES[theme]).map(([name, value]): [string, string] => [`${PREFIX}${name}`, value]),
    ...paletteDeclarations(appearance, theme),
    [`${PREFIX}elevation-float`, ELEVATION.float[theme]],
  ]
}

/** The accent and its Material roles only, for a runtime `<style>` after boot. */
export function accentCss(appearance: Appearance): string {
  return block(':root', paletteDeclarations(appearance, 'light')) + block(":root[data-theme='dark']", paletteDeclarations(appearance, 'dark'))
}

/** The full token sheet (`tokens.css`). */
export function renderTokensCss(appearance: Appearance = resolveAppearance()): string {
  const scale: Array<[string, string]> = [
    [`${PREFIX}font`, `'${FONT_FAMILY}', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`],
    ...Object.entries(FONT_SIZES).map(([name, value]): [string, string] => [`${PREFIX}text-${name}`, value]),
    ...Object.entries(FONT_WEIGHTS).map(([name, value]): [string, string] => [`${PREFIX}weight-${name}`, String(value)]),
    ...Object.entries(RADII).map(([name, value]): [string, string] => [name === 'DEFAULT' ? `${PREFIX}radius` : `${PREFIX}radius-${name}`, value]),
    ...Object.entries(SHAPE).map(([name, value]): [string, string] => [`${PREFIX}shape-${name}`, value]),
    [`${PREFIX}elevation-edge`, ELEVATION.edge],
    [`${PREFIX}touch-min`, TOUCH_MIN],
    [`${PREFIX}focus-ring`, `2px solid var(${PREFIX}accent)`],
    [`${PREFIX}focus-offset`, '2px'],
    ...Object.entries(MOTION).flatMap(([name, [duration, ease]]): Array<[string, string]> => [
      [`--m-${name}`, duration],
      [`--m-${name}-ease`, ease],
    ]),
  ]
  return (
    `/* @muelle/tokens — generated from frappe-ui ${FRAPPE_UI_VERSION} and the ${appearance.accent} palette. DO NOT EDIT: run \`pnpm run build:css\`. */\n` +
    block(':root', [...colorDeclarations('light', appearance), ...scale]) +
    block(":root[data-theme='dark']", colorDeclarations('dark', appearance)) +
    `@media (prefers-reduced-motion: reduce) {\n` +
    block(':root', Object.keys(MOTION).map((name): [string, string] => [`--m-${name}`, REDUCED_MOTION_MS]), '  ') +
    `}\n`
  )
}
