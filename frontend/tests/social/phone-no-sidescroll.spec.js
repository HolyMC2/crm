// Phone layouts scroll vertically only.
//
// MobileLayout clips horizontal overflow on the shell column and on the page
// scroller, so a wide element never drags the page sideways — but clipping hides
// content. This spec asserts the ROOT condition on every route at 390 px: nothing
// is wider than the phone unless a nearer container scrolls or clips it on its
// own (chip rows, kanban boards, tables). scrollWidth on the shell must equal
// its clientWidth.
import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const STATIC_ROUTES = [
  '/',
  '/notifications',
  '/dashboard',
  '/inquiries',
  '/leads',
  '/leads/view/list',
  '/leads/view/kanban',
  '/deals',
  '/deals/view/list',
  '/deals/view/kanban',
  '/notes/view/list',
  '/tasks',
  '/contacts/view/list',
  '/organizations/view/list',
  '/call-logs',
  '/call-logs/view/list',
  '/calendar',
  '/data-import',
  '/welcome',
  '/inbox',
  '/pipeline-analysis',
  '/campaigns',
  '/chatflows',
  '/reports',
  '/workload',
  '/score-rules',
  '/webshop',
  '/whatsapp-queue',
  '/social',
  '/social/evergreen',
  '/social/mentions',
]

async function measure(page) {
  return page.evaluate(() => {
    const width = window.innerWidth
    const pageEl = document.querySelector('.page-in')
    const column = pageEl?.parentElement
    const shell = new Set([pageEl, column, document.body, document.documentElement].filter(Boolean))
    const contained = new Set(['auto', 'scroll', 'hidden', 'clip'])
    const escaped = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue
      const r = el.getBoundingClientRect()
      if ((r.width === 0 && r.height === 0) || (r.right <= width + 1 && r.left >= -1)) continue
      let owner = el.parentElement
      let owned = false
      while (owner && !shell.has(owner)) {
        if (contained.has(getComputedStyle(owner).overflowX)) { owned = true; break }
        owner = owner.parentElement
      }
      if (owned) continue
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''
      escaped.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} right=${Math.round(r.right)}`)
    }
    return {
      width,
      documentScrollWidth: document.documentElement.scrollWidth,
      pageScrollWidth: pageEl?.scrollWidth ?? 0,
      pageClientWidth: pageEl?.clientWidth ?? width,
      columnScrollWidth: column?.scrollWidth ?? 0,
      columnClientWidth: column?.clientWidth ?? width,
      escaped: escaped.slice(0, 10),
    }
  })
}

async function expectVerticalOnly(page, route) {
  await page.goto(`/crm${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800) // lists, boards and charts settle
  const m = await measure(page)
  expect(m.documentScrollWidth, `${route}: the document scrolls sideways`).toBeLessThanOrEqual(m.width)
  expect(m.columnScrollWidth, `${route}: the shell column is wider than the phone`).toBeLessThanOrEqual(m.columnClientWidth)
  expect(m.pageScrollWidth, `${route}: the page scroller has content wider than the phone`).toBeLessThanOrEqual(m.pageClientWidth)
  expect(m.escaped, `${route}: content escapes the viewport with no container scrolling it`).toEqual([])
}

async function firstName(page, doctype, filters = '') {
  const res = await page.request.get(`/api/resource/${encodeURIComponent(doctype)}?limit_page_length=1&order_by=modified desc${filters}`)
  if (!res.ok()) return null
  return (await res.json())?.data?.[0]?.name || null
}

test.describe('phone: vertical scroll only', () => {
  // One login for the whole file: a POST per test trips the lab proxy's burst
  // limit (429). context.addCookies sets the HttpOnly sid that document.cookie
  // cannot.
  let cookies = []
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: process.env.CRM_BASE_URL,
      ignoreHTTPSErrors: true,
    })
    const res = await api.post('/api/method/login', {
      form: { usr: process.env.CRM_TEST_USER, pwd: process.env.CRM_TEST_PASSWORD },
    })
    if (!res.ok()) throw new Error(`login failed: HTTP ${res.status()}`)
    cookies = (await api.storageState()).cookies
    await api.dispose()
  })
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(cookies)
  })

  for (const route of STATIC_ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      await expectVerticalOnly(page, route)
    })
  }

  test('record pages (first lead, deal, contact, organization, campaign)', async ({ page }) => {
    const lead = await firstName(page, 'CRM Lead')
    if (lead) await expectVerticalOnly(page, `/leads/${encodeURIComponent(lead)}`)
    const deal = await firstName(page, 'CRM Deal')
    if (deal) {
      await expectVerticalOnly(page, `/deals/${encodeURIComponent(deal)}`)
      await expectVerticalOnly(page, `/deal/${encodeURIComponent(deal)}`)
    }
    const contact = await firstName(page, 'Contact')
    if (contact) await expectVerticalOnly(page, `/contacts/${encodeURIComponent(contact)}`)
    const org = await firstName(page, 'CRM Organization')
    if (org) await expectVerticalOnly(page, `/organizations/${encodeURIComponent(org)}`)
    const campaign = await firstName(page, 'CRM Campaign')
    if (campaign) await expectVerticalOnly(page, `/campaigns/${encodeURIComponent(campaign)}`)
  })
})
