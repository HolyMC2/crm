#!/usr/bin/env node
// For every static `import { X } from 'frappe-ui[/subpath]'` under src/ and
// tests/, checks that the installed frappe-ui still exports X from that
// subpath, and says where X lives now when it moved.
//
//   node scripts/codemods/check-frappe-ui-exports.mjs [--pkg <dir>] [--json]
//
// --pkg defaults to node_modules/frappe-ui. Exit code 1 when anything is
// missing. The export sets come from a static read of each entry file,
// following `export * from` and `export { a } from` recursively, so a name
// exported at runtime only (e.g. via a loop) would show as missing.
import fs from 'node:fs'
import path from 'node:path'
import { parseImports, walk } from './inventory-frappe-ui.mjs'

const args = process.argv.slice(2)
const pkgDir = path.resolve(
  args[args.indexOf('--pkg') + 1] || 'node_modules/frappe-ui',
)
const asJson = args.includes('--json')
const pkg = JSON.parse(
  fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
)

function resolveEntry(spec) {
  const key =
    spec === 'frappe-ui' ? '.' : './' + spec.slice('frappe-ui/'.length)
  const entry = pkg.exports[key]
  if (!entry) return null
  const file = typeof entry === 'string' ? entry : entry.import || entry.default
  return file ? path.join(pkgDir, file) : null
}

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.vue`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ])
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
  return null
}

const cache = new Map()
export function exportsOf(file, seen = new Set()) {
  if (cache.has(file)) return cache.get(file)
  const names = new Set()
  cache.set(file, names)
  if (seen.has(file) || !file) return names
  seen.add(file)
  if (file.endsWith('.vue')) {
    names.add('default')
    return names
  }
  // Comments inside an export block would otherwise read as names.
  const text = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const m of text.matchAll(
    /export\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]/g,
  ))
    names.add(m[1])
  for (const m of text.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveRelative(file, m[1])
    if (target)
      for (const n of exportsOf(target, seen)) if (n !== 'default') names.add(n)
  }
  for (const m of text.matchAll(
    /export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s+['"][^'"]+['"])?/g,
  ))
    for (const part of m[1].split(',')) {
      const t = part.trim().replace(/^type\s+/, '')
      if (!t) continue
      const [, alias] = t.split(/\s+as\s+/)
      names.add((alias || t).trim())
    }
  for (const m of text.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|type|interface|abstract\s+class)\s+([\w$]+)/g,
  ))
    names.add(m[1])
  if (/export\s+default\b/.test(text)) names.add('default')
  return names
}

const subpaths = Object.keys(pkg.exports)
  .filter(
    (k) => !k.includes('*') && !k.endsWith('.css') && !k.endsWith('.json'),
  )
  .map((k) => (k === '.' ? 'frappe-ui' : 'frappe-ui/' + k.slice(2)))
const exportSets = new Map()
for (const sp of subpaths) {
  const entry = resolveEntry(sp)
  if (entry && fs.existsSync(entry) && /\.(ts|js|mjs)$/.test(entry))
    exportSets.set(sp, exportsOf(entry))
}

const missing = new Map()
let checked = 0
for (const root of ['src', 'tests'].filter((d) => fs.existsSync(d)))
  for (const file of walk(root)) {
    for (const site of parseImports(fs.readFileSync(file, 'utf8'))) {
      if (!site.from.startsWith('frappe-ui')) continue
      const set = exportSets.get(site.from)
      for (const name of site.names) {
        if (name.startsWith('dynamic:')) continue
        checked += 1
        const bare = name.startsWith('default:') ? 'default' : name
        if (set && set.has(bare)) continue
        const key = `${bare}\t${site.from}`
        if (!missing.has(key)) missing.set(key, [])
        missing.get(key).push(`${file}:${site.line}`)
      }
    }
  }

const rows = [...missing.entries()]
  .map(([key, sites]) => {
    const [name, from] = key.split('\t')
    const now = subpaths.filter(
      (sp) => sp !== from && exportSets.get(sp)?.has(name),
    )
    return { name, from, files: sites.length, now, sites }
  })
  .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name))

if (asJson) console.log(JSON.stringify(rows, null, 2))
else {
  console.log(
    `frappe-ui ${pkg.version}: ${checked} import names checked, ${rows.length} missing (name, from) pairs`,
  )
  for (const r of rows)
    console.log(
      `${String(r.files).padStart(4)}  ${r.name}  from '${r.from}'  ->  ${r.now.length ? r.now.join(', ') : 'REMOVED'}`,
    )
}
process.exit(rows.length ? 1 : 0)
