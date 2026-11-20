// The es-MX copy checks' shared reader: the es.po parser, the English
// detector and the source scanners (dailySpanish.test.js for the daily
// routes, spanishCatalog.test.js for the whole app). Pure node, no SFC compile.

// Same in English and Spanish UI, or a product name: never "English" alone.
export const SAME_IN_BOTH = new Set([
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

// shellT() resolves the vendored shell contracts' reviewed es-MX first: the
// message ids of vendor/muelle-shell/contracts/messages.ts.
export const shellMessageIds = (messagesTs) =>
  new Set(
    [
      ...messagesTs.matchAll(
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
  click tap press enter type choose pick drag drop here there anyone someone everyone
  limit limits timezone restriction restrictions line lines unavailable`.split(
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
export const hasLetters = (text) => /[a-záéíóúüñ]{2,}/i.test(text)

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
            : constantOf(src, ctx) ?? `?${ctx}`
      }
    }
    calls.push({ fn: m[1], msgid, context, template })
  }
  return calls
}

/**
 * The string constants `src` imports by name (`import { CTX } from
 * '@/composables/useProductos'`), as { localName: value }. `load(specifier)`
 * returns the imported module's source, or null when it cannot be read.
 */
export function importedConstants(src, load) {
  const constants = {}
  for (const m of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const names = m[1]
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/))
      .filter(([name]) => /^\w+$/.test(name || ''))
    if (!names.length) continue
    const module = load(m[2])
    if (!module) continue
    for (const [name, alias] of names) {
      const value = module.match(
        new RegExp(`export\\s+const\\s+${name}\\s*=\\s*'([^']*)'`),
      )
      if (value) constants[(alias || name).trim()] = value[1]
    }
  }
  return constants
}

/**
 * The context a module's own `function tr(message, replace, context = …)`
 * adds when a call names none (utils/surtidoPlan.js: 'Surtido'), or ''.
 */
export function trDefaultContext(src) {
  const m = src.match(
    /function tr\(\s*message,\s*replace,\s*context\s*=\s*(?:'([^']*)'|(\w+))\s*\)/,
  )
  if (!m) return ''
  return m[1] ?? (m[2] === 'null' ? '' : constantOf(src, m[2]) ?? '')
}

const STATIC_ATTRS = new Set([
  'placeholder',
  'aria-label',
  'title',
  'label',
  'alt',
  'tooltip',
  'description', // EmptyState
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
