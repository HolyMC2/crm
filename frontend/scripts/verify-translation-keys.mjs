// Fails the build when a string the UI translates is missing from
// translation-keys.json, the list the server ships translations for
// (crm/shell_dictionary.py). It reads every `__()` call in the sources of the
// modules this build contains, independently of how the plugin collected the
// list, so a key the plugin drops cannot reach production untranslated.
// `node scripts/verify-translation-keys.mjs [outDir]`
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExpressionAt, tokenizer, tokTypes } from 'acorn'
import { KEYS_FILE } from './translation-keys.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')

const SOURCE = /\.(vue|[cm]?[jt]sx?)$/
const CALL = /(?<![\w$])__\(/g
// Comments that mention __('…') are not calls. Blanked to spaces so offsets stay put.
const COMMENT = /<!--[\s\S]*?-->|(?<=^|\s)\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*/g
const blank = (text) => text.replace(/[^\n]/g, ' ')

function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked
  }
  return null
}

// TypeScript or template syntax acorn cannot parse as a whole call: the
// message is still the first token.
function firstToken(rest) {
  try {
    const token = tokenizer(rest, { ecmaVersion: 'latest' }).getToken()
    return token.type === tokTypes.string ? token.value : null
  } catch {
    return null
  }
}

// `__('Save')`, `__("Save")`, `` __(`Save`) ``, and `__('Open', null, 'Compras')`
// as the context key `Open:Compras`. Calls whose message is not a literal are
// runtime values: the server covers those with its DocType and record rules.
export function translationCalls(text) {
  const source = text.replace(COMMENT, blank)
  const keys = []
  let unparsed = 0
  for (const match of source.matchAll(CALL)) {
    let call
    try {
      call = parseExpressionAt(source, match.index, { ecmaVersion: 'latest' })
    } catch {
      const first = firstToken(source.slice(match.index + 3))
      if (first) keys.push({ message: first })
      else unparsed++
      continue
    }
    if (call.type !== 'CallExpression') continue
    const message = stringValue(call.arguments[0])
    // '' is never looked up: translate('') is ''.
    if (!message) continue
    keys.push({ message, context: stringValue(call.arguments[2]) })
  }
  return { keys, unparsed }
}

export function missingKeys(listing, readSource) {
  const literals = new Set(listing.literals)
  const missing = []
  let calls = 0
  let files = 0
  for (const module of listing.modules) {
    if (!SOURCE.test(module) || module.includes('node_modules')) continue
    const source = readSource(module)
    if (source === null) continue
    files++
    for (const { message, context } of translationCalls(source).keys) {
      calls++
      if (!literals.has(message)) missing.push({ module, key: message })
      else if (context && !literals.has(context))
        missing.push({ module, key: `${message}:${context}` })
    }
  }
  return { missing, calls, files }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(
    process.argv[2] || resolve(frontend, '../crm/public/frontend'),
  )
  const file = resolve(out, KEYS_FILE)
  if (!existsSync(file)) {
    console.error(
      `verify-translation-keys: ${file} is missing; the build did not emit it`,
    )
    process.exit(1)
  }
  const listing = JSON.parse(readFileSync(file, 'utf8'))
  const read = (module) => {
    const path = resolve(frontend, module)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }
  const { missing, calls, files } = missingKeys(listing, read)
  if (files < 100) {
    console.error(
      `verify-translation-keys: only ${files} source modules listed; the build graph looks wrong`,
    )
    process.exit(1)
  }
  if (missing.length) {
    console.error(
      `verify-translation-keys: ${missing.length} translated strings are missing from ${KEYS_FILE}:`,
    )
    for (const { module, key } of missing.slice(0, 40))
      console.error(`  ${module}: ${JSON.stringify(key)}`)
    process.exit(1)
  }
  console.log(
    `verify-translation-keys: ${calls} __() calls in ${files} modules, all in ${KEYS_FILE} (${listing.literals.length} literals)`,
  )
}
