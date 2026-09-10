// Authorized, fictional isolated-site Desk configuration acceptance. No product edits.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const require = createRequire('/home/holymc2/muelle-host/worktrees/meta-crm-20260910/frontend/package.json')
const { chromium } = require('@playwright/test')
const fixture = JSON.parse(readFileSync('/tmp/webchat-chain-fixture.json', 'utf8'))
assert.equal(fixture.site, 'meta-reliability-test-20260910.lab.xoloitzcuintles.com')
const base = 'http://127.0.0.1:46832'
let proof = 'chat-config-proof-' + randomBytes(5).toString('hex')
const target = new URL('.', import.meta.url)
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } })
await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
const page = await context.newPage()
page.setDefaultTimeout(20000)
const errors = [], saves = []
page.on('pageerror', (error) => errors.push(error.message))
let loseCreate = false
await page.route('**/api/method/crm.api.webchat.configure_channel', async (route) => {
  const values = Object.fromEntries(new URLSearchParams(route.request().postData()))
  saves.push(values)
  if (loseCreate && !values.channel_id) {
    loseCreate = false
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const saved = (await response.json()).message
    assert.equal(saved.profile, proof)
    assert.equal(saved.enabled, 0)
    await route.abort('failed')
    return
  }
  await route.continue()
})
async function rpc(method, args = {}) {
  return page.evaluate(async ({ method, args }) => (await frappe.call({ method, args })).message, { method, args })
}
async function openConfig() {
  await page.locator('.customer-conversations').getByRole('button', { name: 'Configurar chat de tienda', exact: true }).click()
  const dialog = page.locator('.modal:visible').filter({ has: page.getByRole('heading', { name: 'Chat de tienda', exact: true }) })
  await dialog.waitFor()
  await page.waitForFunction(() => window.cur_dialog?.title === 'Chat de tienda')
  return dialog
}
async function closeDialogs() {
  for (let i = 0; i < 4; i++) {
    const modal = page.locator('.modal:visible').last()
    if (!await modal.count()) return
    const element = await modal.elementHandle()
    await modal.locator('[data-dismiss="modal"]').first().click()
    // Wait on this exact fading node; a :visible locator would switch to the
    // next underlying dialog before Bootstrap completes its hidden event.
    await element.waitForElementState('hidden')
  }
}
try {
  const login = await context.request.post(base + '/api/method/login', { form: { usr: fixture.actor, pwd: fixture.password } })
  assert.equal(login.status(), 200)
  if (process.argv.includes('--boot-probe')) {
    const response = await context.request.get(base + '/app')
    const html = await response.text()
    console.log(JSON.stringify({ status: response.status(), path: new URL(response.url()).pathname,
      setup_complete: html.match(/["']setup_complete["']\s*:\s*(?:true|false|[01])/g) || [] }))
    const observed = []
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame() || observed.length >= 8) return
      try {
        await page.waitForFunction(() => window.frappe?.boot, { timeout: 500 })
        observed.push(await page.evaluate(() => ({ path: location.pathname,
          setup_complete: frappe.boot.setup_complete ?? null,
          sysdefaults: frappe.boot.sysdefaults?.setup_complete ?? null,
          home_page: frappe.boot.home_page ?? null })))
      } catch {}
    })
    await page.goto(base + '/app', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    console.log(JSON.stringify({ browser_setup_observations: observed }))
    await browser.close()
    process.exit(0)
  }
  // Direct native Page entry avoids this intentionally unfinished lab's saved
  // setup-wizard homepage; the Page and every broker call remain actual.
  await page.goto(base + '/app/customer-conversations', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Actualizar cuentas', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => frappe.user_roles.includes('System Manager')), true)
  const accounts = (await rpc('crm.api.conversation_threads.list_accounts')).accounts
  const selected = accounts.findIndex((row) => row.account_id === fixture.channel_id)
  assert.ok(selected >= 0)
  await page.locator('.customer-conversations select').first().selectOption(String(selected))
  let dialog, created
  if (process.argv.includes('--resume-created')) {
    const saved = JSON.parse(readFileSync(new URL('WEBCHAT_CONFIG_CREATED.json', target), 'utf8'))
    assert.equal(saved.site, fixture.site)
    proof = saved.profile
    created = (await rpc('crm.api.webchat.list_channels')).channels.find((row) => row.account_id === saved.channel_id)
    assert.equal(created.profile, proof)
    assert.equal(created.enabled, 0)
    console.log('RESUME existing committed disabled fixture; no label update or second create is performed')
  } else {
  const initial = (await rpc('crm.api.webchat.list_channels')).channels.find((row) => row.account_id === fixture.channel_id)
  assert.ok(initial)
  assert.equal(initial.enabled, 1)
  dialog = await openConfig()
  await dialog.locator('select[data-fieldname="channel"]').selectOption(fixture.channel_id)
  const binding = await page.evaluate(() => ({
    profile: cur_dialog.get_value('profile'), public_origin: cur_dialog.get_value('public_origin'),
    profile_readonly: cur_dialog.fields_dict.profile.df.read_only,
    origin_readonly: cur_dialog.fields_dict.public_origin.df.read_only,
  }))
  assert.deepEqual(binding, { profile: initial.profile, public_origin: initial.public_origin, profile_readonly: 1, origin_readonly: 1 })
  const updatedLabel = 'Equipo de Tienda Demo · configuración verificada'
  await dialog.locator('input[data-fieldname="label"]').fill(updatedLabel)
  await dialog.getByRole('button', { name: 'Guardar canal', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const updated = (await rpc('crm.api.webchat.list_channels')).channels.find((row) => row.account_id === fixture.channel_id)
  assert.equal(updated.label, updatedLabel)
  assert.equal(updated.profile, initial.profile)
  assert.equal(updated.public_origin, initial.public_origin)
  assert.equal(updated.enabled, 1)
  assert.equal(saves[0].expected_modified, initial.modified)
  assert.equal(saves[0].channel_id, fixture.channel_id)
  console.log('PASS actual manager Desk dialog mounts without initialization error; saved binding is read-only and label update carries the saved revision')

  dialog = await openConfig()
  assert.equal(await dialog.locator('input[data-fieldname="enabled"]').isChecked(), false)
  await dialog.locator('input[data-fieldname="label"]').fill('Fictional disabled configuration proof')
  await dialog.locator('input[data-fieldname="profile"]').fill(proof)
  await dialog.locator('input[data-fieldname="public_origin"]').fill('https://example.invalid')
  await page.setViewportSize({ width: 375, height: 812 })
  const dimensions = await dialog.evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }))
  assert.ok(dimensions.scroll <= dimensions.width)
  assert.ok(dimensions.page <= dimensions.viewport)
  await page.screenshot({ path: new URL('WEBCHAT_CONFIG_375.png', target).pathname })
  loseCreate = true
  await dialog.getByRole('button', { name: 'Guardar canal', exact: true }).click()
  await page.getByText('No se confirmó el cambio. Cierra y vuelve a abrir la configuración para comprobar el canal guardado antes de intentar otro cambio.', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Guardar canal', exact: true }).isDisabled(), true)
  const createdRows = (await rpc('crm.api.webchat.list_channels')).channels.filter((row) => row.profile === proof && row.public_origin === 'https://example.invalid')
  assert.equal(createdRows.length, 1)
  created = createdRows[0]
  assert.equal(created.enabled, 0)
  assert.equal(saves.filter((row) => !row.channel_id).length, 1)
  writeFileSync(new URL('WEBCHAT_CONFIG_CREATED.json', target), JSON.stringify({ site: fixture.site, channel_id: created.account_id, profile: proof, public_origin: created.public_origin, enabled: 0 }, null, 2) + '\n')
  console.log('PASS actual create defaults disabled; deliberately dropped committed response disables stale save and asks to reopen; actual list contains exactly one binding')
  await closeDialogs()
  await page.setViewportSize({ width: 1365, height: 1000 })
  }
  dialog = await openConfig()
  await dialog.locator('select[data-fieldname="channel"]').selectOption(created.account_id)
  assert.equal(await dialog.locator('input[data-fieldname="enabled"]').isChecked(), false)
  await closeDialogs()
  await page.locator('.customer-conversations').getByRole('button', { name: 'Asignar agente', exact: true }).click()
  await page.waitForFunction((channel) => window.cur_frm?.doctype === 'User Permission' && cur_frm.doc.for_value === channel, fixture.channel_id)
  const grant = await page.evaluate(() => ({ doctype: cur_frm.doctype, is_new: !!cur_frm.is_new(), allow: cur_frm.doc.allow, for_value: cur_frm.doc.for_value, apply_to_all_doctypes: cur_frm.doc.apply_to_all_doctypes, user: cur_frm.doc.user || null }))
  assert.deepEqual(grant, { doctype: 'User Permission', is_new: true, allow: 'CRM Webchat Channel', for_value: fixture.channel_id, apply_to_all_doctypes: 1, user: null })
  console.log('PASS Asignar agente opens actual unsaved User Permission with exact channel scope; no user grant saved')

  const readOnly = `import sys,os,json
sys.path.insert(0,"/tmp/meta-wa-20260910")
os.chdir("/home/frappe/frappe-bench/sites")
import frappe
frappe.init("meta-reliability-test-20260910.lab.xoloitzcuintles.com")
frappe.connect()
assert all(int(frappe.conf.get(k) or 0)==1 for k in ("maintenance_mode","pause_scheduler","mute_emails"))
print(json.dumps({"sessions":frappe.db.count("CRM Webchat Session",{"channel":sys.argv[1]}),"channel_count":frappe.db.count("CRM Webchat Channel",{"profile":sys.argv[2],"public_origin":"https://example.invalid"}),"enabled":frappe.db.get_value("CRM Webchat Channel",sys.argv[1],"enabled"),"main_enabled":frappe.db.get_value("CRM Webchat Channel",sys.argv[3],"enabled")}))
frappe.db.rollback()
frappe.destroy()`
  const output = execFileSync('docker', ['compose', 'exec', '-T', 'backend', '/home/frappe/frappe-bench/env/bin/python', '-c', readOnly, created.account_id, proof, fixture.channel_id], { cwd: '/home/holymc2/muelle-host/muelle', encoding: 'utf8', timeout: 30000 })
  const database = JSON.parse(output.trim().split('\n').at(-1))
  assert.deepEqual(database, { sessions: 0, channel_count: 1, enabled: 0, main_enabled: 1 })
  assert.deepEqual(errors, [])
  console.log('PASS read-only isolated DB proof: ' + JSON.stringify(database))
  console.log('PASS native configuration acceptance: no JavaScript errors, no 375px overflow; new channel retained disabled for audit')
} catch (error) {
  console.log('FAIL ' + error.stack)
  console.log('JavaScript errors: ' + JSON.stringify(errors))
  await page.screenshot({ path: new URL('WEBCHAT_CONFIG_FAILURE.png', target).pathname, fullPage: true }).catch(() => undefined)
  process.exitCode = 1
} finally { await browser.close() }
