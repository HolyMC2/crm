#!/usr/bin/env node
// Drive frappe-ui's tokens-v2 codemod ONE FILE AT A TIME, safely.
//
// Why not just point the codemod at a directory: its migration detection is
// per-INVOCATION, not per-file. main() collects every file into one array,
// calls detectMigrationState() once, derives ONE mode, and applies it to all of
// them. `likelyMigrated` is `post > 0`, so a single already-migrated file
// anywhere in the batch silently drops the whole run to typography-only.
// Invoking per file makes that global detector behave per-file.
//
// Why we do not simply run it per file and let the mode fall where it may:
// `migrated-typography` mode is NOT a no-op. It applies MIGRATED_TEXT_SIZE_
// RENAMES -- a DOWNWARD shift (lg->md, xl->lg) intended for apps that ran an
// earlier generation of the codemod -- and writes the file. Our files are on
// the v1 scale and need the UPWARD shift. So a file that reports
// `migrated-typography` must be left ALONE, not written to.
//
// Hence: dry-run everything first to learn each file's mode, then write only to
// files that report `full`.
//
// Usage:
//   node scripts/run-codemod.mjs --plan  <listfile>   # classify only, no writes
//   node scripts/run-codemod.mjs --apply <listfile>   # write the `full` files

import fs from 'fs'
import { spawnSync } from 'child_process'

const CODEMOD = 'node_modules/frappe-ui/tailwind/migrate-tokens-v2.js'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const listFile = args.find((a) => !a.startsWith('--'))
if (!listFile) {
  console.error('usage: node scripts/run-codemod.mjs [--plan|--apply] <listfile>')
  process.exit(2)
}

// Paths in the list are repo-relative (frontend/src/...); we run from frontend/.
const files = fs
  .readFileSync(listFile, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => p.replace(/^frontend\//, ''))

// The already-migrated warning is a console.warn, i.e. STDERR. Capturing only
// stdout silently loses it and every file looks like a clean `full` run.
const run = (file, extra = []) => {
  const r = spawnSync('node', [CODEMOD, ...extra, file], { encoding: 'utf8' })
  return (r.stdout || '') + (r.stderr || '')
}

const buckets = { full: [], typography: [], noop: [] }
for (const f of files) {
  if (!fs.existsSync(f)) continue
  const out = run(f, ['--dry-run'])
  const isMigrated = /looks already or partially migrated/.test(out)
  const changes = /would update (\d+) files, (\d+) token renames, (\d+) weight-class merges/.exec(out)
  const n = changes ? Number(changes[2]) + Number(changes[3]) : 0
  if (isMigrated) buckets.typography.push({ f, n })
  else if (n > 0) buckets.full.push({ f, n })
  else buckets.noop.push({ f, n })
}

console.log(`files considered: ${files.length}`)
console.log(`  mode=full, has changes : ${buckets.full.length}  (${buckets.full.reduce((a, x) => a + x.n, 0)} edits)`)
console.log(`  mode=migrated-typography: ${buckets.typography.length}  <- SET ASIDE, do not write`)
console.log(`  nothing to do           : ${buckets.noop.length}`)

if (buckets.typography.length) {
  console.log('\nFiles reporting `migrated-typography` (contain a v2 sentinel — hand review):')
  for (const { f, n } of buckets.typography) console.log(`  ${f}${n ? `  (${n} typography-only edits it WOULD have made)` : ''}`)
}

if (!apply) {
  console.log('\n[plan only] re-run with --apply to write the `full` files.')
  process.exit(0)
}

console.log('\napplying to `full` files...')
let changed = 0
for (const { f } of buckets.full) {
  const out = run(f)
  if (/\(\d+\)/.test(out)) changed++
}
console.log(`applied to ${changed} files.`)
