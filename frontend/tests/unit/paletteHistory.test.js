// The command palette on a real web history: on a phone it fills the screen,
// so back (the button or the gesture) must close it and stay on the page, not
// leave the page or close an installed app. Closing it in the UI leaves no
// dead entry behind, and a result that opens a page keeps one way back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

vi.mock('frappe-ui', async () => {
  const { ref } = await import('vue')
  return {
    call: vi.fn(async () => null),
    toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
    useColorScheme: () => ({
      colorScheme: ref('light'),
      setColorScheme: vi.fn(),
    }),
    createResource: () => ({ data: null, fetch: vi.fn() }),
  }
})

import CommandPalette from '@/components/shell/CommandPalette.vue'
import { _openSheets, _resetSheetHistory } from '@/components/ui/sheetHistory'

let app, root, router, guards
const open = ref(false)
const wait = async (ms = 30) => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await nextTick()
}
const backAndWait = async () => {
  window.history.back()
  await wait(60)
}
const palette = () => document.querySelector('[data-shell-layer="palette"]')

beforeEach(async () => {
  window.__ = (text) => text
  open.value = false
  router = createRouter({
    history: createWebHistory('/crm'),
    routes: [
      { path: '/a', component: { render: () => null } },
      { path: '/b', component: { render: () => null } },
    ],
  })
  router.push('/a')
  await router.isReady()
  guards = 0
  router.beforeEach(() => {
    guards += 1
  })
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      open.value
        ? h(CommandPalette, {
            modelValue: open.value,
            'onUpdate:modelValue': (value) => (open.value = value),
          })
        : null,
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
  _resetSheetHistory()
  await wait()
})

describe('command palette and back', () => {
  it('back closes the palette and stays on the page', async () => {
    open.value = true
    await wait()
    expect(palette()).not.toBeNull()
    expect(window.history.state?.uiSheet).toMatch(/^palette-/)
    await backAndWait()
    expect(open.value).toBe(false)
    expect(palette()).toBeNull()
    expect(router.currentRoute.value.path).toBe('/a')
    expect(window.location.pathname).toBe('/crm/a')
    expect(guards).toBe(0)
    expect(window.history.state?.uiSheet).toBeUndefined()
    expect(_openSheets()).toEqual([])
  })

  it('closing it with ✕ walks back over its entry', async () => {
    open.value = true
    await wait()
    palette().querySelector('[aria-label="Close"]').click()
    await wait(60)
    expect(open.value).toBe(false)
    expect(window.history.state?.uiSheet).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/a')
    expect(guards).toBe(0)
  })

  it('closing it from the shell (v-if off) leaves no entry behind', async () => {
    open.value = true
    await wait()
    open.value = false
    await wait(60)
    expect(window.history.state?.uiSheet).toBeUndefined()
    expect(_openSheets()).toEqual([])
  })

  it('a page opened from it has the page under it, one back away', async () => {
    open.value = true
    await wait()
    // A result with an href: close, then the route (CommandPalette.choose).
    open.value = false
    await nextTick()
    router.push('/b')
    await wait(80)
    expect(router.currentRoute.value.path).toBe('/b')
    await backAndWait()
    expect(router.currentRoute.value.path).toBe('/a')
    expect(window.history.state?.uiSheet).toBeUndefined()
  })
})
