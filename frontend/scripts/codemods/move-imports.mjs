#!/usr/bin/env node
// Moves imports from one module specifier to another under src/ and tests/.
//
//   node scripts/codemods/move-imports.mjs --from frappe-ui/frappe --to @framework/ui
//     every `import … from 'frappe-ui/frappe'`, `import('frappe-ui/frappe')` and
//     `vi.mock('frappe-ui/frappe', …)` now names '@framework/ui'.
//
//   node scripts/codemods/move-imports.mjs --from frappe-ui --to frappe-ui/experimental \
//        --names ListView,ListHeader,ListFooter
//     only the listed names leave each `import { … } from 'frappe-ui'` statement
//     and land in a new `import { … } from 'frappe-ui/experimental'` right after
//     it (merged into an existing import from that specifier in the same file
//     when there is one). Statements left empty are removed.
//
//   --dry   prints the files it would change and exits.
//   --root <dir>…  limits the walk (default: src tests).
//
// Run from frontend/. Prints one line per changed file. Rerunning is a no-op.
import fs from 'node:fs'
import { walk } from './inventory-frappe-ui.mjs'

const args = process.argv.slice(2)
const opt = (k) => {
  const i = args.indexOf(k)
  return i === -1 ? null : args[i + 1]
}
const from = opt('--from')
const to = opt('--to')
const names = opt('--names')?.split(',').map((s) => s.trim()).filter(Boolean) || null
const dry = args.includes('--dry')
const roots = args.includes('--root')
  ? args.slice(args.indexOf('--root') + 1).filter((a) => !a.startsWith('--') && a !== to)
  : ['src', 'tests']
if (!from || !to) {
  console.error('usage: move-imports.mjs --from <spec> --to <spec> [--names a,b] [--dry]')
  process.exit(2)
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const SPEC = `['"]${esc(from)}['"]`
const WHOLE_IMPORT = new RegExp(
  `(import\\s+(?:type\\s+)?(?:(?:[\\w$]+\\s*,\\s*)?\\{[^}]*\\}|[\\w$]+|\\*\\s+as\\s+[\\w$]+)\\s+from\\s+)${SPEC}`,
  'g',
)
const DYNAMIC = new RegExp(`(import\\(\\s*)${SPEC}(\\s*\\))`, 'g')
const VI_MOCK = new RegExp(`(vi\\.(?:mock|doMock|unmock|importActual|importMock)\\(\\s*)${SPEC}`, 'g')
const NAMED_IMPORT = new RegExp(
  `import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+${SPEC}([ \\t]*;?)`,
  'g',
)

export function moveWhole(text) {
  return text
    .replace(WHOLE_IMPORT, `$1'${to}'`)
    .replace(DYNAMIC, `$1'${to}'$2`)
    .replace(VI_MOCK, `$1'${to}'`)
}

function splitClause(clause) {
  return clause
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function bareName(entry) {
  return entry.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
}

export function moveNames(text) {
  const moving = []
  let out = text.replace(NAMED_IMPORT, (whole, typeKw, clause, tail) => {
    const entries = splitClause(clause)
    const stay = entries.filter((e) => !names.includes(bareName(e)))
    const go = entries.filter((e) => names.includes(bareName(e)))
    if (!go.length) return whole
    moving.push(...go)
    if (!stay.length) return '\u0000REMOVED\u0000'
    const multiline = clause.includes('\n')
    const body = multiline ? `\n  ${stay.join(',\n  ')},\n` : ` ${stay.join(', ')} `
    return `import ${typeKw || ''}{${body}} from '${from}'${tail}`
  })
  if (!moving.length) return text
  const unique = [...new Set(moving)]
  const existing = new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${esc(to)}['"]`)
  const m = out.match(existing)
  if (m) {
    const merged = [...new Set([...splitClause(m[1]), ...unique])]
    out = out.replace(existing, `import { ${merged.join(', ')} } from '${to}'`)
    out = out.replace(/\n?\u0000REMOVED\u0000/g, '')
  } else {
    const line = `import { ${unique.join(', ')} } from '${to}'`
    // The new statement takes the place of the first statement we touched.
    const first = out.indexOf('\u0000REMOVED\u0000')
    const firstKept = out.search(new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\}\\s+from\\s+${SPEC}`))
    const at = [first, firstKept].filter((i) => i >= 0).sort((a, b) => a - b)[0]
    if (first === at) out = out.replace('\u0000REMOVED\u0000', line)
    else {
      const end = out.indexOf('\n', at)
      out = out.slice(0, end + 1) + line + '\n' + out.slice(end + 1)
    }
    out = out.replace(/\n?\u0000REMOVED\u0000/g, '')
  }
  return out
}

let changed = 0
for (const root of roots.filter((d) => fs.existsSync(d)))
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8')
    const next = names ? moveNames(text) : moveWhole(text)
    if (next === text) continue
    changed += 1
    console.log(file)
    if (!dry) fs.writeFileSync(file, next)
  }
console.log(`${dry ? 'would change' : 'changed'} ${changed} files`)
