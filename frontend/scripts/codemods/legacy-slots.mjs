#!/usr/bin/env node
// Rewrites the frappe-ui 1.0.0-beta.29 "legacy" surfaces that 1.0.2 dropped
// without a compile error, so the content simply stopped rendering:
//
//   Dialog   #body-content → #default; #body → #default + `bare`;
//            :options="{ title, size, … }" → flat props;
//            :disableOutsideClickToClose="x" → :dismissible="!(x)"
//   Popover  #target → #trigger; #body → #default + `bare`; #body-main → #default;
//            placement="side-align" → side + align; v-model:show → v-model:open;
//            @update:show → @update:open; transition="default" dropped
//   Tooltip  #body → #content; placement → side; hoverDelay seconds → ms
//   Dropdown placement right|center|left → align end|center|start
//   DatePicker family: placement="side-align" → side
//
// Slot props changed too (legacy `{ togglePopover, isOpen, open() }` vs 1.0.2
// `{ open, close, setOpen }`); those are per-site and stay a hand edit, so
// the output of this script is not expected to build on its own.
//
// Usage: node scripts/codemods/legacy-slots.mjs [--dry] [dir...]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const roots = args.filter((a) => !a.startsWith('--'))
if (!roots.length) roots.push('src')

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (p.endsWith('.vue')) yield p
  }
}

const OPEN_TAG = /^(\s*)<([A-Z][\w.-]*)/

// The component whose opening tag encloses line `i` (the nearest less-indented
// `<Name` above it, skipping `<template>` wrappers). Returns its line index.
function enclosing(lines, i) {
  const indent = lines[i].match(/^\s*/)[0].length
  for (let j = i - 1; j >= 0; j--) {
    const m = lines[j].match(OPEN_TAG)
    if (m && m[1].length < indent) return { line: j, name: m[2] }
  }
  return null
}

function addBoolAttr(lines, tagLine, attr) {
  const re = new RegExp(`(^|\\s)${attr}(\\s|>|$)`)
  // Look at the whole opening tag (it may span lines).
  let k = tagLine
  let text = ''
  while (k < lines.length) {
    text += lines[k] + '\n'
    if (/>\s*$/.test(lines[k]) || />.*</.test(lines[k])) break
    k++
  }
  if (re.test(text)) return
  lines[tagLine] = lines[tagLine].replace(OPEN_TAG, (s) => `${s} ${attr}`)
}

// Splits an object literal body at top-level commas.
function splitTopLevel(src) {
  const parts = []
  let depth = 0
  let quote = null
  let cur = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      cur += ch
      if (ch === '\\') cur += src[++i]
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '`') quote = ch
    if ('([{'.includes(ch)) depth++
    if (')]}'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

function flattenOptions(objectLiteral) {
  const body = objectLiteral.trim().replace(/^\{/, '').replace(/\}$/, '')
  const out = []
  for (const part of splitTopLevel(body)) {
    const m = part.match(/^\s*([\w$]+)\s*:\s*([\s\S]*?)\s*$/)
    if (!m) {
      const shorthand = part.match(/^\s*([\w$]+)\s*$/)
      if (shorthand) out.push(`:${shorthand[1]}="${shorthand[1]}"`)
      else throw new Error(`cannot flatten Dialog options part: ${part}`)
      continue
    }
    const [, key, raw] = m
    const value = raw.replace(/\s*\n\s*/g, ' ')
    const lit = value.match(/^'([^'\\]*)'$/)
    if (lit) out.push(`${key}="${lit[1]}"`)
    else out.push(`:${key}="${value}"`)
  }
  return out.join(' ')
}

function rewriteDialogTag(tag) {
  let t = tag.replace(/\s:options="(\{[\s\S]*?\})"/g, (s, obj) => {
    return ' ' + flattenOptions(obj)
  })
  t = t.replace(
    /\s:disableOutsideClickToClose="([\s\S]*?)"/g,
    (s, expr) => ` :dismissible="!(${expr.replace(/\s*\n\s*/g, ' ').trim()})"`,
  )
  return t
}

