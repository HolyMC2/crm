// Marco 2026-11-22: no explanatory text and no sub-headers. Three patterns
// that break it may only become fewer: a small heading per block (h2/h3 at
// text-sm/text-xs), a grey hint line (a <p> at text-xs in a grey ink), and
// frappe-ui's FormControl inside a BottomSheet (the kit's Field is the filled
// field). The baseline is what this scan counted when it landed
// (lookRatchet.baseline.json, written by `UPDATE_RATCHET=1 vitest run
// tests/unit/lookRatchet.test.js`), never typed by hand; lower it the same way
// after a sweep.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const BASELINE = resolve(here, 'lookRatchet.baseline.json')

function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return ['vendor', 'framework-ui'].includes(name) ? [] : vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

const SMALL_HEADING = /<h[23]\b[^>]*class="[^"]*\btext-(?:sm|xs)\b[^"]*"/g
const GREY_HINT =
  /<p\b[^>]*class="[^"]*\btext-xs\b[^"]*\btext-ink-gray-[4-6]\b[^"]*"|<p\b[^>]*class="[^"]*\btext-ink-gray-[4-6]\b[^"]*\btext-xs\b[^"]*"/g

export function scan() {
  const counts = { smallHeadings: 0, greyHints: 0, formControlInSheets: 0 }
  for (const file of vueFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const template = text.slice(0, text.lastIndexOf('</template>') + 1)
    counts.smallHeadings += (template.match(SMALL_HEADING) || []).length
    counts.greyHints += (template.match(GREY_HINT) || []).length
    if (/<BottomSheet\b/.test(template))
      counts.formControlInSheets += (
        template.match(/<FormControl\b/g) || []
      ).length
  }
  return counts
}

describe('the look ratchet', () => {
  it('small headings, grey hint lines and FormControl in sheets only go down', () => {
    const now = scan()
    if (process.env.UPDATE_RATCHET === '1')
      writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`)
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
    for (const key of Object.keys(baseline))
      expect(
        now[key],
        `${key}: ${now[key]} > ${baseline[key]} in ${relative(here, SRC)}; use a view chip, a ListGroup or the kit's Field instead`,
      ).toBeLessThanOrEqual(baseline[key])
  })
})
