// The daily /crm routes (Hoy, Tratos, Deal 360, Prospectos, Contactos,
// Pendientes, Inbox and the shell around them) speak es-MX:
//   a. every English source string they pass to __() / tr() / shellT() has a
//      non-empty msgstr in crm/locale/es.po (Spanish source strings render as
//      written and need no entry);
//   b. no English is hard-coded in their templates (text, or the static
//      placeholder / aria-label / title / label / alt / tooltip attributes).
// A failure lists `file → string`: add the es-MX msgstr to crm/locale/es.po
// (or wrap the literal in __() and add it). Pure node fs, no SFC compile.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SAME_IN_BOTH,
  hasLetters,
  looksEnglish,
  parsePo,
  shellMessageIds,
  templateLiterals,
  translationCalls,
} from './helpers/spanishCopy.js'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const read = (path) => readFileSync(resolve(SRC, path), 'utf8')

const PAGES = [
  'pages/Hoy.vue',
  'pages/DealsView.vue',
  'pages/Deal360.vue',
  'pages/Deal.vue',
  'pages/Prospectos.vue',
  'pages/Prospecto.vue',
  'pages/Contactos.vue',
  'pages/Contacto.vue',
  'pages/Inbox.vue',
  'pages/Pendientes.vue',
  'pages/Importar.vue', // «Importar productos» / «Importar clientes»
]
const DIRS = [
  'components/shell',
  'components/doco/inbox', // Inbox and the Deal 360 workspace/context panel
  'components/doco/deals',
  'components/hoy',
  'components/primeros', // Hoy's «Primeros pasos» sheets (the owner's first hour)
  'components/contactos',
  'components/pendientes',
  'components/ui', // the shared phone primitives (Shell S1.1)
]
const EXTRA = [
  // Deal 360 pieces that live outside components/doco/inbox
  'components/doco/StageStepper.vue',
  'components/doco/NextActivityChip.vue',
  'components/doco/ScoreExplainPopover.vue',
  // Tratos' layouts and filters (lane ventas-parejo: the funnel's footnote
  // had slipped through in English)
  'components/doco/FunnelView.vue',
  'components/doco/BoardView.vue',
  'components/doco/ColumnPicker.vue',
  'components/doco/leads/FilterPopover.vue',
  'components/Kanban/BoardLostPrompt.vue',
  'components/ventas/DealCommercialDocs.vue',
  'utils/shellPalette.js',
  'composables/shellKeyboard.js',
  'composables/ventasNav.js',
  'composables/ventasSections.js',
  'composables/navModel.js',
  'components/shell/DesktopOnly.vue',
]
export const DAILY_FILES = [
  ...PAGES,
  ...DIRS.flatMap((dir) =>
    readdirSync(resolve(SRC, dir))
      .filter((name) => name.endsWith('.vue'))
      .sort()
      .map((name) => `${dir}/${name}`),
  ),
  ...EXTRA,
]

// Strings another lane adds to es.po; the guard waits for them instead of
// adding a duplicate entry here (union conflicts would break msgfmt).
const PENDING_IN_OTHER_LANES = new Set([])

// TODO(ARC-S2): hard-coded English in Inbox files that lane
// arc-s2-inbox-20261015 is editing; wrap them in __() once it lands.
// Format: `file → literal`.
const ARC_S2_PENDING = new Set([])

const catalog = parsePo(
  readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8'),
)
const translated = (msgid, context = '') =>
  Boolean(catalog.get(`${context}\u0004${msgid}`))

// shellT() resolves the vendored shell contracts' reviewed es-MX first.
const shellMessages = shellMessageIds(
  read('vendor/muelle-shell/contracts/messages.ts'),
)

// Labels the shell passes to __() at render time: navModel's `label: '…'`
// (shellPalette's VENTAS_PLACES are derived from them).
const navLabels = (src) =>
  [...src.matchAll(/^\s*label: '((?:[^'\\]|\\.)*)'/gm)].map((m) =>
    m[1].replace(/\\(.)/g, '$1'),
  )