function rewritePopoverTag(tag) {
  let t = tag
  t = t.replace(/\splacement="([a-z]+)(?:-([a-z]+))?"/g, (s, side, align) =>
    align ? ` side="${side}" align="${align}"` : ` side="${side}"`,
  )
  t = t.replace(/\sv-model:show=/g, ' v-model:open=')
  t = t.replace(/\s@update:show=/g, ' @update:open=')
  t = t.replace(/\s:show=/g, ' :open=')
  t = t.replace(/\stransition="default"/g, '')
  return t
}

function rewriteTooltipTag(tag) {
  return (
    tag
      .replace(/\s:placement="'([a-z]+)'"/g, ' side="$1"')
      .replace(/\splacement=/g, ' side=')
      // beta.29 took seconds, 1.0.2 takes ms. A value under 10 can only have
      // meant seconds (a 1 ms delay is no delay); larger ones were already ms.
      .replace(/\s:hover-?[dD]elay="([\d.]+)"/g, (s, n) =>
        Number(n) < 10
          ? ` :hover-delay="${Math.round(Number(n) * 1000)}"`
          : ` :hover-delay="${n}"`,
      )
  )
}

const DROPDOWN_ALIGN = { right: 'end', center: 'center', left: 'start' }
function rewriteDropdownTag(tag) {
  return tag.replace(
    /\splacement="(right|center|left)"/g,
    (s, p) => ` align="${DROPDOWN_ALIGN[p]}"`,
  )
}

function rewritePickerTag(tag) {
  return tag.replace(/\splacement="([a-z]+)(?:-[a-z]+)?"/g, ' side="$1"')
}

// Applies `fn` to the full text of every opening tag named `name`. The tag
// ends at the first `>` outside an attribute value (`() => x` inside a bound
// attribute is not the end of the tag).
function rewriteTags(source, name, fn) {
  const re = new RegExp(`<${name}(?=[\\s/>])`, 'g')
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length
    let quote = null
    while (i < source.length) {
      const ch = source[i]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '>') break
      i++
    }
    const tag = source.slice(m.index, i + 1)
    out += source.slice(last, m.index) + fn(tag)
    last = i + 1
    re.lastIndex = last
  }
  return out + source.slice(last)
}

let changed = 0
for (const root of roots) {
  for (const file of walk(root)) {
    const before = fs.readFileSync(file, 'utf8')
    const lines = before.split('\n')
    for (let i = 0; i < lines.length; i++) {
      // Prettier may leave the template on the parent's closing-bracket line
      // (`><template #body-content`), so match anywhere in the line.
      const m = lines[i].match(
        /<template\s+#(body-content|body-main|body|target)(?=[\s=>]|$)/,
      )
      if (!m) continue
      const owner = enclosing(lines, i)
      if (!owner) continue
      const slot = m[1]
      const replace = (to) => {
        lines[i] = lines[i].replace(/#(body-content|body-main|body|target)/, to)
      }
      if (owner.name === 'Dialog') {
        if (slot === 'body-content' || slot === 'body-main') replace('#default')
        else if (slot === 'body') {
          replace('#default')
          addBoolAttr(lines, owner.line, 'bare')
        }
      } else if (owner.name === 'Popover') {
        if (slot === 'target') replace('#trigger')
        else if (slot === 'body-main') replace('#default')
        else if (slot === 'body') {
          replace('#default')
          addBoolAttr(lines, owner.line, 'bare')
        }
      } else if (owner.name === 'Tooltip' && slot === 'body') {
        replace('#content')
      }
    }
    let after = lines.join('\n')
    after = rewriteTags(after, 'Dialog', rewriteDialogTag)
    after = rewriteTags(after, 'Popover', rewritePopoverTag)
    after = rewriteTags(after, 'Tooltip', rewriteTooltipTag)
    after = rewriteTags(after, 'Dropdown', rewriteDropdownTag)
    for (const picker of [
      'DatePicker',
      'DateTimePicker',
      'DateRangePicker',
      'TimePicker',
    ])
      after = rewriteTags(after, picker, rewritePickerTag)
    if (after !== before) {
      changed++
      console.log(file)
      if (!dry) fs.writeFileSync(file, after)
    }
  }
}
console.log(`${changed} file(s) ${dry ? 'would change' : 'changed'}`)
