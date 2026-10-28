import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// frappe-ui 1.0 menus read a group's rows from `options`; a `{ group, items }`
// group renders nothing and the menu says «No options».
const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src')
// own components whose groups really are `items`
const OWN_SHAPES = new Set([
  'components/frappe-ui/Autocomplete.vue',
  'vendor/muelle-shell/contracts/palette.ts',
])
const GROUP_WITH_ITEMS = /\bgroup:[^\n]*\n(?:\s*hideLabel:[^\n]*\n)?\s*items:/

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* sources(path)
    else if (/\.(vue|js|ts)$/.test(name)) yield path
  }
}

describe('menu groups', () => {
  it('give frappe-ui menus their rows as options, never items', () => {
    const offenders = []
    for (const path of sources(src)) {
      const rel = relative(src, path)
      if (OWN_SHAPES.has(rel)) continue
      if (GROUP_WITH_ITEMS.test(readFileSync(path, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
