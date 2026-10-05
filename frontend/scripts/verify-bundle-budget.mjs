// First-load budget (spec-muelle-shell §6): the entry chunk with its static
// imports ≤ 180 KB gzip, the global stylesheet ≤ 60 KB gzip. Fails the build.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const output = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(here, '../../crm/public/frontend')
export const BUDGET = { js: 180 * 1024, css: 60 * 1024 }

const html = readFileSync(join(output, 'index.html'), 'utf8')
const gz = (file) => gzipSync(readFileSync(join(output, file)), { level: 9 }).length
const STATIC_IMPORT =
  /(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([^"']+\.js)["']/g

function staticGraph(entry) {
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(join(output, file), 'utf8')
    for (const [, next] of source.matchAll(STATIC_IMPORT))
      stack.push(join(dirname(file), next))
  }
  return [...seen]
}

const entry = html.match(/assets\/index-[\w-]+\.js/)?.[0]
const styles = [...html.matchAll(/assets\/[\w.-]+\.css/g)].map((m) => m[0])
if (!entry) throw new Error('CRM build has no entry chunk in index.html')
const js = staticGraph(entry).reduce((sum, file) => sum + gz(file), 0)
const css = styles.reduce((sum, file) => sum + gz(file), 0)
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const failures = []
if (js > BUDGET.js) failures.push(`entry JS ${kb(js)} gzip > ${kb(BUDGET.js)}`)
if (css > BUDGET.css) failures.push(`CSS ${kb(css)} gzip > ${kb(BUDGET.css)}`)
if (failures.length) {
  console.error(`CRM bundle budget exceeded: ${failures.join('; ')}`)
  process.exit(1)
}
console.log(`CRM bundle budget: entry JS ${kb(js)}, CSS ${kb(css)} (gzip)`)