// ------------------------------------------------------------ the scan
const untranslated = new Set()
const hardCoded = new Set()
const spanishLiterals = new Set()
for (const file of DAILY_FILES) {
  const src = read(file)
  const calls = translationCalls(src)
  if (
    [
      'composables/navModel.js',
      'composables/ventasNav.js',
      'utils/shellPalette.js',
    ].includes(file)
  )
    for (const label of navLabels(src))
      calls.push({ fn: '__', msgid: label, context: '' })
  for (const { fn, msgid, context, template } of calls) {
    if (template || !looksEnglish(msgid) || PENDING_IN_OTHER_LANES.has(msgid))
      continue
    const ok =
      fn === 'shellT'
        ? context
          ? translated(msgid, context)
          : shellMessages.has(msgid) || translated(msgid)
        : // translation.js falls back from `msgid:context` to the bare msgid
          translated(msgid, context) || translated(msgid)
    if (!ok)
      untranslated.add(
        `${file} → ${JSON.stringify(msgid)}${context ? ` [${context}]` : ''}`,
      )
  }
  if (!file.endsWith('.vue')) continue
  for (const { kind, value } of templateLiterals(src)) {
    const where = `${file} → ${kind === 'text' ? '' : `${kind}=`}${JSON.stringify(value)}`
    if (looksEnglish(value)) {
      if (!ARC_S2_PENDING.has(`${file} → ${value}`)) hardCoded.add(where)
    } else if (hasLetters(value) && !SAME_IN_BOTH.has(value))
      spanishLiterals.add(where)
  }
}

describe('daily /crm routes speak Spanish', () => {
  it('scans the daily files', () => {
    expect(DAILY_FILES.length).toBeGreaterThan(60)
  })

  it('has an es-MX msgstr for every English string they translate', () => {
    expect(
      [...untranslated],
      'add these msgids with an es-MX msgstr to crm/locale/es.po',
    ).toEqual([])
  })

  it('hard-codes no English in their templates', () => {
    expect(
      [...hardCoded],
      "wrap these in __('…') and add them to crm/locale/es.po",
    ).toEqual([])
  })

  it('reports Spanish literals not yet wrapped in __()', () => {
    // Tolerated for now (they render Spanish), counted so the number only
    // goes down once the catalog becomes the single source.
    console.info(
      `dailySpanish: ${spanishLiterals.size} unwrapped Spanish literals`,
    )
    expect(spanishLiterals.size).toBeGreaterThanOrEqual(0)
  })

  it('tells English from Spanish', () => {
    expect(looksEnglish('Send an Email')).toBe(true)
    expect(looksEnglish('Lost Reason is required')).toBe(true)
    expect(looksEnglish('Score')).toBe(true)
    expect(looksEnglish('Nuevo trato')).toBe(false)
    expect(looksEnglish('Sin respuesta')).toBe(false)
    expect(looksEnglish('Teléfono')).toBe(false)
    expect(looksEnglish('WhatsApp')).toBe(false)
    expect(looksEnglish('Total')).toBe(false)
  })

  it('reads es.po entries, also when no blank line separates them', () => {
    const po = parsePo(
      'msgid "A"\nmsgstr "a"\n#: x\nmsgctxt "K"\nmsgid "B"\nmsgstr ""\n"b\\n"\n\nmsgid "C"\nmsgstr ""\n',
    )
    expect([...po]).toEqual([
      ['\u0004A', 'a'],
      ['K\u0004B', 'b\n'],
      ['\u0004C', ''],
    ])
  })

  it('reads translation calls with their context', () => {
    const calls = translationCalls(
      `__('A'); __("B's", [x(1, 2)], 'Ctx'); shellT('C', [], CTX); const CTX = 'K'; tr(\`\${n} D\`)`,
    )
    expect(
      calls.map(({ msgid, context, template }) => [msgid, context, template]),
    ).toEqual([
      ['A', '', false],
      ["B's", 'Ctx', false],
      ['C', 'K', false],
      ['${n} D', '', true],
    ])
  })
})
