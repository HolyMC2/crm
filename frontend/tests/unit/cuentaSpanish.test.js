// Mi cuenta and Mi perfil speak es-MX: every string their files pass to __()
// or to the module's `t` (context «Cuenta», «Perfil») has an es-MX msgstr in
// crm/locale/es.po, and no price says «+ IVA» (Muelle's prices include IVA).
// Pure node fs.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const FILES = [
  ...readdirSync(resolve(SRC, 'components/cuenta')).map(
    (name) => `components/cuenta/${name}`,
  ),
  'pages/Cuenta.vue',
  'components/shell/cuentaDoor.js',
]
const PERFIL_FILES = [
  ...readdirSync(resolve(SRC, 'components/perfil')).map(
    (name) => `components/perfil/${name}`,
  ),
  'pages/Perfil.vue',
]

const unescape = (text) =>
  text.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
function catalog() {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const entries = new Map()
  for (const block of po.split(/\n\s*\n/)) {
    const ctx = block.match(/^msgctxt "((?:[^"\\]|\\.)*)"/m)
    const id = block.match(/^msgid ((?:"(?:[^"\\]|\\.)*"\n?)+)/m)
    const str = block.match(/^msgstr ((?:"(?:[^"\\]|\\.)*"\n?)+)/m)
    if (!id || !str) continue
    const join = (part) =>
      [...part.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .map((m) => unescape(m[1]))
        .join('')
    entries.set(
      `${ctx ? unescape(ctx[1]) : ''}\u0004${join(id[1])}`,
      join(str[1]),
    )
  }
  return entries
}

const LITERAL = `'((?:[^'\\\\]|\\\\.)*)'`
function strings(source) {
  const found = new Set()
  for (const pattern of [
    new RegExp(`(?<![\\w.])__\\(\\s*${LITERAL}`, 'g'),
    new RegExp(`(?<![\\w.])t\\(\\s*${LITERAL}`, 'g'),
  ])
    for (const m of source.matchAll(pattern)) found.add(unescape(m[1]))
  for (const m of source.matchAll(
    new RegExp(`plural\\(\\s*[^,]+,\\s*${LITERAL}\\s*,\\s*${LITERAL}`, 'gs'),
  )) {
    found.add(unescape(m[1]))
    found.add(unescape(m[2]))
  }
  return found
}

describe('Mi cuenta in es-MX', () => {
  const po = catalog()

  it('every string of its files has a Spanish entry under «Cuenta»', () => {
    const missing = []
    for (const file of FILES) {
      const source = readFileSync(resolve(SRC, file), 'utf8')
      // translation.js falls back from `msgid:context` to the bare msgid.
      for (const msgid of strings(source))
        if (!po.get(`Cuenta\u0004${msgid}`) && !po.get(`\u0004${msgid}`))
          missing.push(`${file} → ${msgid}`)
    }
    expect(missing).toEqual([])
  })

  it('every string of Mi perfil has a Spanish entry under «Perfil»', () => {
    const missing = []
    for (const file of PERFIL_FILES) {
      const source = readFileSync(resolve(SRC, file), 'utf8')
      for (const msgid of strings(source))
        if (!po.get(`Perfil\u0004${msgid}`) && !po.get(`\u0004${msgid}`))
          missing.push(`${file} → ${msgid}`)
    }
    expect(missing).toEqual([])
  })

  it('no price says «+ IVA»', () => {
    for (const file of FILES)
      expect(readFileSync(resolve(SRC, file), 'utf8'), file).not.toMatch(
        /\+\s*IVA/,
      )
    for (const [key, value] of po)
      if (key.startsWith('Cuenta\u0004'))
        expect(value, key).not.toMatch(/\+\s*IVA/)
  })
})
