import { chromium } from '/home/holymc2/muelle-worktrees/crm-standalone-20260909/frontend/node_modules/@playwright/test/index.mjs'
import fs from 'node:fs'
const base = 'http://127.0.0.1:18132'
const browser = await chromium.launch({ headless: true, executablePath: '/home/holymc2/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const optionalCalls = []
page.on('pageerror', e => errors.push(e.message))
page.on('request', r => { if (/\/api\/method\/(doco\.|doco_marketing\.|erpnext\.|taller\.|clinica\.)/.test(r.url())) optionalCalls.push(new URL(r.url()).pathname) })
try {
  const login = await context.request.post(base + '/api/method/login', { form: { usr: 'Administrator', pwd: fs.readFileSync('/tmp/crm-inquiry-test-admin-password', 'utf8') } })
  if (!login.ok()) throw new Error('Fictional test-site login failed: HTTP ' + login.status())
  await page.goto(base + '/crm/inquiries', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('inquiries-page').waitFor({ timeout: 30000 })
  console.log('PASS full standalone CRM shell opened /inquiries')
  await page.getByTestId('open-capture').click()
  const form = page.getByTestId('inquiry-capture')
  await form.locator('[name="title"]').fill('BROWSER-ACQ-20260909 fictional repair referral')
  await form.locator('[name="source_type"]').selectOption('Facebook')
  await form.locator('[name="source_url"]').fill('https://example.invalid/fictional-group-post')
  await form.locator('[name="source_text"]').fill('Requester A needs a screen. Referrer B mentions our shop. Buyer C asks separately. Fictional acceptance fixture.')
  for (const [index, name, role] of [[0,'Requester A','Requester'],[1,'Referrer B','Referrer'],[2,'Buyer C','Interested Person']]) {
    await form.getByTestId('capture-add-person').click()
    await form.locator('[data-field="display_name"]').nth(index).fill(name)
    await form.locator('[data-field="role"]').nth(index).selectOption(role)
  }
  const captureResponse = page.waitForResponse(r => r.url().endsWith('crm.api.inquiries.create_inquiry') && r.request().method() === 'POST')
  await form.getByTestId('capture-submit').click()
  const captureHttp = await captureResponse
  const captured = (await captureHttp.json()).message
  if (!captured?.name) throw new Error('Capture did not return an inquiry')
  await page.getByTestId('inquiry-detail').waitFor()
  const detail = page.getByTestId('inquiry-detail')
  const referrer = detail.locator('[data-person]').filter({hasText:'Referrer B'})
  if (await referrer.getByTestId('select-prospect').count()) throw new Error('Referrer offered conversion')
  const converted = []
  let replayHeaders
  for (const person of ['Requester A','Buyer C']) {
    const card = detail.locator('[data-person]').filter({hasText:person})
    await card.getByTestId('select-prospect').click()
    const pending = page.waitForResponse(r => r.url().endsWith('crm.api.inquiries.convert_person') && r.request().method() === 'POST')
    await card.getByTestId('convert-person').click()
    const response = await pending
    const result = (await response.json()).message
    if (!result?.lead || !result.created) throw new Error('Selected prospect did not create a lead')
    const headers = await response.request().allHeaders()
    replayHeaders = {'X-Frappe-CSRF-Token': headers['x-frappe-csrf-token'], 'X-Requested-With':'XMLHttpRequest'}
    const replay = await context.request.post(base + '/api/method/crm.api.inquiries.convert_person', {data: response.request().postDataJSON(), headers:replayHeaders})
    const replayed = (await replay.json()).message
    if (replayed?.lead !== result.lead || replayed.created) throw new Error('Conversion replay was not idempotent')
    converted.push(result.lead)
  }
  if (new Set(converted).size !== 2) throw new Error('Different buyers merged unexpectedly')
  const deniedReferrer = await context.request.post(base + '/api/method/crm.api.inquiries.convert_person', {data:{name:captured.name,person_key:captured.people.find(p=>p.role==='Referrer').person_key},headers:replayHeaders})
  if (deniedReferrer.ok()) throw new Error('Direct referrer conversion should be denied')
  await detail.locator('[name="next_action_at"]').fill('2030-01-15T09:30')
  const saved = page.waitForResponse(r=>r.url().endsWith('crm.api.inquiries.update_inquiry'))
  await detail.getByTestId('detail-save').click()
  if (!(await saved).ok()) throw new Error('Follow-up save failed')
  const closed = page.waitForResponse(r=>r.url().endsWith('crm.api.inquiries.update_inquiry'))
  await detail.getByTestId('detail-close').click()
  if ((await (await closed).json()).message.status !== 'Closed') throw new Error('Close failed')
  const reopened = page.waitForResponse(r=>r.url().endsWith('crm.api.inquiries.update_inquiry'))
  await detail.getByTestId('detail-close').click()
  if ((await (await reopened).json()).message.status !== 'New') throw new Error('Reopen failed')
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByTestId('inquiry-detail').waitFor()
  if (await page.getByTestId('inquiry-detail').getByRole('link',{name:/Abrir prospecto/}).count() !== 2) throw new Error('Converted buyers did not survive reload')
  if (await page.getByTestId('inquiry-detail').locator('[name="next_action_at"]').inputValue() !== '2030-01-15T09:30') throw new Error('Follow-up local time did not round-trip')
  fs.writeFileSync('/tmp/crm-inquiry-browser-fixture.json', JSON.stringify({inquiry:captured.name,leads:converted},null,2))
  console.log('PASS real HTTP capture, 3 roles, 2 explicit leads, stable retries, denied referrer conversion, follow-up, close/reopen and reload')
  await page.screenshot({ path: '/tmp/crm-inquiry-browser-desktop.png', fullPage: true })
  await page.setViewportSize({width:390,height:844})
  await page.getByTestId('inquiries-page').waitFor({state:'visible',timeout:15000})
  await page.getByTestId('inquiry-detail').waitFor({state:'visible',timeout:15000})
  await page.getByTestId('open-capture').waitFor({state:'visible',timeout:15000})
  await page.waitForFunction(()=>{const p=document.querySelector('.page-in');return !p || getComputedStyle(p).opacity === '1'})
  await page.screenshot({path:'/tmp/crm-inquiry-browser-mobile.png',fullPage:true})
  if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Mobile horizontal overflow')
  if (errors.length || optionalCalls.length) throw new Error('Unexpected runtime error or optional-app call')
  console.log('PASS desktop/mobile browser: no runtime errors, no optional-app RPCs, no horizontal overflow')
  console.log(JSON.stringify({ errors, optionalCalls }))
} catch(e) {
  await page.screenshot({ path: '/tmp/crm-inquiry-browser-failure.png', fullPage:true }).catch(()=>{})
  console.log('FAIL ' + e.message)
  console.log('PAGE ' + (await page.locator('body').innerText()).slice(0,2400))
  console.log(JSON.stringify({errors,optionalCalls}))
  process.exitCode=1
} finally { await browser.close() }
