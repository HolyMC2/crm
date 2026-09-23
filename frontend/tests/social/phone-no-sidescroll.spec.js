// Phone layouts scroll vertically only.
//
// MobileLayout clips horizontal overflow on the shell column and on the page
// scroller, so a wide element never drags the page sideways — but clipping hides
// content. This spec asserts the ROOT condition on every route at 390 px: nothing
// is wider than the phone unless a nearer container scrolls or clips it on its
// own (chip rows, kanban boards, tables). scrollWidth on the shell must equal
// its clientWidth.
import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})

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
    const pageEl = document.querySelector('#app .page-in')
    const column = pageEl?.parentElement
    if (!pageEl || !column || !pageEl.clientWidth || !column.clientWidth) {
      throw new Error('CRM mobile shell is missing or has no rendered width')
    }
    const shell = new Set(
      [pageEl, column, document.body, document.documentElement].filter(Boolean),
    )
    const contained = new Set(['auto', 'scroll', 'hidden', 'clip'])
    const escaped = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el)
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        cs.position === 'fixed'
      )
        continue
      const r = el.getBoundingClientRect()
      if (
        (r.width === 0 && r.height === 0) ||
        (r.right <= width + 1 && r.left >= -1)
      )
        continue
      let owner = el.parentElement
      let owned = false
      while (owner && !shell.has(owner)) {
        if (contained.has(getComputedStyle(owner).overflowX)) {
          owned = true
          break
        }
        owner = owner.parentElement
      }
      if (owned) continue
      const cls =
        typeof el.className === 'string'
          ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : ''
      escaped.push(
        `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} right=${Math.round(r.right)}`,
      )
    }
    return {
      width,
      documentScrollWidth: document.documentElement.scrollWidth,
      pageScrollWidth: pageEl.scrollWidth,
      pageClientWidth: pageEl.clientWidth,
      columnScrollWidth: column.scrollWidth,
      columnClientWidth: column.clientWidth,
      escaped: escaped.slice(0, 10),
    }
  })
}

