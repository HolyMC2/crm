// Actual login, native Desk Page and Frappe RPC. No provider requests are allowed.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire('/home/holymc2/muelle-host/worktrees/meta-crm-20260910/frontend/package.json')
const { chromium } = require('@playwright/test')
const kind = process.argv[2] || 'eight'
const entryOnly = process.argv.includes('--entry-only')
assert.ok(['eight', 'core'].includes(kind))
const fixture = JSON.parse(fs.readFileSync(`/tmp/conversation-desk-${kind}-fixture.json`, 'utf8'))
const base = 'http://127.0.0.1:18146'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(20000)
const errors = []
const attempts = []
let dropped = false
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const request = route.request()
  if (!request.url().startsWith(base + '/')) return route.abort()
  if (request.url().includes('/api/method/crm.api.outbox.queue_message')) {
    const body = new URLSearchParams(request.postData())
    attempts.push(Object.fromEntries(body))
    if (!dropped) {
      const response = await route.fetch()
      assert.equal(response.status(), 200, 'The real first queue RPC must commit successfully')
      const result = await response.json()
      assert.equal(result.message.state, 'Queued')
      dropped = true
      console.log('PASS first queue RPC committed Queued; only its response was deliberately dropped')
      return route.abort('failed')
    }
  }
  return route.continue()
})

