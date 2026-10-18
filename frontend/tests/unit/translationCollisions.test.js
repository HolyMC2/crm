// Shell S1.4: one English msgid can need two Spanish words («Lines» is
// «Partidas» in Resultados and «Renglones» in Captura). Such calls carry a
// context: __('Lines', null, 'Captura') looks up «Lines:Captura» (Frappe's
// gettext key) and falls back to the bare msgid when es.po has no
// `msgctxt "Captura"` entry — silently showing the other word. So:
// 1. every literal context used in the frontend has its es.po entry;
// 2. the bare msgids known to collide keep the reviewed Spanish.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')

const unescape = (text) => text.replace(/\\(.)/g, '$1')
const bare = new Map()
const withContext = new Map()
// Line by line: entries are not always separated by a blank line.
const QUOTED = /^(msgctxt|msgid|msgstr) "((?:[^"\\]|\\.)*)"$/
let entry = {}
for (const line of po.split('\n')) {
  const m = line.match(QUOTED)
  if (!m) continue
  if (m[1] !== 'msgstr') {
    if (m[1] === 'msgctxt' || entry.done) entry = {}
    entry[m[1]] = unescape(m[2])
    continue
  }
  entry.done = true
  if (!entry.msgid) continue
  if (entry.msgctxt !== undefined)
    withContext.set(`${entry.msgid}:${entry.msgctxt}`, m[2])
  else bare.set(entry.msgid, m[2])
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return name === 'vendor' ? [] : files(path)
    return /\.(vue|js|ts|jsx)$/.test(name) ? [path] : []
  })
}

// __('Lines', null, 'Captura') and shellT-free calls with a literal context.
const CALL =
  /\b__\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*(['"])((?:\\.|(?!\3).)*)\3\s*\)/g

describe('translation collisions (S1.4)', () => {
  it('every literal __() context has its msgctxt entry in es.po', () => {
    const missing = []
    for (const file of files(SRC)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(CALL)) {
        const key = `${unescape(m[2])}:${unescape(m[4])}`
        if (!withContext.get(key))
          missing.push(`${relative(SRC, file)} → ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('bare msgids that collide keep the reviewed Spanish', () => {
    // «Collapse» was «Colapso» (a breakdown) on the sidebar's toggle.
    expect(bare.get('Collapse')).toBe('Contraer')
    // «Resume» is always «Reanudar» (a paused connector, a held order);
    // a summary is «Resumen» (msgid «Summary»), never this msgid.
    expect(bare.get('Resume')).toBe('Reanudar')
    expect(bare.get('Lines')).toBe('Partidas')
    expect(withContext.get('Lines:Captura')).toBe('Renglones')
    expect(withContext.get('Lines:Resultados')).toBe('Partidas')
    expect(withContext.get('Collapse:Bottom sheet')).toBe('Contraer')
  })
})
