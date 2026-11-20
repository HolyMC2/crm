// The whole /crm SPA speaks es-MX, not only the daily routes
// (dailySpanish.test.js): every English source string a module passes to
// __() / tr() / shellT() has a non-empty msgstr in crm/locale/es.po, under its
// context or as the bare msgid translation.js falls back to. A context may be a
// literal, a constant of the module, a constant it imports, or the default of
// the module's own tr() helper. No component passes English as a static
// placeholder / aria-label / title / label / alt / tooltip / description
// attribute or writes it as template text either, the vendored framework-ui
// included. A failure lists `file → string`: add the es-MX msgstr to
// crm/locale/es.po, or bind the attribute or text to __() (src/vendor/** is
// checked by its own package).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  importedConstants,
  looksEnglish,
  parsePo,
  shellMessageIds,
  templateLiterals,
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

// Static attribute values that are examples of what to type, not copy.
const NOT_COPY = new Set([
  'status, grand_total', // field names (Settings/Automations/WatchedFields.vue)
  'user1@example.com, user2@example.com, ...',
  'my_secure_token_123',
  'INBOX', // the IMAP folder's name
])

// Template text that reads the same for every language: a URL path shown as
// typed, product names, the upstream license notice.
const NOT_COPY_TEXT = new Set([
  '/crm-form/', // the public form's path (Forms)
  '/crm-form/ ·',
  'Google Calendar',
  'Webshop', // the social channel's name (SocialComposer)
  '© Frappe Technologies Pvt. Ltd. and contributors', // AboutModal license notice
])

/** `file → attr="value"` for each English static attribute of a component. */
export function hardCodedAttributesIn(path, src) {
  return templateLiterals(src)
    .filter(
      ({ kind, value }) =>
        kind !== 'text' && !NOT_COPY.has(value) && looksEnglish(value),
    )
    .map(
      ({ kind, value }) =>
        `${relative(SRC, path)} → ${kind}=${JSON.stringify(value)}`,
    )
}

/** `file → "text"` for each English text node of a component's template. */
export function hardCodedTextIn(path, src) {
  return templateLiterals(src)
    .filter(
      ({ kind, value }) =>
        kind === 'text' && !NOT_COPY_TEXT.has(value) && looksEnglish(value),
    )
    .map(({ value }) => `${relative(SRC, path)} → ${JSON.stringify(value)}`)
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

  it('passes no English as a static attribute', () => {
    // src/framework-ui (frappe's @framework/ui as vendored) is checked too: its
    // copy goes through __() as a recorded local change (SOURCE.json).
    const hardCoded = sources
      .filter((path) => path.endsWith('.vue'))
      .flatMap((path) =>
        hardCodedAttributesIn(path, readFileSync(path, 'utf8')),
      )
    expect(
      hardCoded,
      "bind these attributes to __('…') with an es-MX msgstr in crm/locale/es.po",
    ).toEqual([])
    expect(
      hardCodedAttributesIn(
        join(SRC, 'X.vue'),
        '<template>\n  <EmptyState description="Add one to get started." placeholder="INBOX" />\n</template>',
      ),
    ).toEqual(['X.vue → description="Add one to get started."'])
  })

  it('writes no English text in a template', () => {
    const hardCoded = sources
      .filter((path) => path.endsWith('.vue'))
      .flatMap((path) => hardCodedTextIn(path, readFileSync(path, 'utf8')))
    expect(
      hardCoded,
      "wrap this text in {{ __('…') }} with an es-MX msgstr in crm/locale/es.po",
    ).toEqual([])
    expect(
      hardCodedTextIn(
        join(SRC, 'X.vue'),
        "<template><p>Loved the demo?</p><p>{{ __('Sign up now') }}</p></template>\n<script setup>\nconst a = 'Open the list'\n</script>",
      ),
    ).toEqual(['X.vue → "Loved the demo?"'])
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