async function rpc(method, args = {}) {
  return page.evaluate(async ({ method, args }) => {
    try {
      const result = await frappe.call({ method, args, silent: true })
      return { data: result.message }
    } catch (error) {
      return { error: error.exc_type || error.responseJSON?.exc_type || 'RequestError' }
    }
  }, { method, args })
}
async function workspace() {
  return page.evaluate(() => {
    const ui = frappe.pages['customer-conversations']?.wrapper?.customer_conversations
      || [...document.querySelectorAll('.page-container')].map((node) => node.customer_conversations).find(Boolean)
    if (!ui) return null
    return { busy: ui.busy, doc: ui.doc, items: ui.items, accounts: ui.accounts, pending: ui.replyPending, outbound: ui.outbound }
  })
}
async function control(action) {
  const root = page.locator('.customer-conversations')
  const form = root.locator('form').filter({ has: page.getByRole('button', { name: 'Aplicar cambio', exact: true }) })
  await form.locator('select').first().selectOption(action)
  await form.getByRole('button', { name: 'Aplicar cambio', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.customer-conversations button')?.disabled)
}
async function dismissDialogs() {
  for (let i = 0; i < 3; i++) {
    const close = page.locator('.modal:visible [data-dismiss="modal"]').first()
    if (!(await close.count())) return
    await close.click()
  }
}

async function openFromSearch(options) {
  await page.goto(base + '/app', { waitUntil: 'domcontentloaded' })
  await page.getByText('Search', { exact: true }).first().waitFor({ state: 'attached' })
  await page.keyboard.press('Control+k')
  await page.locator('#navbar-search').fill('Conversaciones')
  if (options) await page.evaluate((value) => { frappe.route_options = value }, options)
  await page.getByRole('link', { name: 'Open Conversaciones de clientes', exact: true }).click()
  await page.locator('.customer-conversations').waitFor()
  await page.getByRole('button', { name: 'Actualizar cuentas', exact: true }).waitFor()
}

async function deniedEntry(root) {
  await page.setViewportSize({ width: 1365, height: 1000 })
  await openFromSearch({ provider: 'WhatsApp', account_id: fixture.denied_account_id })
  await root.getByText('La cuenta solicitada no está disponible para tu usuario.', { exact: true }).waitFor()
  assert.equal(await root.locator('.cc-grid > section').first().locator('button').count(), 0)
  assert.equal(await root.locator('select').first().inputValue(), '')
  assert.equal(await page.evaluate(() => frappe.route_options), null)
  console.log('PASS denied account route options show unavailable without selecting another account or its threads')
}

try {
  const login = await context.request.post(base + '/api/method/login', {
    form: { usr: fixture.actor, pwd: fixture.password },
  })
  assert.equal(login.status(), 200, 'Fictional scoped operator must authenticate')
  await openFromSearch(kind === 'eight' ? { provider: 'WhatsApp', account_id: fixture.account_id } : null)
  const root = page.locator('.customer-conversations')
  await root.waitFor({ timeout: 45000 })
  await page.getByRole('button', { name: 'Actualizar cuentas', exact: true }).waitFor({ timeout: 30000 })
  const accounts = await rpc('crm.api.conversation_threads.list_accounts')
  assert.equal(accounts.data.actor, fixture.actor)
  console.log('PASS authenticated Desk Ctrl+K → Conversaciones → Open Conversaciones de clientes')
  if (kind === 'core') {
    assert.deepEqual(accounts.data.accounts, [])
    await root.getByText('No tienes cuentas de conversación disponibles.', { exact: true }).waitFor()
    assert.equal(await root.locator('textarea').count(), 0)
    console.log('PASS core-only authenticated native Desk Page loads with empty channel capability and no composer')
  } else if (entryOnly) {
    assert.deepEqual(accounts.data.accounts.map((a) => a.account_id), [fixture.account_id])
    await deniedEntry(root)
  } else {
    assert.deepEqual(accounts.data.accounts.map((a) => a.account_id), [fixture.account_id])
    assert.equal(await page.evaluate(() => frappe.route_options), null)
    console.log('PASS actual Desk entry consumes the exact authorized account route options')
    const threads = await rpc('crm.api.conversation_threads.list_threads', { provider: 'WhatsApp', account_id: fixture.account_id })
    assert.deepEqual(threads.data.items.map((t) => t.peer_id), [fixture.peer])
    assert.ok(!JSON.stringify(threads.data).includes('SECRET'))
    const deniedAccount = await rpc('crm.api.conversation_threads.list_threads', { provider: 'WhatsApp', account_id: fixture.denied_account_id })
    assert.equal(deniedAccount.error, 'PermissionError')
    for (const peer of [fixture.private_peer, fixture.clinical_peer]) {
      const denied = await rpc('crm.api.conversation_threads.open_thread', { provider: 'WhatsApp', account_id: fixture.account_id, peer_id: peer })
      assert.equal(denied.error, 'PermissionError')
    }
    await dismissDialogs()
    console.log('PASS actual scoped RPC excludes other account, disabled private assistant peer and clinical-only/mixed sources')
    await root.getByRole('button', { name: new RegExp('^' + fixture.peer + ' ·') }).click()
    await root.getByRole('heading', { name: fixture.peer, exact: true }).waitFor()
    await root.getByRole('button', { name: 'Aplicar cambio', exact: true }).waitFor()
    assert.equal(await root.locator('img').count(), 0)
    assert.ok(!(await root.innerText()).includes('SECRET'))
    const name = createHash('sha256').update(JSON.stringify([1, 'WhatsApp', fixture.account_id, fixture.peer])).digest('hex')
    const before = (await rpc('crm.api.outbox.list_intents', { conversation: name })).data
    assert.ok(before.every((intent) => intent.state === 'Cancelled'), 'Earlier owned proof intents must already be cancelled')
    await control('take')
    await root.getByRole('button', { name: 'Enviar respuesta', exact: true }).waitFor()
    const reply = 'Fictional manual reply <img src=x onerror="window.fixtureAttack=2">'
    await root.locator('textarea').fill(reply)
    await root.getByRole('button', { name: 'Enviar respuesta', exact: true }).click()
    await root.getByRole('button', { name: 'Comprobar solicitud', exact: true }).waitFor({ timeout: 30000 })
    await dismissDialogs()
    assert.equal(await root.locator('textarea').inputValue(), reply)
    assert.equal(await root.locator('textarea').isDisabled(), true)
    await root.getByRole('button', { name: 'Comprobar solicitud', exact: true }).click()
    await root.getByText('En cola', { exact: true }).waitFor()
    assert.equal(attempts.length, 2)
    assert.deepEqual(attempts[0], attempts[1], 'Response-loss recovery must reuse every frozen request field')
    const rows = (await rpc('crm.api.outbox.list_intents', { conversation: name })).data
    assert.equal(rows.length, before.length + 1)
    const intents = rows.filter((row) => !before.some((previous) => previous.name === row.name))
    assert.equal(intents.length, 1)
    assert.equal(intents[0].state, 'Queued')
    assert.equal(intents[0].text, reply)
    assert.equal(intents[0].attempts, 0)
    assert.equal(await root.locator('img').count(), 0)
    console.log('PASS account → exact thread → take → queue; lost response replay creates exactly one new durable intent with zero dispatch attempts')
    await page.setViewportSize({ width: 375, height: 812 })
    // Native Desk keeps its desktop navigation expanded across the resize.
    // Dismiss the standard mobile scrim using the same outside click as a user.
    await page.mouse.click(350, 100)
    const mobile = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      rootScroll: document.querySelector('.customer-conversations').scrollWidth,
      rootWidth: document.querySelector('.customer-conversations').clientWidth,
      attack: window.fixtureAttack || 0,
    }))
    assert.ok(mobile.scroll <= mobile.width, JSON.stringify(mobile))
    assert.ok(mobile.rootScroll <= mobile.rootWidth, JSON.stringify(mobile))
    assert.equal(mobile.attack, 0)
    await page.screenshot({ path: '/tmp/conversation-desk-mobile.png' })
    console.log('PASS native Desk 375px with inert HTML and no horizontal overflow ' + JSON.stringify(mobile))
    await root.getByRole('button', { name: 'Cancelar envío', exact: true }).click()
    await root.locator(`[data-intent="${intents[0].name}"]`).getByText('Cancelado', { exact: true }).waitFor()
    const cancelled = (await rpc('crm.api.outbox.get_intent', { name: intents[0].name })).data
    assert.equal(cancelled.state, 'Cancelled')
    await control('release')
    await root.getByText('Para responder necesitas el control humano vigente de esta conversación.', { exact: true }).waitFor()
    assert.equal(await root.locator('textarea').count(), 0)
    const stale = await rpc('crm.api.outbox.queue_message', {
      conversation: name, expected_generation: 2, request_id: 'fictional-stale-' + Date.now(), payload: { type: 'text', text: 'Must not queue' },
    })
    assert.ok(['PermissionError', 'TimestampMismatchError'].includes(stale.error), JSON.stringify(stale))
    assert.equal((await rpc('crm.api.outbox.list_intents', { conversation: name })).data.length, before.length + 1)
    await dismissDialogs()
    console.log('PASS actual cancellation state update and release remove composer; stale generation cannot create a second intent')
    console.log(JSON.stringify({ conversation: name, intent: intents[0].name, existing_cancelled_rows: before.length, new_rows: 1, same_key_requests: 2, total_queue_requests_including_stale: attempts.length, final_state: cancelled.state, actors: [fixture.actor] }))
    await deniedEntry(root)
  }
  assert.deepEqual(errors, [])
  console.log('PASS native Desk browser proof complete; no JavaScript runtime errors')
} catch (error) {
  console.log('FAIL ' + error.stack)
  console.log(JSON.stringify({ errors, workspace: await workspace() }))
  console.log((await page.locator('body').innerText()).slice(-3000))
  await page.screenshot({ path: `/tmp/conversation-desk-${kind}-failure.png`, fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
