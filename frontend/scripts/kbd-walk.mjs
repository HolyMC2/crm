/* global console, process, document, getComputedStyle, setTimeout */
// Keyboard standard walk (H3b), keyboard only: Hoy → Contactos → open a
// record → back → Ventas (deal record: e, Esc) → create, plus «[». It prints
// each step and exits 1 when a step does not do what its sheet row says.
//
// On a lane test site (the runtime serves the image's crm bundle, so
// kbd-walk-proxy.mjs serves this worktree's build in front of it):
//   npm run build
//   lane test <slug> --profile full-retail --browser      # prints the URL + password file
//   node scripts/kbd-walk-proxy.mjs 18850 http://127.0.0.1:18801 ..
//   node scripts/kbd-walk.mjs http://127.0.0.1:18850 <password-file> <out-dir>
// Never against doco-mirror or mumu-mirror (acceptance sites).
import fs from 'node:fs'
import { chromium } from 'playwright'
const [base, pwdFile, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const pwd = fs.readFileSync(pwdFile, 'utf8').trim()
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
)
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  serviceWorkers: 'block',
})
const login = await ctx.request.post(`${base}/api/method/login`, {
  form: { usr: 'Administrator', pwd },
})
if (!login.ok()) throw new Error('login ' + login.status())
await ctx.request.put(`${base}/api/resource/User/Administrator`, {
  data: { language: 'es-MX' },
})
// A few records so every list has rows to walk.
const seed = async (doctype, data) => {
  const r = await ctx.request.post(
    `${base}/api/resource/${encodeURIComponent(doctype)}`,
    { data },
  )
  return r.ok() ? (await r.json()).data : null
}
for (const [first, last] of [
  ['Ana', 'López'],
  ['Beto', 'Ruiz'],
  ['Carla', 'Díaz'],
])
  await seed('Contact', {
    first_name: first,
    last_name: last,
    mobile_no: '+52667' + Math.floor(1e6 + Math.random() * 8e6),
  })
for (const name of ['Pantalla Moto G', 'Batería iPhone 11'])
  await seed('ToDo', {
    description: name,
    date: new Date().toISOString().slice(0, 10),
    allocated_to: 'Administrator',
  })
const status = await ctx.request.get(
  `${base}/api/resource/CRM Deal Status?limit_page_length=1`,
)
const dealStatus = (await status.json()).data?.[0]?.name
for (const who of ['Diana Mora', 'Eloy Paz'])
  await seed('CRM Deal', {
    first_name: who.split(' ')[0],
    last_name: who.split(' ')[1],
    status: dealStatus,
  })

const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('response', async (r) => {
  if (r.url().includes('/api/') && r.status() >= 400)
    errors.push(
      `HTTP ${r.status()} ${r.url().replace(base, '')} after «${steps.at(-1)?.step}»: ${(await r.text().catch(() => '')).slice(0, 160)}`,
    )
})
const steps = []
const log = (step, data = {}) => {
  steps.push({ step, url: page.url().replace(base, ''), ...data })
  console.log(step, JSON.stringify(data))
}
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement
    const row = a?.closest?.('[data-key-row]')
    const rows = [...document.querySelectorAll('[data-key-row]')]
    return {
      tag: a?.tagName,
      inRow: !!row,
      index: rows.indexOf(row),
      text: (row || a)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60),
      search:
        !!a?.closest?.('[data-list-search]') ||
        a?.hasAttribute?.('data-list-search'),
    }
  })
const settle = (ms = 1500) => page.waitForTimeout(ms)
const sheetPage = async () => {
  await page.keyboard.press('Alt+h')
  await settle(800)
  const sheet = await page.evaluate(() => {
    const el = document.querySelector('[data-shell-layer="shortcuts"]')
    if (!el) return null
    return [...el.querySelectorAll('[role="tab"]')].map((t) =>
      t.textContent.replace(/\s+/g, ' ').trim(),
    )
  })
  return sheet
}
const pageRows = async () => {
  // Open «En esta página» and read its rows.
  return page.evaluate(() => {
    const el = document.querySelector('[data-shell-layer="shortcuts"]')
    const tab =
      el &&
      [...el.querySelectorAll('[role="tab"]')].find(
        (t) => t.dataset.section === 'page',
      )
    tab?.click()
    return new Promise((resolve) =>
      setTimeout(() => {
        const panel = el?.querySelector('[role="tabpanel"]:not([hidden])')
        resolve(panel ? panel.innerText.split('\n').filter(Boolean) : [])
      }, 300),
    )
  })
}

