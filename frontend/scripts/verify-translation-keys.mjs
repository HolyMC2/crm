// Fails the build when a string the UI translates is missing from
// translation-keys.json, the list the server ships translations for
// (crm/shell_dictionary.py). It reads every `__()` call in the sources of the
// modules this build contains, independently of how the plugin collected the
// list, so a key the plugin drops cannot reach production untranslated.
// `node scripts/verify-translation-keys.mjs [outDir]`
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'vite'
import { KEYS_FILE } from './translation-keys.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')

const SOURCE = /\.(vue|[cm]?[jt]sx?)$/
const CALL = /(?<![\w$])__\(/g
// Comments that mention __('…') are not calls. Blanked to spaces so offsets stay put.
const COMMENT = /<!--[\s\S]*?-->|(?<=^|\s)\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*/g
const blank = (text) => text.replace(/[^\n]/g, ' ')
const CLOSER = { '(': ')', '[': ']', '{': '}' }

function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked
  }
  return null
}

function parseExpression(text) {
  try {
    const statement = parseAst(`(${text})`).body[0]
    return statement?.type === 'ExpressionStatement'
      ? statement.expression
      : null
  } catch {
    return null
  }
}

function quoteEnd(text, i) {
  const quote = text[i]
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++
    else if (text[j] === quote) return j + 1
    else if (text[j] === '\n' && quote !== '`') return -1
  }
  return -1
}

// The index just past the ")" that closes the call opening at `open`, skipping
// strings, template literals and their ${} parts; -1 when it does not close.
// A regex literal holding a bracket can mislead it; the call then falls back to
// its first token below, so the message is still checked.
export function callEnd(text, open) {
  const stack = []
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (stack.at(-1) === '`') {
      if (c === '\\') i++
      else if (c === '`') stack.pop()
      else if (c === '$' && text[i + 1] === '{') {
        stack.push('}')
        i++
      }
      continue
    }
    if (c === "'" || c === '"') {
      const end = quoteEnd(text, i)
      if (end < 0) return -1
      i = end - 1
    } else if (c === '`') stack.push('`')
    else if (CLOSER[c]) stack.push(CLOSER[c])
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) return -1
      if (!stack.length) return i + 1
    }
  }
  return -1
}

// TypeScript or template syntax the parser cannot read as a whole call: the
// message is still the first token when it is a plain string literal.
function firstToken(text, i) {
  while (/\s/.test(text[i] || '')) i++
  if (!'\'"`'.includes(text[i] || 'x')) return null
  const end = quoteEnd(text, i)
  if (end < 0) return null
  const literal = text.slice(i, end)
  if (literal[0] === '`' && literal.includes('${')) return null
  return stringValue(parseExpression(literal))
}

// `__('Save')`, `__("Save")`, `` __(`Save`) ``, and `__('Open', null, 'Compras')`
// as the context key `Open:Compras`. Calls whose message is not a literal are
// runtime values: the server covers those with its DocType and record rules.
export function translationCalls(text) {
  const source = text.replace(COMMENT, blank)
  const keys = []
  let unparsed = 0
  for (const match of source.matchAll(CALL)) {
    const open = match.index + match[0].length - 1
    const end = callEnd(source, open)
    const call =
      end > 0 ? parseExpression(source.slice(match.index, end)) : null
    if (call?.type !== 'CallExpression') {
      const first = firstToken(source, open + 1)
      if (first) keys.push({ message: first })
      else unparsed++
      continue
    }
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
