import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { allFirst } from '@/components/ui'

// «Todas» leads every row of views (Marco, 2026-11-16). The row scrolls past
// the screen's edge on a phone, and on a desk the chips are the only way
// between views once a record fills the pane beside the list: the way back to
// everything must never be the chip out of sight. The kit puts the '' chip
// first by itself (tests/unit/muelleUiKit.test.js); this guard finds the lists
// that spell «all» another way ('todas', 'all') or that build their own row.
const root = path.resolve(__dirname, '../../src')
const ALL =
  /\b(label|title|text|name)\s*:\s*(?:__\(|t\(|_\()?\s*['"](Todas|Todos|Todo|All)['"]/g

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['vendor', 'node_modules'].includes(entry.name)) sourceFiles(p, out)
    } else if (
      /\.(vue|js|ts)$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}

// Comments blanked to spaces (newlines kept), so a comment between two
// options does not read as one more option and lines still count right.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:'"\\])\/\/[^\n]*/gm,
      (c, lead) => lead + ' '.repeat(c.length - lead.length),
    )
}

/** Every «all» option that is an array element but not the first one. */
function trailingAlls(text) {
  const s = withoutComments(text)
  const out = []
  for (const m of s.matchAll(ALL)) {
    let i = m.index
    for (let depth = 0; i >= 0; i--) {
      if (s[i] === '}') depth++
      else if (s[i] === '{') {
        if (depth === 0) break
        depth--
      }
    }
    if (i < 0) continue
    let p = i - 1
    while (p >= 0 && /\s/.test(s[p])) p--
    // `[ {…all}` leads; `( {…all})` or `= {…}` is not an element of a row
    if (s[p] !== ',') continue
    out.push({ line: s.slice(0, m.index).split('\n').length, label: m[2] })
  }
  return out
}

describe('the «all» chip leads its row', () => {
  it('finds an «all» option placed after the others', () => {
    expect(
      trailingAlls(`const A = [
  { value: 'x', label: 'Por pagar' },
  // the rest
  { value: '', label: 'Todas', filters: null },
]`),
    ).toEqual([{ line: 4, label: 'Todas' }])
    expect(
      trailingAlls(`const A = [
  // everything
  { value: '', label: __('All') },
  { value: 'x', label: 'Hoy' },
]
const any = () => ({ label: __('All'), value: '' })`),
    ).toEqual([])
  })

  it('no list in the shell puts it after another option', () => {
    const found = []
    for (const file of sourceFiles(root)) {
      const text = fs.readFileSync(file, 'utf8')
      if (!/(Todas|Todos|Todo|All)['"]/.test(text)) continue
      for (const hit of trailingAlls(text))
        found.push(`${path.relative(root, file)}:${hit.line} «${hit.label}»`)
    }
    expect(found, 'move these to the front of their list').toEqual([])
  })

  it('allFirst moves the chosen value to the front and keeps the rest in order', () => {
    const chips = [{ value: 'a' }, { value: 'b' }, { value: '' }]
    expect(allFirst(chips).map((c) => c.value)).toEqual(['', 'a', 'b'])
    expect(allFirst([{ value: 'a' }]).map((c) => c.value)).toEqual(['a'])
    expect(allFirst(chips, 'b').map((c) => c.value)).toEqual(['b', 'a', ''])
    expect(allFirst(undefined)).toEqual([])
  })
})
