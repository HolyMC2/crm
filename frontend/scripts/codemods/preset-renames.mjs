#!/usr/bin/env node
// The frappe-ui 1.0.2 Tailwind preset renames, one mechanical rename per run so
// each lands as its own commit (docs/FRAPPE_UI_1.md §6, B9):
//
//   --surface-white   bg-surface-white → bg-surface-base. 1.0.2 ships no
//                     `--surface-white`, so the 33 sites painted nothing.
//   --text-base-medium  `text-base font-medium` → `text-base-medium` (the
//                     preset's text-style utility: 14px, 1.35, weight 500 and
//                     its own tracking). Only when both classes sit next to
//                     each other in one class list.
//   --dark-redundant  drop a `dark:` variant that restates a semantic token
//                     when its light counterpart on the same element is a
//                     semantic token of the same property: identical pairs
//                     (`text-ink-gray-8 dark:text-ink-gray-8`) for any
//                     property, and one-step ink shifts for text
//                     (`text-ink-gray-8 dark:text-ink-gray-7`). Semantic inks
//                     flip under `[data-theme=dark]` by themselves; these
//                     overrides date from the v1 tokens that did not.
//                     Left alone: `dark:bg-surface-gray-1` next to
//                     `bg-surface-base` (an elevation step, a design intent,
//                     listed in the doc) and `dark:` on a raw palette colour
//                     (`amber-300/15`, `black/60`), the only thing theming it.
//
// Radius aliases are not here: frappe-ui's own `tailwind/migrate-tokens-v2.js
// --radius-only` renames them (idempotent).
//
// Usage: node scripts/codemods/preset-renames.mjs <--surface-white|--text-base-medium|--dark-redundant> [--dry] [dir...]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const mode = args.find((a) =>
  /^--(surface-white|text-base-medium|dark-redundant)$/.test(a),
)
const roots = args.filter((a) => !a.startsWith('--'))
if (!mode) {
  console.error(
    'pick one: --surface-white | --text-base-medium | --dark-redundant',
  )
  process.exit(2)
}
if (!roots.length) roots.push('src')

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (/\.(vue|js|ts|css)$/.test(p)) yield p
  }
}

const SEMANTIC =
  /^(bg|text|border|ring|divide|placeholder|outline)-(surface|ink|outline)-[a-z0-9-]+(\/\d+)?$/
const PROPERTY = (cls) => cls.replace(/^([a-z]+)-.*$/, '$1')

// Rewrites one class list (the inside of class="…" or an @apply). Returns the
// new list and what changed.
function rewriteClassList(list) {
  const changes = []
  let out = list
  if (mode === '--surface-white') {
    out = out.replace(/\bbg-surface-white\b/g, () => {
      changes.push('bg-surface-white → bg-surface-base')
      return 'bg-surface-base'
    })
  } else if (mode === '--text-base-medium') {
    out = out.replace(
      /\btext-base font-medium\b|\bfont-medium text-base\b/g,
      () => {
        changes.push('text-base font-medium → text-base-medium')
        return 'text-base-medium'
      },
    )
  } else if (mode === '--dark-redundant') {
    const classes = out.split(/(\s+)/)
    const plain = classes.filter((c) => c.trim() && !c.includes(':'))
    const byProperty = new Map()
    for (const c of plain) if (SEMANTIC.test(c)) byProperty.set(PROPERTY(c), c)
    const kept = []
    for (let i = 0; i < classes.length; i++) {
      const c = classes[i]
      const m = c.match(
        /^dark:([a-z]+-(?:surface|ink|outline)-[a-z0-9-]+(?:\/\d+)?)$/,
      )
      const light = m && byProperty.get(PROPERTY(m[1]))
      if (light && (light === m[1] || PROPERTY(m[1]) === 'text')) {
        changes.push(`${c} (light: ${byProperty.get(PROPERTY(m[1]))})`)
        // swallow the separator before it too
        if (kept.length && /^\s+$/.test(kept[kept.length - 1])) kept.pop()
        continue
      }
      kept.push(c)
    }
    out = kept.join('').replace(/^\s+/, '')
  }
  return { out, changes }
}

// Class contexts: static `class="…"`, template-literal / quoted strings inside
// `:class` and JS, and `@apply … ;`. Anything else (prose, comments) is left.
const CONTEXTS = [
  /(class=")([^"]*)(")/g,
  /(@apply\s+)([^;]+)(;)/g,
  /(')([^'\n]*)(')/g,
  /(`)([^`]*)(`)/g,
]

let total = 0
const touched = []
for (const root of roots) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8')
    let next = src
    const fileChanges = []
    for (const re of CONTEXTS) {
      next = next.replace(re, (whole, open, body, close) => {
        if (!/\b(surface-white|text-base|font-medium|dark:)/.test(body))
          return whole
        const { out, changes } = rewriteClassList(body)
        if (!changes.length) return whole
        fileChanges.push(...changes)
        return `${open}${out}${close}`
      })
    }
    if (fileChanges.length) {
      total += fileChanges.length
      touched.push(file)
      console.log(`${file}: ${fileChanges.length}`)
      for (const c of fileChanges) console.log(`  ${c}`)
      if (!dry) fs.writeFileSync(file, next)
    }
  }
}
console.log(
  `${dry ? 'would rewrite' : 'rewrote'} ${total} site(s) in ${touched.length} file(s)`,
)
