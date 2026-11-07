// The build cuts the icons the source names out of the lucide sprite.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { LUCIDE_ALIASES } from '@/utils/lucideNames'
import {
  SPRITE,
  VIRTUAL,
  collectIconNames,
  lucideSubset,
  namesIn,
  subsetSprite,
  toSpriteIds,
} from '../../scripts/lucide-subset.mjs'

const MINI =
  '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">\n  <defs>\n' +
  '    <symbol id="a" viewBox="0 0 24 24">\n      <path d="M1" />\n    </symbol>\n' +
  '    <symbol id="b" viewBox="0 0 24 24">\n      <path d="M2" />\n    </symbol>\n' +
  '  </defs>\n</svg>'

describe('lucide subset', () => {
  it('finds the names a source gives an icon', () => {
    const names = collectIconNames(
      `<Icon icon="inbox" /> <Button icon="lucide-plus" />
       const entries = [{ icon: 'wrench', label: 'Taller' }]
       <Icon :icon="open ? 'chevron-up' : 'chevron-down'" />
       <Icon :icon="entry.icon" />`,
    )
    expect([...names].sort()).toEqual([
      'chevron-down',
      'chevron-up',
      'inbox',
      'lucide-plus',
      'plus',
      'wrench',
    ])
  })

  it('maps the names to sprite ids: prefix stripped, feather-era aliases resolved', () => {
    expect(toSpriteIds(new Set(['lucide-plus', 'filter', 'inbox']))).toEqual(
      new Set(['plus', 'funnel', 'inbox']),
    )
  })

  it('keeps the named symbols whole and names the misses', () => {
    const { svg, kept, missing } = subsetSprite(MINI, new Set(['zzz', 'b']))
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
        '<symbol id="b" viewBox="0 0 24 24">\n      <path d="M2" />\n    </symbol>' +
        '</defs></svg>',
    )
    expect(kept).toBe(1)
    expect(missing).toEqual(['zzz'])
  })

  // A `lucide-x` string is an icon name for sure; one the sprite does not
  // carry under that id (or its alias) draws nothing in Icon.vue.
  it('every lucide-… name the source gives an icon is a symbol of the sprite', () => {
    const sprite = readFileSync(SPRITE, 'utf8')
    const ids = new Set(
      [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]),
    )
    for (const target of Object.values(LUCIDE_ALIASES))
      expect(ids.has(target), `alias target ${target}`).toBe(true)
    const explicit = [...namesIn(path.resolve(__dirname, '../../src'))].filter(
      (name) => name.startsWith('lucide-'),
    )
    expect(explicit.length).toBeGreaterThan(20)
    const missing = [...toSpriteIds(explicit)].filter((id) => !ids.has(id))
    expect(missing).toEqual([])
  })

  it("the build's subset draws the shell's icons at a fraction of the sprite", () => {
    const plugin = lucideSubset()
    plugin.configResolved({ root: path.resolve(__dirname, '../..') })
    const id = plugin.resolveId(VIRTUAL)
    expect(plugin.resolveId('other')).toBeUndefined()
    const code = plugin.load(id)
    const svg = JSON.parse(code.replace(/^export default /, ''))
    // The picker's `lucide-plus` button; the `filter` and `more-horizontal`
    // aliases, which no source names.
    for (const name of ['plus', 'funnel', 'ellipsis'])
      expect(svg).toContain(`<symbol id="${name}"`)
    expect(svg.length).toBeLessThan(readFileSync(SPRITE, 'utf8').length / 5)
  })
})
