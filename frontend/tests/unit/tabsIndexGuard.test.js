import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// frappe-ui 1.0.2 Tabs selects a trigger and mounts its panel by each item's
// `value`, with no positional fallback. Items that carry only name/label leave
// every panel unmounted. utils/tabs.js indexTabs gives each item the value the
// v-model holds, so a file that renders Tabs has to map its items through it.
const root = path.resolve(__dirname, '../../src')
const RENDERS_TABS = /<Tabs[\s>]|\bh\(\s*Tabs\b/
const USES_INDEX_TABS = /\bindexTabs\(/

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (
      /\.(vue|js|ts)$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}

function tabsWithoutIndexTabs(text) {
  return RENDERS_TABS.test(text) && !USES_INDEX_TABS.test(text)
}

describe('frappe-ui Tabs items', () => {
  it('come from indexTabs in every file that renders Tabs', () => {
    const missing = []
    for (const file of sourceFiles(root)) {
      if (tabsWithoutIndexTabs(fs.readFileSync(file, 'utf8')))
        missing.push(path.relative(root, file))
    }
    expect(missing).toEqual([])
  })
})
