#!/usr/bin/env node
// Re-derive the codemod's output using VALUE-EXACT accent targets.
//
// frappe-ui's codemod maps the accent ramps one step LIGHTER than the colour it
// replaces (measured in OKLCH against the compiled values of both bundles):
//
//   ink-green-3   codemod -> ink-green-6    value-exact -> ink-green-7  (d .009)
//   ink-red-4     codemod -> ink-red-8      value-exact -> ink-red-7    (d .006)
//   outline-red-2 codemod -> outline-red-3  value-exact -> outline-red-4 (d .000)
//
// This does NOT patch the codemod's output in place. Patching would mean
// renaming e.g. `ink-amber-6` -> `ink-amber-7` across a tree that also contains
// legitimately-v2 `ink-amber-6` from upstream, which is precisely the
// double-shift trap. Instead we go back to the PRE-CODEMOD content and re-run
// the same pipeline with an overridden table, so the result is correct by
// construction and independent of how many times this is run.
//
// Usage: node scripts/apply-value-exact.mjs <pre-codemod-git-ref> <listfile>

import fs from 'fs'
import { execFileSync } from 'child_process'
import {
  COLOR_TOKEN_RENAMES,
  TOKEN_RENAMES,
  mergeWeightClasses,
} from '../node_modules/frappe-ui/tailwind/migrate-tokens-v2.js'

// Measured value-preserving targets. Only the entries where the codemod and the
// measurement disagree; everything else keeps the codemod's choice.
const VALUE_EXACT = {
  'ink-amber-2': 'ink-amber-6', 'ink-amber-3': 'ink-amber-7',
  'ink-blue-2': 'ink-blue-6', 'ink-blue-3': 'ink-blue-7',
  'ink-green-2': 'ink-green-6', 'ink-green-3': 'ink-green-7',
  'ink-red-4': 'ink-red-7',
  'outline-amber-2': 'outline-amber-4', 'outline-green-2': 'outline-green-4',
  'outline-blue-2': 'outline-blue-4', 'outline-red-2': 'outline-red-4',
}

// Tokens with NO codemod rule that still resolve to a different colour in v2.
const NO_RULE_DRIFT = {
  'ink-violet-1': 'ink-violet-6',
  'surface-green-3': 'surface-green-7',
  'surface-violet-1': 'surface-violet-2',
  'outline-blue-1': 'outline-blue-3',
}

const TABLE = { ...TOKEN_RENAMES, ...VALUE_EXACT, ...NO_RULE_DRIFT }
const byLen = (a, b) => b.length - a.length
const RE = new RegExp(
  `(?<![a-zA-Z0-9])(${Object.keys(TABLE).sort(byLen).join('|')})(?![a-zA-Z0-9-])`,
  'g',
)

const [ref, listFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!ref || !listFile) {
  console.error('usage: node scripts/apply-value-exact.mjs <pre-codemod-git-ref> <listfile>')
  process.exit(2)
}

const files = fs
  .readFileSync(listFile, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

let changed = 0
const tally = {}
for (const repoPath of files) {
  const diskPath = repoPath.replace(/^frontend\//, '')
  if (!fs.existsSync(diskPath)) continue
  let before
  try {
    before = execFileSync('git', ['show', `${ref}:${repoPath}`], {
      encoding: 'utf8',
      cwd: '..',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    continue
  }
  // Same pipeline the codemod runs in `full` mode: rename, then merge weights.
  const renamed = before.replace(RE, (m) => {
    tally[`${m} -> ${TABLE[m]}`] = (tally[`${m} -> ${TABLE[m]}`] || 0) + 1
    return TABLE[m]
  })
  const { migrated } = mergeWeightClasses(renamed)
  const current = fs.readFileSync(diskPath, 'utf8')
  if (migrated !== current) {
    fs.writeFileSync(diskPath, migrated)
    changed++
  }
}

const overridden = Object.entries(tally).filter(([k]) => {
  const from = k.split(' -> ')[0]
  return from in VALUE_EXACT || from in NO_RULE_DRIFT
})
console.log(`rewrote ${changed} files from ${ref} with value-exact targets\n`)
console.log('corrections vs the codemod (value-exact + no-rule drift):')
for (const [k, n] of overridden.sort((a, b) => b[1] - a[1])) {
  const from = k.split(' -> ')[0]
  const codemodTarget = COLOR_TOKEN_RENAMES[from] || '(no rule)'
  console.log(`  ${k.padEnd(38)} x${String(n).padEnd(4)} codemod would emit: ${codemodTarget}`)
}
