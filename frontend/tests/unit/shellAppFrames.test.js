// The app strip's frames talk back (Shell-S12, Escáner hostedWorkspace.ts): a
// framed app asks the shell to open one of its pages (`muelle:open`) and hands
// it the shell's keys pressed inside the frame (`muelle:workspace-shortcut`).
// Only a frame of the strip, on this origin, is heard.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import AppFrames from '@/components/shell/AppFrames.vue'
import {
  currentApp,
  openApp,
  resetAppStripForTests,
} from '@/composables/appStrip'

let app
let host
beforeEach(async () => {
  push.mockClear()
  resetAppStripForTests()
  // No src: the test frame loads nothing, its window is enough.
  openApp({ key: 'scan', label: 'Escáner', icon: 'lucide-scan' }, undefined)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(AppFrames) })
  app.mount(host)
  await nextTick()
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  resetAppStripForTests()
})

function frameWindow() {
  return host.querySelector('[data-app-frame="scan"]').contentWindow
}

function post(
  data,
  { origin = window.location.origin, source = frameWindow() } = {},
) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
}

describe('a framed app opening a shell page', () => {
  it('shows the shell and opens the page, the app keeping its place', () => {
    expect(currentApp.value).toBe('scan')
    post({
      type: 'muelle:open',
      path: '/crm/productos/ITEM-1?done=Item%3AITEM-1',
    })
    expect(currentApp.value).toBe('')
    expect(push).toHaveBeenCalledWith('/productos/ITEM-1?done=Item%3AITEM-1')
    expect(host.querySelector('[data-app-frame="scan"]')).not.toBeNull()
  })

  it('opens the shell home for a bare /crm', () => {
    post({ type: 'muelle:open', path: '/crm' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('ignores a path outside the shell, another origin, or a window that is not a frame', () => {
    post({ type: 'muelle:open', path: '/app/item/ITEM-1' })
    post({ type: 'muelle:open', path: '//evil.example/crm' })
    post(
      { type: 'muelle:open', path: '/crm/hoy' },
      { origin: 'https://evil.example' },
    )
    post({ type: 'muelle:open', path: '/crm/hoy' }, { source: window })
    expect(push).not.toHaveBeenCalled()
    expect(currentApp.value).toBe('scan')
  })
})

describe('a shell key pressed inside a frame', () => {
  it('reaches the shell as a keydown on its window (Ctrl+K opens the palette)', () => {
    const seen = []
    const listen = (event) => seen.push(event)
    window.addEventListener('keydown', listen)
    post({
      type: 'muelle:workspace-shortcut',
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    })
    window.removeEventListener('keydown', listen)
    expect(seen).toHaveLength(1)
    expect(seen[0].key).toBe('k')
    expect(seen[0].ctrlKey).toBe(true)
    expect(seen[0].shiftKey).toBe(false)
  })

  it('drops a malformed key', () => {
    const listen = vi.fn()
    window.addEventListener('keydown', listen)
    post({
      type: 'muelle:workspace-shortcut',
      key: 'Escape-and-more',
      ctrlKey: true,
    })
    post({ type: 'muelle:workspace-shortcut', ctrlKey: true })
    window.removeEventListener('keydown', listen)
    expect(listen).not.toHaveBeenCalled()
  })
})