async function expectVerticalOnly(page, route) {
  const response = await page.goto(`/crm${route}`, { waitUntil: 'networkidle' })
  expect(
    response,
    `${route}: navigation returned no document response`,
  ).not.toBeNull()
  expect(
    response.ok(),
    `${route}: document returned HTTP ${response.status()}`,
  ).toBe(true)
  await expect(page, `${route}: redirected to login`).not.toHaveURL(
    /\/login(?:[/?#]|$)/,
  )
  await expect(
    page.locator('#app .page-in'),
    `${route}: CRM mobile shell did not render`,
  ).toBeVisible()
  await expect(
    page.locator('#app #app-header'),
    `${route}: CRM header did not mount`,
  ).toBeAttached()
  await expect(
    page.locator('#app .page-in > :visible').first(),
    `${route}: route content did not render`,
  ).toBeVisible()
  await page.waitForTimeout(800) // lists, boards and charts settle
  await expect(
    page,
    `${route}: redirected to login after mounting`,
  ).not.toHaveURL(/\/login(?:[/?#]|$)/)
  const m = await measure(page)
  expect(
    m.documentScrollWidth,
    `${route}: the document scrolls sideways`,
  ).toBeLessThanOrEqual(m.width)
  expect(
    m.columnScrollWidth,
    `${route}: the shell column is wider than the phone`,
  ).toBeLessThanOrEqual(m.columnClientWidth)
  expect(
    m.pageScrollWidth,
    `${route}: the page scroller has content wider than the phone`,
  ).toBeLessThanOrEqual(m.pageClientWidth)
  expect(
    m.escaped,
    `${route}: content escapes the viewport with no container scrolling it`,
  ).toEqual([])
}

async function firstName(page, doctype, filters = '') {
  const res = await page.request.get(
    `/api/resource/${encodeURIComponent(doctype)}?limit_page_length=1&order_by=modified desc${filters}`,
    { maxRedirects: 0 },
  )
  expect(
    res.ok(),
    `${doctype}: record lookup returned HTTP ${res.status()}`,
  ).toBe(true)
  const { data } = await res.json()
  expect(
    Array.isArray(data),
    `${doctype}: record lookup did not return a data array`,
  ).toBe(true)
  return data[0]?.name || null
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
      form: {
        usr: process.env.CRM_TEST_USER,
        pwd: process.env.CRM_TEST_PASSWORD,
      },
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

  for (const route of ['/leads/view/kanban', '/deals/view/kanban']) {
    test(`Kanban pager navigation ${route}`, async ({ page }) => {
      await expectVerticalOnly(page, route)
      const pager = page.locator('[data-kanban-pager]')
      const board = page.locator('[data-kanban-board]')
      const buttons = pager.getByRole('button')
      const currentChipFits = () =>
        pager.evaluate((el) => {
          const chip = el
            .querySelector('[aria-current="true"]')
            ?.getBoundingClientRect()
          const bounds = el.getBoundingClientRect()
          return Boolean(
            chip &&
            chip.left >= bounds.left - 1 &&
            chip.right <= bounds.right + 1,
          )
        })
      await expect(pager).toHaveAttribute('role', 'group')
      await expect(pager).toHaveAttribute('aria-label', /\S/)
      await expect(pager.locator('[role="tab"]')).toHaveCount(0)
      await expect(pager.locator('[aria-current="true"]')).toHaveCount(1)
      expect(await buttons.count()).toBeGreaterThan(0)
      const sizes = await buttons.evaluateAll((elements) =>
        elements.map((el) => {
          const { width, height } = el.getBoundingClientRect()
          return { width, height }
        }),
      )
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(44)
        expect(size.height).toBeGreaterThanOrEqual(44)
      }

      // Native buttons all remain in the Tab sequence; Enter selects the stage.
      await buttons.first().focus()
      for (let i = 1; i < (await buttons.count()); i++) {
        await page.keyboard.press('Tab')
        await expect(buttons.nth(i)).toBeFocused()
      }
      await page.keyboard.press('Enter')
      await expect(buttons.last()).toHaveAttribute('aria-current', 'true')
      await expect
        .poll(() =>
          board.evaluate((el) => {
            const columns = Array.from(
              el.querySelectorAll('[data-kanban-column]'),
            )
            const left = el.getBoundingClientRect().left
            const nearest = columns.reduce(
              (best, column, index) =>
                Math.abs(column.getBoundingClientRect().left - left) <
                best.distance
                  ? {
                      index,
                      distance: Math.abs(
                        column.getBoundingClientRect().left - left,
                      ),
                    }
                  : best,
              { index: -1, distance: Infinity },
            )
            return nearest.index === columns.length - 1
          }),
        )
        .toBe(true)
      await expect.poll(currentChipFits).toBe(true)

      // A swipe-equivalent board scroll must also update and reveal the chip.
      await board.evaluate((el) =>
        el.scrollTo({ left: 0, behavior: 'instant' }),
      )
      await expect(buttons.first()).toHaveAttribute('aria-current', 'true')
      await expect.poll(currentChipFits).toBe(true)
      const measured = await measure(page)
      expect(measured.documentScrollWidth).toBeLessThanOrEqual(measured.width)
      expect(measured.escaped).toEqual([])

      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
        document.documentElement.classList.add('dark')
      })
      await page.waitForTimeout(400) // let the theme color transition finish
      const countContrast = await pager
        .locator('[aria-current="true"]')
        .evaluate((chip) => {
          const count = chip.querySelector('.tabular-nums')
          if (!count) throw new Error('The current Kanban chip has no count')
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })
          if (!ctx)
            throw new Error(
              'Cannot measure Kanban count contrast without Canvas 2D',
            )
          // Canvas resolves modern computed colors such as color(srgb ...) and
          // oklch(...) to sRGB bytes; parsing their numeric text would be wrong.
          function luminance(cssColor) {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = cssColor
            ctx.fillRect(0, 0, 1, 1)
            const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data
            if (alpha !== 255)
              throw new Error(
                'Kanban count contrast requires opaque text and chip background',
              )
            const linear = [r, g, b].map((byte) => {
              const value = byte / 255
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4
            })
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
          }
          const foreground = getComputedStyle(count).color
          const background = getComputedStyle(chip).backgroundColor
          const ink = luminance(foreground)
          const surface = luminance(background)
          return {
            foreground,
            background,
            ratio:
              (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05),
          }
        })
      expect(
        countContrast.ratio,
        `${route}: dark current-column count contrast ${JSON.stringify(countContrast)}`,
      ).toBeGreaterThanOrEqual(4.5)
    })
  }

  test('record pages (first lead, deal, contact, organization, campaign)', async ({
    page,
  }) => {
    const lead = await firstName(page, 'CRM Lead')
    if (lead)
      await expectVerticalOnly(page, `/leads/${encodeURIComponent(lead)}`)
    const deal = await firstName(page, 'CRM Deal')
    if (deal) {
      await expectVerticalOnly(page, `/deals/${encodeURIComponent(deal)}`)
      await expectVerticalOnly(page, `/deal/${encodeURIComponent(deal)}`)
    }
    const contact = await firstName(page, 'Contact')
    if (contact)
      await expectVerticalOnly(page, `/contacts/${encodeURIComponent(contact)}`)
    const org = await firstName(page, 'CRM Organization')
    if (org)
      await expectVerticalOnly(
        page,
        `/organizations/${encodeURIComponent(org)}`,
      )
    const campaign = await firstName(page, 'CRM Campaign')
    if (campaign)
      await expectVerticalOnly(
        page,
        `/campaigns/${encodeURIComponent(campaign)}`,
      )
  })
})
