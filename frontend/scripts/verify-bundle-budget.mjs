// Bundle budgets. Fails the build (and CI's frontend build job) on a regression.
//  1. First load (spec-muelle-shell §6): the entry chunk with its static
//     imports ≤ 180 KB gzip, the global stylesheet ≤ 60 KB gzip.
//  2. Daily routes (CRM program SPEC §4): what a daily route statically loads
//     before it can paint — the entry, the shell, the Ventas frame where the
//     route has one, and the page — ≤ 60 script files and ≤ 2.5 MB of JS.
//     Admin screens (forms, automations, score rules, social, campaigns,
//     webshop, workload) never load on a daily route.
// `node scripts/verify-bundle-budget.mjs [outDir] [--report]` prints every
// route; a failure names the route and the files that grew it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const report = args.includes('--report')
const outArg = args.find((arg) => !arg.startsWith('--'))
const output = outArg
  ? resolve(outArg)
  : resolve(here, '../../crm/public/frontend')

export const BUDGET = { js: 180 * 1024, css: 60 * 1024 }
export const ROUTE_BUDGET = { files: 60, bytes: 2.5 * 1024 * 1024 }
// Components a route mounts at once: MuelleShell (App), and on Ventas
// routes CrmRuntime + VentasFrame around the page.
const SHELL = ['MuelleShell']
const VENTAS = [...SHELL, 'CrmRuntime', 'VentasFrame']
export const DAILY_ROUTES = {
  '/crm/hoy': [...SHELL, 'Hoy'],
  '/crm/pendientes': [...SHELL, 'Pendientes'],
  '/crm/contactos': [...SHELL, 'Contactos'],
  '/crm/deals': [...VENTAS, 'DealsView'],
  '/crm/leads': [...VENTAS, 'LeadsView'],
  '/crm/prospectos': [...VENTAS, 'Prospectos'],
  '/crm/inbox': [...VENTAS, 'Inbox'],
  '/crm/dashboard': [...VENTAS, 'Dashboard'],
}
export const ADMIN_SCREENS = [
  'Forms',
  'FormBuilder',
  'AutomationWorkspace',
  'ScoreRules',
  'SocialCalendar',
  'SocialEvergreen',
  'SocialMentions',
  'Campaigns',
  'CampaignDetail',
  'Webshop',
  'WorkloadView',
]

const STATIC_IMPORT =
  /(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([^"']+\.js)["']/g

export function staticGraph(dir, entries) {
  const seen = new Set()
  const stack = [...entries]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(join(dir, file), 'utf8')
    for (const [, next] of source.matchAll(STATIC_IMPORT))
      stack.push(join(dirname(file), next))
  }
  return [...seen]
}

/** This build's files: build-files.json when the output retains old builds. */
export function currentFiles(dir) {
  const ledger = join(dir, 'build-files.json')
  if (existsSync(ledger)) return JSON.parse(readFileSync(ledger, 'utf8')).files
  return readdirSync(join(dir, 'assets')).map((name) => `assets/${name}`)
}

export function chunkFor(files, component) {
  const pattern = new RegExp(`^assets/${component}-[\\w-]{8}\\.js$`)
  return files.find((file) => pattern.test(file))
}

export function routeLoad(dir, entry, files, components) {
  const chunks = components.map((name) => {
    const chunk = chunkFor(files, name)
    if (!chunk)
      throw new Error(`no chunk for ${name}: renamed? update DAILY_ROUTES`)
    return chunk
  })
  const js = staticGraph(dir, [entry, ...chunks]).filter((f) =>
    f.endsWith('.js'),
  )
  const bytes = js.reduce(
    (sum, file) => sum + statSync(join(dir, file)).size,
    0,
  )
  const admin = js.filter((file) =>
    ADMIN_SCREENS.some((name) =>
      new RegExp(`^assets/${name}-[\\w-]{8}\\.js$`).test(file),
    ),
  )
  return { files: js, bytes, admin }
}

function main() {
  const html = readFileSync(join(output, 'index.html'), 'utf8')
  const gz = (file) =>
    gzipSync(readFileSync(join(output, file)), { level: 9 }).length
  const entry = html.match(/assets\/index-[\w-]+\.js/)?.[0]
  const styles = [...html.matchAll(/assets\/[\w.-]+\.css/g)].map((m) => m[0])
  if (!entry) throw new Error('CRM build has no entry chunk in index.html')
  const js = staticGraph(output, [entry]).reduce(
    (sum, file) => sum + gz(file),
    0,
  )
  const css = styles.reduce((sum, file) => sum + gz(file), 0)
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`
  const failures = []
  if (js > BUDGET.js)
    failures.push(`entry JS ${kb(js)} gzip > ${kb(BUDGET.js)}`)
  if (css > BUDGET.css) failures.push(`CSS ${kb(css)} gzip > ${kb(BUDGET.css)}`)

  const files = currentFiles(output)
  const lines = []
  for (const [route, components] of Object.entries(DAILY_ROUTES)) {
    let load
    try {
      load = routeLoad(output, entry, files, components)
    } catch (error) {
      failures.push(`${route}: ${error.message}`)
      continue
    }
    lines.push(
      `${route.padEnd(16)} ${String(load.files.length).padStart(3)} files ${mb(load.bytes)}`,
    )
    if (load.files.length > ROUTE_BUDGET.files)
      failures.push(
        `${route} loads ${load.files.length} script files > ${ROUTE_BUDGET.files}`,
      )
    if (load.bytes > ROUTE_BUDGET.bytes) {
      const biggest = load.files
        .map((file) => [file, statSync(join(output, file)).size])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([file, size]) => `${file} ${kb(size)}`)
      failures.push(
        `${route} loads ${mb(load.bytes)} JS > ${mb(ROUTE_BUDGET.bytes)} (largest: ${biggest.join(', ')})`,
      )
    }
    if (load.admin.length)
      failures.push(
        `${route} statically loads admin screens: ${load.admin.join(', ')}`,
      )
  }
  if (report || failures.length) console.log(lines.join('\n'))
  if (failures.length) {
    console.error(`CRM bundle budget exceeded:\n  ${failures.join('\n  ')}`)
    process.exit(1)
  }
  console.log(
    `CRM bundle budget: entry JS ${kb(js)}, CSS ${kb(css)} (gzip); ${Object.keys(DAILY_ROUTES).length} daily routes within ${ROUTE_BUDGET.files} files / ${mb(ROUTE_BUDGET.bytes)}`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main()
