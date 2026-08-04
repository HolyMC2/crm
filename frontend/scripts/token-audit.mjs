#!/usr/bin/env node
// Audit espresso v1 -> v2 token state per file, using frappe-ui's own tables.
//
// WHY THIS IS NOT A SIMPLE GREP
// -----------------------------
// The v2 colour rename table has an OVERLAPPING domain and range: it maps
// `outline-amber-2 -> outline-amber-3`, but `outline-amber-3` is itself a key
// (-> `outline-amber-4`). So a renumbered name can mean either "not yet
// converted" or "already converted", and NOTHING in the name tells you which.
// That is exactly why running the codemod twice corrupts a tree, and why this
// script reports two separate populations instead of one number:
//
//   RETIRED    names deleted outright in v2 (surface-white, ink-white,
//              outline-gray-modals, ...). The domain and range are disjoint, so
//              these are unambiguous: every occurrence is broken TODAY and
//              emits no CSS at all. Safe to rewrite mechanically.
//
//   RENUM      renumbered families (surface-gray-5/6/7, ink-<accent>-2/3/4,
//              outline-<accent>-2/3/4, ...). AMBIGUOUS in isolation. Judge them
//              by the file's state, never by the token name.
//
//   DRIFTED    names valid in BOTH versions that resolve to a different colour
//              (ink-amber-3, ink-violet-1 -> white, ...). No codemod touches
//              these. Silent. Value-preserving targets below are measured, not
//              guessed -- see the cookbook.
//
// FILE STATE, and how a t2 worker decides whether to convert:
//   NOT-MIGRATED  has RETIRED names, no v2 sentinels  -> convert; RENUM are old
//   MIGRATED      has v2 sentinels, no RETIRED names  -> DO NOT re-run a colour
//                                                        pass; RENUM are new
//   MIXED         has both -> ours merged with upstream hunks. Convert BY HAND,
//                             per hunk. A blanket pass will double-shift half.
//   UNKNOWN       neither sentinel present -> inspect; usually nothing to do
//
// Usage: node scripts/token-audit.mjs [--detail] <path...>

import fs from 'fs'
import path from 'path'
import { COLOR_TOKEN_RENAMES } from '../node_modules/frappe-ui/tailwind/migrate-tokens-v2.js'

const byLen = (a, b) => b.length - a.length
const whole = (names) =>
  new RegExp(`(?<![a-zA-Z0-9])(${names.slice().sort(byLen).join('|')})(?![a-zA-Z0-9-])`, 'g')

// A rename `from -> to` is unambiguous only when `from` is never PRODUCED by
// some other rename. If it is, seeing it in a file cannot distinguish "still
// needs converting" from "already converted once" -- that is the double-shift
// trap. (`outline-amber-2` is safe: nothing produces `-2`. `outline-amber-4` is
// not: `outline-amber-3` produces it.)
const produced = new Set(Object.values(COLOR_TOKEN_RENAMES))
const RETIRED = {}
const RENUM = {}
for (const [from, to] of Object.entries(COLOR_TOKEN_RENAMES)) {
  ;(produced.has(from) ? RENUM : RETIRED)[from] = to
}

// v2-only names: proof a file has been through the migration.
const V2_SENTINELS = [
  'surface-base', 'ink-base', 'outline-base', 'surface-sidebar',
  'surface-elevation-1', 'surface-elevation-2', 'surface-elevation-3',
  'outline-elevation-2',
]

// TRUE silent killers: names the codemod has NO rule for, which nonetheless
// resolve to a different colour in v2. The codemod only maps accent indices
// 2/3/4 for ink+outline and 5/6/7 for surface, so anything outside those ranges
// is left alone -- and in v1 the LOW indices were the saturated end. These are
// the ones no automated pass will ever touch. Targets measured in OKLCH against
// the compiled values of both bundles.
//
// Kept deliberately disjoint from the rename tables above: a token that IS a
// codemod key belongs in RETIRED/RENUM, not here. Listing it in both would
// double-count it in every total.
const DRIFTED = {
  'ink-violet-1': 'ink-violet-6',      // v1 violet/500 -> v2 pure WHITE. invisible.
  'surface-green-3': 'surface-green-7', // dark green fill -> pale mint
  'surface-violet-1': 'surface-violet-2',
  'outline-blue-1': 'outline-blue-3',
}

