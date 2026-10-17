// components/ui/sheetHistory.js with BottomSheet on a real web history:
// back closes the top sheet without a router navigation, closing then
// navigating keeps the navigation, a link inside a sheet replaces its entry,
// and swapping sheets keeps the new one open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})

import BottomSheet from '@/components/ui/BottomSheet.vue'
import { _openSheets, _resetSheetHistory } from '@/components/ui/sheetHistory'

let app, root, router, guards
const sheets = reactive({ a: false, b: false })
const wait = async (ms = 30) => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await nextTick()
}
const backAndWait = async () => {
  window.history.back()
  await wait(60)
}

async function mountPage() {
  router = createRouter({
    history: createWebHistory('/crm'),
    routes: [
      { path: '/a', component: { render: () => null } },
      { path: '/b', component: { render: () => null } },
    ],
  })
  guards = 0
  router.beforeEach(() => {
    guards += 1
  })
  router.push('/a')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => [
      h(BottomSheet, {
        open: sheets.a,
        title: 'A',
        'onUpdate:open': (v) => (sheets.a = v),
      }),
      h(BottomSheet, {
        open: sheets.b,
        title: 'B',
        'onUpdate:open': (v) => (sheets.b = v),
      }),
    ],
  })
  app.use(router)
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await wait()
  guards = 0
}

beforeEach(async () => {
  window.__ = (text) => text
  sheets.a = false
  sheets.b = false
  await mountPage()
})
afterEach(async () => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  _resetSheetHistory()
  await wait()
})

describe('sheet history', () => {
  it('back closes the sheet and runs no router navigation', async () => {
    sheets.a = true
    await wait()
    expect(window.history.state?.uiSheet).toBeTruthy()
    await backAndWait()
    expect(sheets.a).toBe(false)
    expect(router.currentRoute.value.path).toBe('/a')
    expect(guards).toBe(0)
    expect(window.history.state?.uiSheet).toBeUndefined()
  })

  it('back closes only the top sheet', async () => {
    sheets.a = true
    await wait()
    sheets.b = true
    await wait()
    await backAndWait()
    expect([sheets.a, sheets.b]).toEqual([true, false])
    await backAndWait()
    expect([sheets.a, sheets.b]).toEqual([false, false])
    expect(guards).toBe(0)
  })

  it('closing in the UI and then navigating keeps the navigation', async () => {
    sheets.a = true
    await wait()
    sheets.a = false
    await nextTick()
    router.push('/b')
    await wait(80)
    expect(router.currentRoute.value.path).toBe('/b')
    expect(window.location.pathname).toBe('/crm/b')
    await backAndWait()
    expect(router.currentRoute.value.path).toBe('/a')
    expect(window.history.state?.uiSheet).toBeUndefined()
  })

  it('a link inside an open sheet replaces its entry', async () => {
    sheets.a = true
    await wait()
    await router.push('/b')
    await wait()
    expect(sheets.a).toBe(false)
    expect(_openSheets()).toEqual([])
    await backAndWait()
    // One back reaches the page, not a dead sheet entry.
    expect(router.currentRoute.value.path).toBe('/a')
    expect(window.history.state?.uiSheet).toBeUndefined()
  })

  it('swapping sheets in one handler keeps the new one open', async () => {
    sheets.a = true
    await wait()
    sheets.a = false
    sheets.b = true
    await wait(80)
    expect(sheets.b).toBe(true)
    expect(_openSheets()).toHaveLength(1)
    expect(window.history.state?.uiSheet).toBeTruthy()
    await backAndWait()
    expect(sheets.b).toBe(false)
    expect(window.history.state?.uiSheet).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/a')
  })
})
