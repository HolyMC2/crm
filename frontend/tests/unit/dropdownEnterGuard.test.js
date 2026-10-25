import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

// frappe-ui 1.0 renders the Dropdown trigger slot as the reka `DropdownMenuTrigger`
// (`as-child`), which opens the menu on Enter *keydown* and lets the event bubble.
// A clickable row that also answers `@keydown.enter` (deal and lead rows, the phone
// `MobileRecordCard`, the campaigns list) then opens the record on top of the menu
// the user asked for. The FUI1-behavior walk caught this on the 412 deals list;
// the fix is `.self` on the row's handler, as `onRowKey` already had. This scan
// keeps every row that wraps a <Dropdown> on that rule.
const root = path.resolve(__dirname, '../../src')

function vueFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) vueFiles(p, out)
    else if (entry.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const modifierNames = (prop) =>
  (prop.modifiers || []).map((m) => (typeof m === 'string' ? m : m.content))

const isElement = (node) => node.type === 1

const wrapsDropdown = (node) =>
  (node.children || []).some(
    (child) =>
      isElement(child) && (child.tag === 'Dropdown' || wrapsDropdown(child)),
  )

function enterHandlersWrappingDropdown(node, file, out) {
  if (isElement(node)) {
    for (const prop of node.props || []) {
      if (prop.type !== 7 || prop.name !== 'on') continue
      if (prop.arg?.content !== 'keydown') continue
      const modifiers = modifierNames(prop)
      if (!modifiers.includes('enter')) continue
      if (modifiers.includes('self') || modifiers.includes('stop')) continue
      if (wrapsDropdown(node)) {
        out.push(
          `${path.relative(root, file)}:${prop.loc.start.line} <${node.tag} @keydown.${modifiers.join('.')}>`,
        )
      }
    }
  }
  for (const child of node.children || []) {
    enterHandlersWrappingDropdown(child, file, out)
  }
}

function offenders() {
  const out = []
  let dropdownHosts = 0
  for (const file of vueFiles(root)) {
    const { descriptor } = parse(fs.readFileSync(file, 'utf8'), {
      filename: file,
    })
    const ast = descriptor.template?.ast
    if (!ast) continue
    if (wrapsDropdown(ast)) dropdownHosts += 1
    enterHandlersWrappingDropdown(ast, file, out)
  }
  return { out, dropdownHosts }
}

describe('dropdown Enter guard', () => {
  const { out, dropdownHosts } = offenders()

  it('still sees templates that render a <Dropdown>', () => {
    expect(dropdownHosts).toBeGreaterThan(0)
  })

  it('keeps every Enter handler that wraps a <Dropdown> on .self', () => {
    expect(out, out.join('\n')).toEqual([])
  })
})
