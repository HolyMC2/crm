import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { applyShellAppearance } from '@/utils/shellAppearance'
import {
  appearanceFrom,
  materialRoles,
  shellAccent,
} from '@/vendor/muelle-shell/tokens'

// The shop's colour reaches the shell as a <style id="muelle-accent"> written
// at boot. Since @muelle/tokens 0.2.0 it carries the Material roles derived
// from that colour (tonal surfaces, the selected pair, the hairline) beside
// the accent, so the kit's tone follows the shop's palette, not only Gris.
const ROLES = [
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
  'secondary-container',
  'on-secondary-container',
  'on-surface-variant',
  'outline',
  'outline-variant',
  'accent-hover',
  'inverse-surface',
  'inverse-on-surface',
]
const MORADO = {
  accent: '#6e399d',
  accent_light: '#6e399d',
  accent_light_ink: '#ffffff',
  accent_dark: '#b168e8',
  accent_dark_ink: '#16222a',
  tone: 'neutral',
}
const sheet = () => document.getElementById('muelle-accent').textContent
const blocks = (css) => css.split(":root[data-theme='dark']")

beforeEach(() => document.getElementById('muelle-accent')?.remove())

describe('applyShellAppearance', () => {
  it('writes the accent and every Material role for both themes', () => {
    applyShellAppearance(MORADO)
    const [light, dark] = blocks(sheet())
    const roles = materialRoles(appearanceFrom(MORADO))
    expect(light).toContain('--muelle-accent: #6e399d;')
    expect(dark).toContain('--muelle-accent: #b168e8;')
    for (const name of ROLES) {
      expect(light).toContain(`--muelle-${name}: ${roles.light[name]};`)
      expect(dark).toContain(`--muelle-${name}: ${roles.dark[name]};`)
    }
    // A coloured shop tints its surfaces; the page itself stays in tokens.css.
    expect(roles.light['surface-container-low']).toBe('#f9f7fb')
    expect(sheet()).not.toContain('--muelle-surface-base')
  })

  it('keeps one style element and replaces it on the next palette', () => {
    applyShellAppearance(MORADO)
    applyShellAppearance({ accent: '#0070cc' })
    expect(document.querySelectorAll('#muelle-accent')).toHaveLength(1)
    expect(sheet()).toContain('--muelle-accent: #0070cc;')
    expect(sheet()).not.toContain('#6e399d')
  })

  it('without a palette it is Gris, the same values tokens.css ships', () => {
    applyShellAppearance(null)
    const css = readFileSync(
      resolve(__dirname, '../../src/vendor/muelle-shell/tokens/tokens.css'),
      'utf8',
    )
    const lines = sheet()
      .split('\n')
      .filter((line) => line.includes('--muelle-'))
    expect(lines).toHaveLength(2 * (4 + ROLES.length))
    for (const line of lines) expect(css).toContain(line)
    expect(shellAccent(appearanceFrom(null)).light.accent).toBe('#171717')
  })
})

describe('the vendored token sheet', () => {
  const css = readFileSync(
    resolve(__dirname, '../../src/vendor/muelle-shell/tokens/tokens.css'),
    'utf8',
  )
  const [light, dark] = blocks(css)

  it('declares the Material roles in both themes', () => {
    for (const name of ROLES) {
      expect(light).toContain(`--muelle-${name}:`)
      expect(dark).toContain(`--muelle-${name}:`)
    }
  })

  it('declares the shape scale and the two elevation tokens', () => {
    for (const declaration of [
      '--muelle-shape-xs: 4px;',
      '--muelle-shape-sm: 8px;',
      '--muelle-shape-md: 12px;',
      '--muelle-shape-lg: 16px;',
      '--muelle-shape-xl: 20px;',
      '--muelle-shape-2xl: 28px;',
      '--muelle-shape-chip: 8px;',
      '--muelle-elevation-edge: 0 0 0 1px var(--muelle-outline-variant);',
    ])
      expect(light).toContain(declaration)
    expect(light).toContain('--muelle-elevation-float:')
    expect(dark).toContain(
      '--muelle-elevation-float: var(--muelle-elevation-edge);',
    )
  })
})
