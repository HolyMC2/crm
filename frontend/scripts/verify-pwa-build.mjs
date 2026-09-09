import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const output = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(here, '../../crm/public/frontend')
const worker = readFileSync(join(output, 'sw.js'), 'utf8')
const precached = new Set(
  [...worker.matchAll(/\burl\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]),
)
const assets = readdirSync(join(output, 'assets')).filter((name) =>
  /\.(?:css|js)$/.test(name),
)
assert(assets.length > 0, 'CRM build has no JavaScript or CSS assets')
const missing = assets.filter((name) => !precached.has(`assets/${name}`))
assert.deepEqual(missing, [], 'CRM service worker is missing required assets')
const html = readFileSync(join(output, 'index.html'), 'utf8')
for (const [, file] of html.matchAll(/(?:src|href)="\/assets\/crm\/frontend\/([^"?#]+)"/g)) {
  assert(statSync(join(output, file)).isFile(), `Missing HTML dependency: ${file}`)
}
assert(worker.includes('push-sw.js'), 'CRM push handler is missing')
console.log(`CRM PWA verified: ${assets.length} JavaScript/CSS assets precached`)
