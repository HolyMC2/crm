// Vendored from muelle/workspace/packages/tokens@0.1.0 (b144ac6b7530). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// POS (Vuetify 3) theme from the same tokens. Vuetify needs concrete colors,
// so this maps the resolved values rather than `var(--muelle-*)`. POS passes
// the result to `createVuetify({ theme: { themes } })` at boot with the boot
// palette; the keys match `posawesome/frontend/src/posapp/plugins/vuetify.ts`.
import { shellAccent, type Appearance, type ThemeName } from './appearance'
import { contrast } from './color'
import { FRAPPE_THEMES } from './frappe-ui'

export interface VuetifyThemeDefinition {
  dark: boolean
  colors: Record<string, string>
}

function onColor(fill: string, theme: ThemeName): string {
  const t = FRAPPE_THEMES[theme]
  return [t['surface-base'], t['ink-gray-9'], '#ffffff', '#000000'].sort((a, b) => contrast(fill, b) - contrast(fill, a))[0] as string
}

export function vuetifyThemes(appearance: Appearance): Record<ThemeName, VuetifyThemeDefinition> {
  const accent = shellAccent(appearance)
  const build = (theme: ThemeName): VuetifyThemeDefinition => {
    const t = FRAPPE_THEMES[theme]
    const a = accent[theme]
    const status = {
      success: t['status-green-ink'],
      warning: t['status-orange-ink'],
      error: t['status-red-ink'],
      info: t['status-blue-ink'],
    }
    return {
      dark: theme === 'dark',
      colors: {
        background: t['surface-base'],
        surface: t['surface-base'],
        'surface-variant': t['surface-gray-2'],
        'surface-bright': t['surface-base'],
        'surface-light': t['surface-gray-1'],
        primary: a.accent,
        'primary-variant': a['accent-soft-ink'],
        secondary: t['ink-gray-7'],
        'secondary-variant': t['ink-gray-6'],
        accent: a.accent,
        'accent-variant': a['accent-soft-ink'],
        ...status,
        outline: t['outline-gray-2'],
        'on-primary': a['accent-ink'],
        'on-secondary': onColor(t['ink-gray-7'], theme),
        'on-background': t['ink-gray-8'],
        'on-surface': t['ink-gray-8'],
        'on-surface-variant': t['ink-gray-8'],
        'on-error': onColor(status.error, theme),
        'on-warning': onColor(status.warning, theme),
        'on-info': onColor(status.info, theme),
        'on-success': onColor(status.success, theme),
      },
    }
  }
  return { light: build('light'), dark: build('dark') }
}
