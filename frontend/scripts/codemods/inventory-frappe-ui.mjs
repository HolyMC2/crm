#!/usr/bin/env node
// Lists every static import from frappe-ui (and its subpaths) under src/ and
// tests/, grouped by imported name: how many files import it and from where.
//
//   node scripts/codemods/inventory-frappe-ui.mjs            # summary table
//   node scripts/codemods/inventory-frappe-ui.mjs --name ListView   # path:line per site
//   node scripts/codemods/inventory-frappe-ui.mjs --from frappe-ui/frappe
//
// Run from frontend/. Reads .vue, .js, .jsx, .ts, .tsx. Multi-line import
// statements are joined before parsing; dynamic `import('frappe-ui...')` sites
// are listed separately as `dynamic:<specifier>`.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (k) => {
  const i = args.indexOf(k)
  return i === -1 ? null : args[i + 1]
}
const onlyName = opt('--name')
const onlyFrom = opt('--from')
const roots = ['src', 'tests'].filter((d) => fs.existsSync(d))
const exts = new Set(['.vue', '.js', '.jsx', '.ts', '.tsx'])

export function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      yield* walk(p)
    } else if (exts.has(path.extname(entry.name))) yield p
  }
}

const IMPORT_RE =
  /import\s+(type\s+)?((?:[\w$]+\s*,\s*)?\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]((?:frappe-ui|frappe-ui-components)(?:\/[^'"]*)?)['"]/g
const DYNAMIC_RE =
  /import\(\s*['"]((?:frappe-ui|frappe-ui-components)(?:\/[^'"]*)?)['"]\s*\)/g

export function parseImports(text) {
  const sites = []
  const lineOf = (idx) => text.slice(0, idx).split('\n').length
  for (const m of text.matchAll(IMPORT_RE)) {
    const clause = m[2].trim()
    const from = m[3]
    const line = lineOf(m.index)
    const names = []
    const braces = clause.match(/\{([\s\S]*)\}/)
    const outside = clause.replace(/\{[\s\S]*\}/, '')
    for (const part of outside.split(',')) {
      const t = part.trim()
      if (!t) continue
      if (t.startsWith('* as ')) names.push(`*${t.slice(5).trim()}`)
      else names.push(`default:${t}`)
    }
    if (braces)
      for (const part of braces[1].split(',')) {
        const t = part.trim().replace(/^type\s+/, '')
        if (!t) continue
        names.push(t.split(/\s+as\s+/)[0].trim())
      }
    sites.push({ from, names, line, statement: m[0] })
  }
  for (const m of text.matchAll(DYNAMIC_RE))
    sites.push({
      from: m[1],
      names: [`dynamic:${m[1]}`],
      line: lineOf(m.index),
      statement: m[0],
    })
  return sites
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const byName = new Map()
  for (const root of roots)
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const site of parseImports(text)) {
        if (onlyFrom && site.from !== onlyFrom) continue
        for (const name of site.names) {
          if (onlyName && name !== onlyName) continue
          const key = `${name}\t${site.from}`
          if (!byName.has(key)) byName.set(key, [])
          byName.get(key).push(`${file}:${site.line}`)
        }
      }
    }
  const rows = [...byName.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )
  if (onlyName || onlyFrom) {
    for (const [key, sites] of rows) {
      console.log(`## ${key.replace('\t', '  from ')}  (${sites.length})`)
      for (const s of sites) console.log(`  ${s}`)
    }
  } else {
    console.log('files\tname\tfrom')
    for (const [key, sites] of rows) console.log(`${sites.length}\t${key}`)
    const files = new Set(
      rows.flatMap(([, s]) => s.map((x) => x.split(':')[0])),
    )
    console.log(
      `\n# ${rows.length} distinct (name, from) pairs across ${files.size} files`,
    )
  }
}
