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

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const read = (path) => readFileSync(resolve(SRC, path), 'utf8')

const PAGES = [
  'pages/Hoy.vue',
  'pages/DealsView.vue',
  'pages/Deal360.vue',
  'pages/Deal.vue',
  'pages/LeadsView.vue',
  'pages/Contactos.vue',
  'pages/Contacto.vue',
  'pages/Inbox.vue',
  'pages/Pendientes.vue',
]
const DIRS = [
  'components/shell',
  'components/doco/inbox', // Inbox and the Deal 360 workspace/context panel
  'components/doco/deals',
  'components/hoy',
  'components/contactos',
  'components/pendientes',
]
const EXTRA = [
  // Deal 360 pieces that live outside components/doco/inbox
  'components/doco/StageStepper.vue',
  'components/doco/NextActivityChip.vue',
  'components/doco/ScoreExplainPopover.vue',
  'components/ventas/DealCommercialDocs.vue',
  'utils/shellPalette.js',
  'composables/shellKeyboard.js',
  'composables/ventasNav.js',
  'composables/navModel.js',
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

// Same in English and Spanish UI, or a product name: never "English" alone.
const SAME_IN_BOTH = new Set([
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Messenger',
  'Video',
  'POS',
  'POS Awesome', // product name (navModel)
  'RO',
  'CRM',
  'Muelle',
  'Kanban',
  'Email', // es-MX UI uses «Email» too; the catalog still translates it
])

// Strings another lane adds to es.po; the guard waits for them instead of
// adding a duplicate entry here (union conflicts would break msgfmt).
const PENDING_IN_OTHER_LANES = new Set([
  // added by crm-s5-nav
  'Other lists',
  'Social',
  'Ventas',
])

// TODO(ARC-S2): hard-coded English in Inbox files that lane
// arc-s2-inbox-20261015 is editing; wrap them in __() once it lands.
// Format: `file → literal`.
const ARC_S2_PENDING = new Set([])

// ---------------------------------------------------------------- catalog
// Line-based: an entry ends at a blank line or when a comment / msgctxt /
// msgid follows its msgstr (es.po has entries with no blank line between).
const unescapePo = (s) =>
  (s || '').replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
export function parsePo(text) {
  const entries = new Map()
  let entry = {}
  let field = null
  const close = () => {
    if (entry.msgid !== undefined)
      entries.set(
        `${unescapePo(entry.msgctxt)}\u0004${unescapePo(entry.msgid)}`,
        unescapePo(entry.msgstr),
      )
    entry = {}
    field = null
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^(msgctxt|msgid|msgstr) "(.*)"\s*$/)
    const continuation = /^".*"\s*$/.test(line.trim())
    if (!line.trim() || (field === 'msgstr' && !continuation)) close()
    if (m) {
      field = m[1]
      entry[field] = m[2]
    } else if (field && continuation) entry[field] += line.trim().slice(1, -1)
  }
  close()
  return entries
}
const catalog = parsePo(
  readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8'),
)
const translated = (msgid, context = '') =>
  Boolean(catalog.get(`${context}\u0004${msgid}`))

// shellT() resolves the vendored shell contracts' reviewed es-MX first.
const shellMessages = new Set(
  [
    ...read('vendor/muelle-shell/contracts/messages.ts').matchAll(
      /^\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\w+)):/gm,
    ),
  ].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1')),
)

