// The icons the shell names in its source, cut out of the lucide sprite at
// build time. `virtual:lucide-subset` is that cut as one string: Icon.vue
// loads it first (src/utils/lucideSprite.js) and asks for the whole sprite
// only when a name falls outside it, a view icon a user picked or an entry a
// server sends.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { LUCIDE_ALIASES, toLucideName } from '../src/utils/lucideNames.js'

const require = createRequire(import.meta.url)
export const SPRITE = join(
  dirname(require.resolve('lucide-static/package.json')),
  'sprite.svg',
)
export const VIRTUAL = 'virtual:lucide-subset'
const RESOLVED = '\0' + VIRTUAL
const SOURCE = /\.(vue|js)$/

// Where a source names an icon: a prop or key (`icon="x"`, `icon: 'x'`), a
// `lucide-x` string, or the strings of a bound prop (`:icon="a ? 'x' : 'y'"`).
const NAMED = [
  /\bicon[=:]\s*['"]([a-z0-9-]+)['"]/g,
  /['"]lucide-([a-z0-9-]+)['"]/g,
]
const BOUND = /:icon="([^"]*)"/g
const WORD = /'([a-z0-9-]+)'/g

export function collectIconNames(text, into = new Set()) {
  for (const re of NAMED) for (const m of text.matchAll(re)) into.add(m[1])
  for (const m of text.matchAll(BOUND))
    for (const w of m[1].matchAll(WORD)) into.add(w[1])
  return into
}

/** The sprite ids for the names: `lucide-` stripped, feather-era aliases resolved. */
export function toSpriteIds(names) {
  return new Set([...names].map(toLucideName))
}

/** The sprite reduced to `ids`, and the ids it does not carry. */
export function subsetSprite(sprite, ids) {
  const symbols = new Map()
  for (const m of sprite.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g))
    symbols.set(m[1], m[0])
  const kept = []
  const missing = []
  for (const id of [...ids].sort())
    if (symbols.has(id)) kept.push(symbols.get(id))
    else missing.push(id)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><defs>${kept.join('')}</defs></svg>`,
    kept: kept.length,
    missing,
  }
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (statSync(file).isDirectory()) yield* sourceFiles(file)
    else if (SOURCE.test(name)) yield file
  }
}

export function namesIn(dir) {
  const names = new Set()
  for (const file of sourceFiles(dir))
    collectIconNames(readFileSync(file, 'utf8'), names)
  return names
}

// Vite plugin: `virtual:lucide-subset` exports the subset as its default string.
export function lucideSubset({ sprite = SPRITE } = {}) {
  let root = process.cwd()
  return {
    name: 'lucide-subset',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED
    },
    load(id) {
      if (id !== RESOLVED) return
      // The aliases name icons that arrive from data: they ride along.
      const names = namesIn(join(root, 'src'))
      for (const alias of Object.keys(LUCIDE_ALIASES)) names.add(alias)
      const ids = toSpriteIds(names)
      const { svg } = subsetSprite(readFileSync(sprite, 'utf8'), ids)
      return `export default ${JSON.stringify(svg)}`
    },
  }
}
