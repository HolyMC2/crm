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
 const login=await context.request.post(base+'/api/method/login',{form:{usr:'Administrator',pwd:fs.readFileSync('/tmp/crm-inquiry-test-admin-password','utf8')}})
 if(!login.ok()) throw new Error('Fictional login failed')
 const fixture=JSON.parse(fs.readFileSync('/tmp/crm-inquiry-browser-fixture.json','utf8'))
 await page.goto(base+'/crm/inquiries?name='+fixture.inquiry,{waitUntil:'domcontentloaded'})
 await page.getByTestId('inquiry-detail').waitFor({state:'visible',timeout:15000})
 await page.setViewportSize({width:390,height:844})
 await page.getByTestId('inquiries-page').waitFor({state:'visible',timeout:15000})
 await page.getByTestId('inquiry-detail').waitFor({state:'visible',timeout:15000})
 await page.getByTestId('open-capture').waitFor({state:'visible',timeout:15000})
 await page.waitForFunction(()=>{const p=document.querySelector('.page-in');return !p || getComputedStyle(p).opacity === '1'})
 const geometry = await page.evaluate(() => {
   const root = document.querySelector('[data-testid="inquiries-page"]')
   const header = root.querySelector('header').getBoundingClientRect()
   const button = root.querySelector('[data-testid="open-capture"]').getBoundingClientRect()
   const inbox = root.querySelector('section').getBoundingClientRect()
   const hit = document.elementFromPoint(button.x + button.width/2, button.y + button.height/2)
   return { headerBottom:header.bottom, buttonTop:button.top, buttonBottom:button.bottom, inboxTop:inbox.top,
            buttonClickable:!!hit?.closest('[data-testid="open-capture"]'), viewportBottom:document.querySelector('nav[aria-label="Navegación principal"]')?.getBoundingClientRect().top || innerHeight - 54 }
 })
 if (geometry.buttonTop < 0 || geometry.buttonBottom > geometry.headerBottom + 1 || geometry.buttonBottom > geometry.inboxTop || geometry.buttonBottom > geometry.viewportBottom || !geometry.buttonClickable) throw new Error('Capture geometry failed '+JSON.stringify(geometry))
 await page.getByTestId('open-capture').click()
 await page.getByTestId('inquiry-capture').waitFor({state:'visible',timeout:5000})
 await page.screenshot({path:'/tmp/crm-inquiry-browser-mobile.png',fullPage:true})
 const facts=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,pageCount:document.querySelectorAll('[data-testid="inquiries-page"]').length,detailCount:document.querySelectorAll('[data-testid="inquiry-detail"]').length}))
 if(facts.scrollWidth>facts.width || !facts.pageCount || !facts.detailCount || errors.length || optionalCalls.length) throw new Error('Mobile failed '+JSON.stringify({facts,geometry,errors,optionalCalls}))
 console.log('PASS real mobile layout after lazy-load/animation: '+JSON.stringify({facts,geometry,errors,optionalCalls}))
} catch(e){console.log('FAIL '+e.message);process.exitCode=1} finally{await browser.close()}
