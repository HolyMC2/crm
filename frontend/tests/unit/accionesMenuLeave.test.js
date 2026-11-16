// The record's bolt on a phone (AccionesMenu as a BottomSheet): a step with
// `href` loads another app (Escáner, Desk) only once the sheet's back over its
// history entry has landed, since that late back cancels a page load started
// before it. Every other step still runs inside the tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})

import AccionesMenu from '@/components/documentos/AccionesMenu.vue'
import { recordActionsFor } from '@/documentos/acciones'
import { _resetSheetHistory } from '@/components/ui/sheetHistory'

const SCAN = '/scan/inbound?source_doctype=Purchase+Invoice&source_name=PI-1'
let app, root, picks, assign, realLocation, sheetEntryAtAssign

const wait = async (ms = 30) => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await nextTick()
}

beforeEach(async () => {
  window.__ = (text) => text
  picks = []
  sheetEntryAtAssign = []
  const router = createRouter({
    history: createWebHistory('/crm'),
    routes: [{ path: '/factura', component: { render: () => null } }],
  })
  router.push('/factura')
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
  const groups = recordActionsFor({
    steps: [
      { label: 'Pay', icon: 'lucide-wallet' },
      { label: 'Verify and put away', icon: 'lucide-scan-barcode', href: SCAN },
      { label: 'Survey', icon: 'lucide-link', href: '/x', external: true },
    ],
  })
  app = createApp({
    render: () =>
      h(AccionesMenu, {
        groups,
        phone: true,
        onPick: (action) => picks.push(action.key),
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

async function openBolt() {
  document.querySelector('[data-testid="documentos-acciones"]').click()
  await wait()
  expect(window.history.state?.uiSheet).toBeTruthy()
}
const row = (key) => document.querySelector(`[data-accion="${key}"]`)

describe('the bolt sheet on a phone', () => {
  it('loads a step with href once the sheet has left history, and picks nothing', async () => {
    await openBolt()
    row('paso:1').click()
    await wait(80)
    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(SCAN)
    expect(sheetEntryAtAssign).toEqual([false])
    expect(window.history.state?.uiSheet).toBeUndefined()
    expect(picks).toEqual([])
  })

  it('runs every other step inside the tap', async () => {
    await openBolt()
    row('paso:0').click()
    // Synchronously: a file picker or a new tab needs the tap's activation.
    expect(picks).toEqual(['paso:0'])
    await wait(80)
    expect(assign).not.toHaveBeenCalled()
    expect(window.history.state?.uiSheet).toBeUndefined()
  })

  it('leaves an external step to the page (a new tab, inside the tap)', async () => {
    await openBolt()
    row('paso:2').click()
    expect(picks).toEqual(['paso:2'])
    await wait(80)
    expect(assign).not.toHaveBeenCalled()
  })
})
