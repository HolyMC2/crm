import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'

// A utility that names a colour token frappe-ui does not define compiles to
// nothing: no error, no warning, and the element keeps whatever it inherits.
// `text-ink-white` on a dark fill is then dark text on a dark fill. Every
// `surface-*`, `ink-*` and `outline-*` utility in src must name a token of the
// installed frappe-ui (1.0 renamed white → base, modal → elevation-2,
// cards → elevation-1, selected → elevation-3, menu-bar → sidebar).
const root = path.resolve(__dirname, '../../src')
// The package does not export its token table, so it is read from the file.
const TOKENS = path.resolve(__dirname, '../../node_modules/frappe-ui/tailwind/tokens.js')
const UTILITY =
  /(?<![\w-])(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|divide|outline|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(surface|ink|outline)-([a-z]+(?:-[a-z]+)*(?:-\d+)?)(?![\w-])/g

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (/\.(vue|js|ts|css)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(p)
  }
  return out
}

describe('colour token utilities', () => {
  it('name a token the installed frappe-ui defines', async () => {
    const { semanticColors } = await import(/* @vite-ignore */ pathToFileURL(TOKENS).href)
    const defined = Object.fromEntries(
      Object.entries(semanticColors.light).map(([category, entries]) => [category, new Set(Object.keys(entries))]),
    )
    expect(defined.ink.has('base')).toBe(true)
    const unknown = []
    for (const file of sourceFiles(root)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      for (const [i, line] of lines.entries()) {
        for (const [utility, category, name] of line.matchAll(UTILITY)) {
          if (!defined[category].has(name)) unknown.push(`${path.relative(root, file)}:${i + 1} ${utility}`)
        }
      }
    }
    expect(unknown).toEqual([])
  })
})