// Tokens the codemod DOES rewrite, but not to the value-preserving target: its
// accent maps land one step LIGHTER than the colour being replaced. Measured.
// Use these instead of COLOR_TOKEN_RENAMES[tok] when converting.
export const VALUE_EXACT_OVERRIDES = {
  'ink-amber-2': 'ink-amber-6', 'ink-amber-3': 'ink-amber-7',
  'ink-blue-2': 'ink-blue-6', 'ink-blue-3': 'ink-blue-7',
  'ink-green-2': 'ink-green-6', 'ink-green-3': 'ink-green-7',
  'ink-red-4': 'ink-red-7',
  'outline-green-2': 'outline-green-4', 'outline-blue-2': 'outline-blue-4',
  'outline-red-2': 'outline-red-4', 'outline-amber-2': 'outline-amber-4',
}

const RE = {
  retired: whole(Object.keys(RETIRED)),
  renum: whole(Object.keys(RENUM)),
  drift: whole(Object.keys(DRIFTED)),
  v2: whole(V2_SENTINELS),
}

const walk = (p, out = []) => {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      walk(path.join(p, e), out)
    }
  } else if (/\.(vue|js|jsx|ts|tsx|css)$/.test(p)) out.push(p)
  return out
}

const args = process.argv.slice(2)
const detail = args.includes('--detail')
const targets = args.filter((a) => !a.startsWith('--'))
if (!targets.length) {
  console.error('usage: node scripts/token-audit.mjs [--detail] <path...>')
  process.exit(2)
}

const hits = (s, re) => s.match(re) || []
const rows = []
for (const t of targets) {
  for (const f of walk(t)) {
    const s = fs.readFileSync(f, 'utf8')
    const retired = hits(s, RE.retired)
    const renum = hits(s, RE.renum)
    const drift = hits(s, RE.drift)
    const v2 = hits(s, RE.v2)
    if (!retired.length && !renum.length && !drift.length && !v2.length) continue
    const state =
      retired.length && v2.length ? 'MIXED'
      : retired.length ? 'NOT-MIGRATED'
      : v2.length ? 'MIGRATED'
      : 'UNKNOWN'
    rows.push({ f, state, retired, renum, drift, v2, src: s })
  }
}

const ORDER = { MIXED: 0, 'NOT-MIGRATED': 1, UNKNOWN: 2, MIGRATED: 3 }
rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.retired.length - a.retired.length)
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('state', 14) + pad('retired', 9) + pad('drift', 7) + pad('renum?', 8) + pad('v2', 5) + 'file')
for (const r of rows) {
  console.log(
    pad(r.state, 14) + pad(r.retired.length, 9) + pad(r.drift.length, 7) +
      pad(r.renum.length, 8) + pad(r.v2.length, 5) + r.f,
  )
  if (detail) {
    const show = (label, list, map) => {
      for (const [tok, n] of Object.entries(list.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {})))
        console.log(`        ${label} ${tok} x${n}${map ? '  ->  ' + map[tok] : ''}`)
    }
    // Where the codemod's target is not value-exact, show the override instead.
    const withOverrides = { ...RETIRED, ...VALUE_EXACT_OVERRIDES }
    show('RETIRED', r.retired, withOverrides)
    show('DRIFTED', r.drift, DRIFTED)
    if (r.state !== 'MIGRATED') show('renum? ', r.renum, { ...RENUM, ...VALUE_EXACT_OVERRIDES })
  }
}
const n = (k) => rows.reduce((a, r) => a + r[k].length, 0)
const c = (st) => rows.filter((r) => r.state === st).length
console.log(
  `\n${rows.length} files | RETIRED ${n('retired')} (unambiguous) | DRIFTED ${n('drift')} (silent) | renum-ambiguous ${n('renum')}`,
)
console.log(
  `states: MIXED ${c('MIXED')} (hand-migrate) | NOT-MIGRATED ${c('NOT-MIGRATED')} | MIGRATED ${c('MIGRATED')} (do NOT re-run) | UNKNOWN ${c('UNKNOWN')}`,
)
