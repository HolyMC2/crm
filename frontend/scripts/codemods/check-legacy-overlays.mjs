#!/usr/bin/env node
// Finds the frappe-ui 1.0.0-beta.29 overlay surfaces that 1.0.2 drops silently
// (no compile error, the prop or slot just stops doing anything), so none creeps
// back after the FUI1 migration. `tests/unit/legacyOverlays.test.js` asserts the
// list is empty for src/.
//
//   Dialog     :options, disableOutsideClickToClose, #body / #body-content /
//              #body-title, a template ref used for .close() / .open()
//   Popover    placement, v-model:show / @update:show, transition, #target /
//              #body / #body-main
//   Tooltip    placement, #body, a hover-delay below 10 (seconds, 1.0.2 is ms)
//   HoverCard  placement, a hover-delay below 10
//   Dropdown   placement
//   DatePicker, DateTimePicker, DateRangePicker: placement, #suffix / #prefix /
//              #trigger reading { togglePopover } or { isOpen }
//
// Only frappe-ui's components count: crm's own Link, Autocomplete and
// IconPicker still hand out `togglePopover` from their own slots.
//
// Usage: node scripts/codemods/check-legacy-overlays.mjs [--json] [dir...]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const COMPONENTS = new Set([
  'Dialog',
  'Popover',
  'Tooltip',
  'HoverCard',
  'Dropdown',
  'DatePicker',
  'DateTimePicker',
  'DateRangePicker',
])
const LEGACY_SLOTS = {
  Dialog: ['body', 'body-content', 'body-title'],
  Popover: ['target', 'body', 'body-main'],
  Tooltip: ['body'],
}
const PICKERS = new Set(['DatePicker', 'DateTimePicker', 'DateRangePicker'])

export function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (p.endsWith('.vue')) yield p
  }
}

// Every opening tag of a watched component: { name, attrs, line, end }. The
// scanner respects quotes, so a `>` inside an expression does not end the tag.
function* openingTags(src) {
  const re = /<([A-Z][\w]*)\b/g
  let m
  while ((m = re.exec(src))) {
    const name = m[1]
    if (!COMPONENTS.has(name)) continue
    let i = re.lastIndex
    let quote = null
    while (i < src.length) {
      const ch = src[i]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '>') break
      i++
    }
    yield {
      name,
      attrs: src.slice(re.lastIndex, i),
      line: src.slice(0, m.index).split('\n').length,
      end: i,
      selfClosing: src[i - 1] === '/',
    }
  }
}

// The slot templates directly inside a component: the `<template #x>` that are
// not nested inside another component tag between `start` and the matching
// close. Good enough for SFC templates, which nest components by indentation.
function slotTemplates(src, tag) {
  if (tag.selfClosing) return []
  const close = new RegExp(`</${tag.name}>`, 'g')
  close.lastIndex = tag.end
  const closeAt = close.exec(src)?.index ?? src.length
  const body = src.slice(tag.end, closeAt)
  const out = []
  const re = /<template\s+(?:#|v-slot:)([\w-]+)(?:="([^"]*)")?/g
  let m
  while ((m = re.exec(body))) {
    // Skip templates of a nested watched component (their own opening tag
    // appears before this template inside `body`).
    const before = body.slice(0, m.index)
    const nested = [...before.matchAll(/<([A-Z]\w*)\b/g)].filter((x) =>
      COMPONENTS.has(x[1]),
    )
    const closed = [...before.matchAll(/<\/([A-Z]\w*)>/g)].filter((x) =>
      COMPONENTS.has(x[1]),
    )
    if (nested.length > closed.length) continue
    out.push({
      slot: m[1],
      props: m[2] || '',
      line: tag.line + (src.slice(tag.end, tag.end + m.index).split('\n').length - 1),
    })
  }
  return out
}

function refNames(attrs) {
  const m = attrs.match(/\sref="([\w$]+)"/)
  return m ? [m[1]] : []
}

export function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  const found = []
  const hit = (line, what) => found.push({ file, line, what })
  const dialogRefs = []
  for (const tag of openingTags(src)) {
    const { name, attrs, line } = tag
    if (/\s:?placement=/.test(attrs) && name !== 'Dialog')
      hit(line, `${name} placement → side / align`)
    if (name === 'Dialog') {
      if (/\s:options=/.test(attrs)) hit(line, 'Dialog :options → flat props')
      if (/disableOutsideClickToClose/.test(attrs))
        hit(line, 'Dialog disableOutsideClickToClose → dismissible')
      dialogRefs.push(...refNames(attrs))
    }
    if (name === 'Popover') {
      if (/v-model:show|@update:show|:show=/.test(attrs))
        hit(line, 'Popover v-model:show → v-model:open')
      if (/\stransition=/.test(attrs)) hit(line, 'Popover transition (dropped)')
    }
    if (name === 'Tooltip' || name === 'HoverCard') {
      const d = attrs.match(/:hover-?[dD]elay="(\d+(?:\.\d+)?)"/)
      if (d && Number(d[1]) > 0 && Number(d[1]) < 10)
        hit(line, `${name} hover-delay ${d[1]} is in seconds (1.0.2 takes ms)`)
    }
    for (const t of slotTemplates(src, tag)) {
      if ((LEGACY_SLOTS[name] || []).includes(t.slot))
        hit(t.line, `${name} #${t.slot} (legacy slot)`)
      if (
        (PICKERS.has(name) || name === 'Popover') &&
        /\b(togglePopover|isOpen)\b/.test(t.props)
      )
        hit(t.line, `${name} #${t.slot} reads { ${t.props.match(/togglePopover|isOpen/)[0]} } (1.0.2 passes { open, close, setOpen })`)
    }
  }
  for (const ref of dialogRefs) {
    const re = new RegExp(`\\b${ref}(?:\\.value)?\\.(close|open)\\(`, 'g')
    let m
    while ((m = re.exec(src)))
      hit(src.slice(0, m.index).split('\n').length, `Dialog ref ${ref}.${m[1]}() (1.0.2 exposes nothing; drive v-model:open)`)
  }
  return found
}

export function scan(roots) {
  const found = []
  for (const root of roots) for (const f of walk(root)) found.push(...scanFile(f))
  return found
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const roots = args.filter((a) => !a.startsWith('--'))
  if (!roots.length) roots.push('src')
  const found = scan(roots)
  if (asJson) console.log(JSON.stringify(found, null, 2))
  else {
    for (const f of found) console.log(`${f.file}:${f.line}: ${f.what}`)
    console.log(found.length ? `${found.length} legacy overlay site(s)` : 'no legacy overlay sites')
  }
  process.exit(found.length ? 1 : 0)
}