// 1. Hoy
await page.goto(`${base}/crm/hoy`, { waitUntil: 'networkidle', timeout: 60000 })
await settle(2500)
log('hoy loaded', { title: await page.title() })
await page.keyboard.press('j')
await settle(300)
log('hoy j', await focused())
log('hoy sheet tabs', { tabs: await sheetPage() })
log('hoy page rows', { rows: await pageRows() })
await page.screenshot({ path: `${out}/hoy-sheet-1280.png` })
await page.keyboard.press('Escape')
await settle(300)

// 2. g c → Contactos
await page.keyboard.press('g')
await page.keyboard.press('c')
await page.waitForURL(/\/crm\/contactos/, { timeout: 15000 })
await settle(2500)
log('contactos via g c')
await page.keyboard.press('/')
await settle(200)
log('contactos /', await focused())
await page.keyboard.press('Escape')
await settle(200)
log('contactos Esc in search', await focused())
await page.keyboard.press('j')
await page.keyboard.press('j')
await settle(300)
const opened = await focused()
log('contactos j j', opened)
log('contactos sheet tabs', { tabs: await sheetPage() })
log('contactos page rows', { rows: await pageRows() })
await page.screenshot({ path: `${out}/contactos-sheet-1280.png` })
await page.keyboard.press('Escape')
await settle(300)

// 3. Enter opens the record, browser back returns, j/k continue from that row
await page.keyboard.press('k')
await page.keyboard.press('j')
const before = await focused()
await page.keyboard.press('Enter')
await page.waitForURL(/\/crm\/contactos\/[^/?]+\/[^/?]+/, { timeout: 15000 })
await settle(2000)
log('record opened', {
  heading: await page
    .locator('h1')
    .first()
    .textContent()
    .catch(() => ''),
})
await page.screenshot({ path: `${out}/contacto-record-1280.png` })
// The browser's own back (Alt+← is the browser's key; headless has no chrome).
await page.goBack()
await page.waitForURL(/\/crm\/contactos(\?|$)/, { timeout: 15000 })
await settle(2000)
await page.keyboard.press('j')
await settle(300)
const back = await focused()
log('back on list, j', { ...back, sameRowAsOpened: back.text === before.text })

// 4. g v → Ventas, rows, selection, then c creates
await page.keyboard.press('g')
await page.keyboard.press('v')
await settle(3000)
log('ventas via g v')
// The deals list from the palette: Ctrl+K, «Deals», Enter.
await page.keyboard.press('Control+k')
await settle(600)
await page.keyboard.type('Deals')
await settle(1500)
const options = await page.evaluate(() =>
  [
    ...document.querySelectorAll(
      '[aria-label="Command palette"] [role="option"]',
    ),
  ].map((o) => o.textContent.replace(/\s+/g, ' ').trim()),
)
log('palette options', { options })
// ↓ to «Ventas › …» (Ir a), then Enter.
const target = options.findIndex((o) => /Ventas ›/.test(o))
const current = await page.evaluate(() =>
  [
    ...document.querySelectorAll(
      '[aria-label="Command palette"] [role="option"]',
    ),
  ].findIndex((o) => o.getAttribute('aria-selected') === 'true'),
)
for (let i = Math.max(current, 0); i < target; i++)
  await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForURL(/\/crm\/deals/, { timeout: 15000 })