// ---------------------------------------------------------- the detector
// Common English UI words. A string is English when it uses one of them and
// carries no Spanish marker. Words spelled the same in Spanish UI copy
// (error, total, general, local, social, video, plan, chat, menu, no, a…) are
// deliberately left out.
const ENGLISH = new Set(
  `the an of to and or with for not this that these those your you my our its it is are was were be been
  have had do does did will would can could should must may might there here what which who when where
  why how all any each every some more most less other others only also just than then into from by on in at
  as if but about after before over under up down out off again new add added adding edit edited set view
  views send sent save saved saving delete deleted remove removed search filter filters select selected open
  opened close closed show shows hide create created update updated updating cancel apply reset clear copy
  copied paste undo redo back next previous continue done submit confirm discard keep move change changed
  load loading loaded failed fail could couldn't can't don't doesn't won't isn't unable please try retry
  deal deals lead leads contact contacts owner owners stage stages source sources status score scores
  note notes reason reasons required optional value values amount date time today tomorrow yesterday week
  month year day days hours minutes ago due overdue upcoming pending assigned assign assignee unassigned
  task tasks call calls message messages reply replies conversation conversations inbox email emails phone
  mobile number name first last full title description details detail settings setting field fields
  column columns row rows list lists board table group grouped sort sorted by order ascending descending
  page pages item items record records file files attachment attachments upload uploaded download image
  link linked unlink organization organizations company companies person people user users team member
  members role permission permissions access denied allowed sign log logged activity activities
  comment comments mention event events meeting schedule scheduled reminder reminders follow followup
  won lost win lose open probability expected closing close value pipeline forecast weighted sum average
  count each per only top tier best worst high low medium hot warm cold priority urgent
  quote quotes quotation offer offers order orders invoice invoices payment payments product products price prices
  customer customers address addresses city country state tag tags label labels type types kind
  yes none empty nothing found results result match matches matching recent recently last ago never always
  enable enabled disable disabled active inactive archived archive unarchive merge merged duplicate
  duplicates convert converted assign reassign mark marked unread read seen draft drafts sending received
  template templates canned review reviews resolve resolved snooze snoozed mute unmute pinned unpin
  help shortcut shortcuts keyboard theme dark light logout account profile language switch home
  dashboard reports report campaign campaigns forms form automations automation rules rule workload
  webshop calendar desk preview go now yet still already more less see all collapse expand minimize maximize
  something went wrong try again unknown invalid missing not available success successfully saved
  click tap press enter type choose pick drag drop here there anyone someone everyone`.split(
    /\s+/,
  ),
)
const SPANISH_WORDS = new Set(
  `de del la las el los y o en con para por un una unos unas al que es son su sus tu tus sin se lo le les
  más mas este esta estos estas ese esa eso aquí hay ya todo todos toda todas nada otro otra otros otras
  ver nuevo nueva nuevos nuevas hoy cada como cuando donde muy pero sí ni entre sobre desde hasta hacia
  según tiene tienen fue ser está están estado sin aún`.split(/\s+/),
)
const words = (text) =>
  (text.toLowerCase().match(/[a-záéíóúüñ']+/g) || []).map((w) =>
    w.replace(/^'+|'+$/g, ''),
  )
export function looksEnglish(text) {
  const t = text.trim()
  if (!t || SAME_IN_BOTH.has(t)) return false
  if (/[áéíóúüñ¿¡]/i.test(t)) return false
  const ws = words(t)
  if (ws.some((w) => SPANISH_WORDS.has(w))) return false
  return ws.some((w) => ENGLISH.has(w))
}
const hasLetters = (text) => /[a-záéíóúüñ]{2,}/i.test(text)

// ------------------------------------------------------- source scanning
// Skip a JS argument (to the next top-level `,` or `)`), honouring brackets
// and quotes; returns [argumentText, indexOfDelimiter].
function skipArg(src, i) {
  let depth = 0
  const start = i
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++
    } else if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) {
      if (depth === 0) break
      depth--
    } else if (c === ',' && depth === 0) break
  }
  return [src.slice(start, i).trim(), i]
}
const constantOf = (src, name) => {
  const m = src.match(
    new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*'([^']*)'`),
  )
  return m ? m[1] : null
}

/** [{ fn, msgid, context, template }] for every translation call in `src`. */
export function translationCalls(src) {
  const calls = []
  const re =
    /(?<![\w$.])(__|tr|shellT)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g
  for (const m of src.matchAll(re)) {
    const raw = m[2] ?? m[3] ?? m[4]
    const template = m[4] !== undefined && raw.includes('${')
    const msgid = raw.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
    let context = ''
    let i = m.index + m[0].length
    const after = () => src.slice(i).match(/^\s*/)[0].length
    i += after()
    if (src[i] === ',') {
      ;[, i] = skipArg(src, i + 1)
      if (src[i] === ',') {
        const [ctx] = skipArg(src, i + 1)
        const lit = ctx.match(/^(['"])(.*)\1$/)
        context = lit
          ? lit[2]
          : ctx === 'null' || !ctx
            ? ''
            : (constantOf(src, ctx) ?? `?${ctx}`)
      }
    }
    calls.push({ fn: m[1], msgid, context, template })
  }
  return calls
}

// Labels the shell passes to __() at render time: navModel's `label: '…'`
// and shellPalette's VENTAS_PLACES `['/path', 'Label', icon]`.
const navLabels = (src) =>
  [
    ...src.matchAll(/^\s*label: '((?:[^'\\]|\\.)*)'/gm),
    ...(src.match(/const VENTAS_PLACES = \[[\s\S]*?\n\]/)?.[0] ?? '').matchAll(
      /\['\/[^']*', '([^']+)'/g,
    ),
  ].map((m) => m[1].replace(/\\(.)/g, '$1'))

const STATIC_ATTRS = new Set([
  'placeholder',
  'aria-label',
  'title',
  'label',
  'alt',
  'tooltip',
])

/** Static text and attribute literals in the SFC's top-level <template>. */
export function templateLiterals(sfc) {
  const open = sfc.match(/^<template[^>]*>/m)
  if (!open) return []
  const start = open.index + open[0].length
  const end = sfc.lastIndexOf('\n</template>')
  const tpl = sfc.slice(start, end > start ? end : undefined)
  const out = []
  let text = ''
  const flush = () => {
    const t = text
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (t) out.push({ kind: 'text', value: t })
    text = ''
  }
  for (let i = 0; i < tpl.length; i++) {
    if (tpl.startsWith('<!--', i)) {
      flush()
      i = tpl.indexOf('-->', i) + 2
      if (i < 2) break
    } else if (tpl.startsWith('{{', i)) {
      text += ' '
      i = tpl.indexOf('}}', i) + 1
      if (i < 1) break
    } else if (tpl[i] === '<' && /[a-zA-Z/]/.test(tpl[i + 1] || '')) {
      flush()
      let j = i + 1
      for (; j < tpl.length && tpl[j] !== '>'; j++) {
        const q = tpl[j]
        if (q === '"' || q === "'") {
          const close = tpl.indexOf(q, j + 1)
          if (close < 0) break
          j = close
        }
      }
      const tag = tpl.slice(i + 1, j)
      for (const a of tag.matchAll(
        /(?:^|\s)([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
      ))
        if (STATIC_ATTRS.has(a[1]))
          out.push({ kind: a[1], value: (a[2] ?? a[3]).trim() })
      i = j
    } else text += tpl[i]
  }
  flush()
  return out
}

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
