// composables/leavePage.js: another app's page loads only once a sheet closed
// in the same tap has stepped back over its history entry (on a phone that
// back aborts a load started before it lands), and at once with no sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})

import BottomSheet from '@/components/ui/BottomSheet.vue'
import { _resetSheetHistory } from '@/components/ui/sheetHistory'
import { leaveTo } from '@/composables/leavePage'

const URL_OUT = '/scan/item/ITEM-1?return_to=%2Fcrm%2Fproductos%2FITEM-1'
const sheet = reactive({ open: false })
let app, root, assign, realLocation, sheetEntryAtAssign

const wait = async (ms = 30) => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await nextTick()
}

beforeEach(async () => {
  window.__ = (text) => text
  sheet.open = false
  sheetEntryAtAssign = []
  const router = createRouter({
    history: createWebHistory('/crm'),
    routes: [{ path: '/producto', component: { render: () => null } }],
  })
  router.push('/producto')
  await router.isReady()
  realLocation = window.location
  assign = vi.fn(() =>
    sheetEntryAtAssign.push(Boolean(window.history.state?.uiSheet)),
  )
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign },
  })
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      h(BottomSheet, {
        open: sheet.open,
        title: 'Herramientas',
        'onUpdate:open': (v) => (sheet.open = v),
      }),
  })
  app.use(router)
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await wait()
})

afterEach(async () => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: realLocation,
  })
  _resetSheetHistory()
  await wait()
})

describe('leaveTo', () => {
  it('loads the page once the sheet closed by the same tap has left history', async () => {
    sheet.open = true
    await wait()
    expect(window.history.state?.uiSheet).toBeTruthy()
    // The tap: the sheet closes and the page asks for another app's page.
    sheet.open = false
    const left = leaveTo(URL_OUT)
    expect(assign).not.toHaveBeenCalled()
    await left
    await wait(60)
    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(URL_OUT)
    expect(sheetEntryAtAssign).toEqual([false])
    expect(window.history.state?.uiSheet).toBeUndefined()
  })

  it('loads at once when no sheet is closing', async () => {
    await leaveTo(URL_OUT)
    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(URL_OUT)
  })
})