await settle(2500)
log('ventas deals via Ctrl+K')
await page.keyboard.press('j')
await settle(300)
log('ventas j', await focused())
await page.keyboard.press('x')
await settle(300)
log('ventas x', {
  checked: await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-row-check]')].filter(
        (c) => c.checked,
      ).length,
  ),
})
// Enter opens the deal; e opens its editable fields, Esc leaves the field,
// Esc closes the panel; the browser's back returns to the list.
await page.keyboard.press('Enter')
await page.waitForURL(/\/crm\/ventas\/deal\//, { timeout: 15000 })
await settle(2500)
log('deal opened')
log('deal sheet tabs', { tabs: await sheetPage() })
log('deal page rows', { rows: await pageRows() })
await page.keyboard.press('Escape')
await settle(300)
await page.keyboard.press('e')
await settle(1200)
const panel = () =>
  page.evaluate(() => ({
    open: !!document.querySelector('[data-deal-context]'),
    focusInPanel: !!document.activeElement?.closest?.('[data-deal-context]'),
  }))
log('deal e', await panel())
await page.screenshot({ path: `${out}/deal-edit-1280.png` })
await page.keyboard.press('Escape')
await settle(300)
log('deal Esc 1', await panel())
await page.keyboard.press('Escape')
await settle(500)
log('deal Esc 2', await panel())
await page.goBack()
await page.waitForURL(/\/crm\/deals/, { timeout: 15000 })
await settle(2500)
await page.keyboard.press('j')
await settle(300)
log('back on deals, j', await focused())
log('ventas sheet tabs', { tabs: await sheetPage() })
log('ventas page rows', { rows: await pageRows() })
await page.screenshot({ path: `${out}/ventas-sheet-1280.png` })
await page.keyboard.press('Escape')
await settle(300)
await page.keyboard.press('c')
await settle(1500)
const dialog = await page.evaluate(() => {
  const d = [
    ...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),
  ].find((e) => e.offsetParent !== null || e.getClientRects().length)
  return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null
})
log('ventas c (create)', { dialog })
await page.screenshot({ path: `${out}/ventas-create-1280.png` })
await page.keyboard.press('Escape')
await settle(500)

// 5. [ shows or hides the app names of the desktop rail (mainline's «[»)
await page.keyboard.press('g')
await page.keyboard.press('p')
await page.waitForURL(/\/crm\/pendientes/, { timeout: 15000 })
await settle(2000)
const rail = () =>
  page.evaluate(() => document.querySelector('[data-rail]')?.dataset.rail)
const railBefore = await rail()
await page.keyboard.press('[')
await settle(300)
const toggled = await rail()
await page.keyboard.press('[')
await settle(300)
log('pendientes [', { before: railBefore, toggled, again: await rail() })

// What each step must show (the sheet rows and the keys behind them).
const at = (name) => steps.find((s) => s.step === name) || {}
const checks = [
  ['Hoy: j focuses the first row', at('hoy j').inRow === true],
  [
    'Hoy: «En esta página» = j/k/↵',
    JSON.stringify(at('hoy page rows').rows?.slice(1)) ===
      JSON.stringify([
        'J / ↓',
        'Siguiente fila',
        'K / ↑',
        'Fila anterior',
        '↵',
        'Abrir ficha',
      ]),
  ],
  ['Contactos: / focuses the list search', at('contactos /').search === true],
  [
    'Contactos: Esc leaves the search',
    at('contactos Esc in search').search === false,
  ],
  ['Contactos: j j is the second row', at('contactos j j').index === 1],
  [
    'Contactos: back on the list, j starts at the opened row',
    at('back on list, j').sameRowAsOpened === true,
  ],
  [
    'Ventas: j, x select a row',
    at('ventas j').inRow === true && at('ventas x').checked === 1,
  ],
  [
    'Deal: «En esta página» = e',
    JSON.stringify(at('deal page rows').rows?.slice(1)) ===
      JSON.stringify(['E', 'Editar']),
  ],
  [
    'Deal: e opens the fields with the focus in them',
    at('deal e').open && at('deal e').focusInPanel,
  ],
  [
    'Deal: Esc leaves the field, Esc closes the panel',
    at('deal Esc 1').open &&
      !at('deal Esc 1').focusInPanel &&
      !at('deal Esc 2').open,
  ],
  [
    'Ventas: «En esta página» lists j/k/↵/x/Shift+X/Ctrl+A',
    (at('ventas page rows').rows || []).includes(
      'Seleccionar la página visible',
    ),
  ],
  [
    'Ventas: c opens the new deal dialog',
    /Deal|trato/i.test(at('ventas c (create)').dialog || ''),
  ],
  [
    'Pendientes: [ toggles the rail and back',
    Boolean(at('pendientes [').before) &&
      at('pendientes [').toggled !== at('pendientes [').before &&
      at('pendientes [').again === at('pendientes [').before,
  ],
  ['No page error or failed API call', errors.length === 0],
]
fs.writeFileSync(
  `${out}/walk.json`,
  JSON.stringify({ steps, errors, checks }, null, 2),
)
for (const [label, ok] of checks) console.log(ok ? 'ok  ' : 'FAIL', label)
if (errors.length) console.log('errors', errors.slice(0, 8))
await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
