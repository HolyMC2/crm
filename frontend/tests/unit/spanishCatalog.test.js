// The whole /crm SPA speaks es-MX, not only the daily routes
// (dailySpanish.test.js): every English source string a module passes to
// __() / tr() / shellT() has a non-empty msgstr in crm/locale/es.po, under its
// context or as the bare msgid translation.js falls back to. A context may be a
// literal, a constant of the module, a constant it imports, or the default of
// the module's own tr() helper. A failure lists `file → string`: add the es-MX
// msgstr to crm/locale/es.po (src/vendor/** is checked by its own package).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  importedConstants,
  looksEnglish,
  parsePo,
  shellMessageIds,
  trDefaultContext,
  translationCalls,
} from './helpers/spanishCopy.js'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const catalog = parsePo(
  readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8'),
)
const translated = (msgid, context = '') =>
  Boolean(catalog.get(`${context}\u0004${msgid}`))
const shellMessages = shellMessageIds(
  readFileSync(
    resolve(SRC, 'vendor/muelle-shell/contracts/messages.ts'),
    'utf8',
  ),
)

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return name === 'vendor' ? [] : files(path)
    return /\.(vue|js|ts)$/.test(name) && !/\.(test|spec)\.[jt]s$/.test(name)
      ? [path]
      : []
  })
}

function loader(from) {
  return (specifier) => {
    const base = specifier.startsWith('@/')
      ? join(SRC, specifier.slice(2))
      : specifier.startsWith('.')
        ? resolve(dirname(from), specifier)
        : null
    if (!base) return null
    for (const path of [
      base,
      `${base}.js`,
      `${base}.ts`,
      join(base, 'index.js'),
    ])
      if (existsSync(path) && statSync(path).isFile())
        return readFileSync(path, 'utf8')
    return null
  }
}

/** `file → "msgid" [context]` for each English string without a msgstr. */
export function untranslatedIn(path, src) {
  const imported = importedConstants(src, loader(path))
  const trContext = trDefaultContext(src)
  const missing = []
  for (const call of translationCalls(src)) {
    let { context } = call
    if (context.startsWith('?') && context.slice(1) in imported)
      context = imported[context.slice(1)]
    if (call.fn === 'tr' && !context) context = trContext
    if (call.template || !looksEnglish(call.msgid)) continue
    const ok =
      call.fn === 'shellT' && !context
        ? shellMessages.has(call.msgid) || translated(call.msgid)
        : translated(call.msgid, context) || translated(call.msgid)
    if (!ok)
      missing.push(
        `${relative(SRC, path)} → ${JSON.stringify(call.msgid)}${context ? ` [${context}]` : ''}`,
      )
  }
  return missing
}

describe('the whole /crm SPA speaks Spanish', () => {
  const sources = files(SRC)

  it('scans the app, not only the daily routes', () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it('has an es-MX msgstr for every English string it translates', () => {
    const missing = sources.flatMap((path) =>
      untranslatedIn(path, readFileSync(path, 'utf8')),
    )
    expect(
      missing,
      'add these msgids with an es-MX msgstr to crm/locale/es.po',
    ).toEqual([])
  })

  it('reads the context a call gets from an import or its tr() helper', () => {
    const load = (specifier) =>
      specifier === '@/composables/useProductos'
        ? "export const CTX = 'Productos'\nexport const OTHER = 'X'"
        : null
    expect(
      importedConstants(
        "import { CTX, OTHER as O, missing } from '@/composables/useProductos'\nimport { a } from 'vue'",
        load,
      ),
    ).toEqual({ CTX: 'Productos', O: 'X' })
    expect(
      trDefaultContext("function tr(message, replace, context = 'Surtido') {}"),
    ).toBe('Surtido')
    expect(
      trDefaultContext(
        "export const CTX = 'Inventario'\nfunction tr(message, replace, context = CTX) {}",
      ),
    ).toBe('Inventario')
    expect(
      trDefaultContext('function tr(message, replace, context = null) {}'),
    ).toBe('')
  })
})
