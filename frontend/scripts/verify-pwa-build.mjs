import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
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
// The output also keeps previous builds' chunks for open tabs
// (retain-builds.mjs); build-files.json names this build's.
const current = JSON.parse(
  readFileSync(join(output, 'build-files.json'), 'utf8'),
)
const assets = current.files
  .filter((file) => /\.(?:css|js)$/.test(file))
  .map((file) => file.replace(/^assets\//, ''))
assert(assets.length > 0, 'CRM build has no JavaScript or CSS assets')
for (const name of assets)
  assert(
    statSync(join(output, 'assets', name)).isFile(),
    `Missing asset: ${name}`,
  )
const missing = assets.filter((name) => !precached.has(`assets/${name}`))
assert.deepEqual(missing, [], 'CRM service worker is missing required assets')
const extra = [...precached].filter(
  (url) => url.startsWith('assets/') && !current.files.includes(url),
)
assert.deepEqual(extra, [], 'CRM service worker precaches a previous build')
const html = readFileSync(join(output, 'index.html'), 'utf8')
for (const [, file] of html.matchAll(
  /(?:src|href)="\/assets\/crm\/frontend\/([^"?#]+)"/g,
)) {
  assert(
    statSync(join(output, file)).isFile(),
    `Missing HTML dependency: ${file}`,
  )
}
assert(worker.includes('push-sw.js'), 'CRM push handler is missing')
console.log(
  `CRM PWA verified: ${assets.length} JavaScript/CSS assets precached`,
)
