import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ink-*-1 is the palest ink in light mode and a dark one in dark mode. On a
// strong surface fill (surface-*-5 to -9) it drops to about 2:1 contrast in
// one of the two modes. text-white is the label for those fills. A class
// string that puts both on one line fails here.
const root = path.resolve(__dirname, '../../src')
// The fill is also written bg-surface-*, so only a word character may not precede it.
const STRONG_FILL = /(?<!\w)surface-[a-z]+-[5-9](?![\w-])/
const PALE_INK = /(?<![\w-])text-ink-[a-z]+-1(?![\w-])/

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (
      /\.(vue|js|ts|css)$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}

function inkOnStrongFillLines(text) {
  return text
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => STRONG_FILL.test(line) && PALE_INK.test(line))
    .map(({ n }) => n)
}

describe('ink-*-1 text on a strong surface fill', () => {
  it('is not written on one line with a surface-*-5..9 fill', () => {
    const found = []
    for (const file of sourceFiles(root)) {
      const lines = inkOnStrongFillLines(fs.readFileSync(file, 'utf8'))
      for (const n of lines) found.push(`${path.relative(root, file)}:${n}`)
    }
    expect(found).toEqual([])
  })
})
