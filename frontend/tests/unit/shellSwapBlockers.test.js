import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import {
  createBundleWatcher,
  swapBlocker,
} from '@/vendor/muelle-shell/live-sync'
import { installSwapBlockers } from '@/utils/silentUpdate'
import {
  callInProgress,
  registerCallSwapBlocker,
} from '@/utils/callSwapBlocker'
import { useEditSwapBlocker } from '@/utils/editSwapBlocker'

// A silent update must never reload over a half-written comment or a live call.
let release = []
afterEach(() => {
  release.forEach((fn) => fn())
  release = []
  document.body.innerHTML = ''
})

function editor(text) {
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'true')
  el.className = 'ProseMirror'
  el.innerHTML = `<p>${text}</p>`
  document.body.append(el)
  return el
}

// Mounts a component that owns an inline edit, as CommentArea does.
function mountEdit(dirty) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    setup() {
      useEditSwapBlocker('comment-edit:C-1', () => dirty.value)
      return () => h('div')
    },
  })
  app.mount(host)
  return app
}

describe('unsaved inline edits block the swap', () => {
  it('a saved description in an always-editable editor does not block', () => {
    release.push(...installSwapBlockers())
    editor('Descripción guardada del trato')
    expect(swapBlocker(window, Infinity)).toBeNull()
  })

  it('a dirty comment edit blocks, focused or not, until saved or cancelled', async () => {
    release.push(...installSwapBlockers())
    const dirty = ref(false)
    const app = mountEdit(dirty)
    const el = editor('Cliente pidió otra cotización')
    expect(swapBlocker(window, Infinity)).toBeNull()
    dirty.value = true
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    expect(swapBlocker(window, Infinity)).toBe('comment-edit:C-1')
    el.focus()
    expect(swapBlocker(window, Infinity)).toBe('comment-edit:C-1')
    dirty.value = false
    // live-sync's own gate still treats a focused editor as typing.
    expect(swapBlocker(window, Infinity)).toBe('page-not-clean')
    button.focus()
    expect(swapBlocker(window, Infinity)).toBeNull()
    dirty.value = true
    app.unmount()
    await nextTick()
    expect(swapBlocker(window, Infinity)).toBeNull()
  })

  it('a hidden tab with a dirty comment edit is not reloaded', async () => {
    const dirty = ref(true)
    const app = mountEdit(dirty)
    const navigate = vi.fn()
    const watcher = createBundleWatcher({
      versionUrl: '/version.json',
      runningEntry: '/assets/index-old.js',
      app: 'crm-test',
      channel: false,
      fetchEntry: async () => 'index-new.js',
      navigate,
    })
    await watcher.check(true)
    expect(watcher.isStale()).toBe(true)
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(navigate).not.toHaveBeenCalled()
    dirty.value = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(navigate).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
    watcher.destroy()
    app.unmount()
  })
})

describe('telephony blocks the swap until the call ends', () => {
  const idle = {
    call: null,
    onCall: false,
    calling: false,
    popup: false,
    minimized: false,
  }
  it.each([
    ['ringing incoming', { call: {}, popup: true }],
    ['dialing out', { call: {}, calling: true, popup: true }],
    ['active', { call: {}, onCall: true, popup: true }],
    ['minimized', { call: {}, onCall: true, minimized: true }],
  ])('%s call is in progress', (_, state) => {
    expect(callInProgress({ ...idle, ...state })).toBe(true)
  })

  it('a completed call releases the swap', () => {
    expect(callInProgress(idle)).toBe(false)
    let state = { ...idle, call: {}, onCall: true, popup: true }
    release.push(registerCallSwapBlocker('twilio-call', () => state))
    expect(swapBlocker(window, Infinity)).toBe('twilio-call')
    state = { ...idle }
    expect(swapBlocker(window, Infinity)).toBeNull()
  })

  it('leaving Ventas mid-call keeps the blocker until the call ends', () => {
    let state = { ...idle, call: {}, onCall: true, popup: true }
    const releaseOnUnmount = registerCallSwapBlocker('twilio-call', () => state)
    releaseOnUnmount() // CallUI unmounts while the WebRTC call is still live
    expect(swapBlocker(window, Infinity)).toBe('twilio-call')
    state = { ...idle } // the call's disconnect handler resets the state
    expect(swapBlocker(window, Infinity)).toBeNull()
    // Re-entering Ventas registers the same name again, replacing the old one.
    release.push(registerCallSwapBlocker('twilio-call', () => idle))
    expect(swapBlocker(window, Infinity)).toBeNull()
  })

  it('a release with no call in progress removes the blocker', () => {
    let state = { ...idle }
    const releaseOnUnmount = registerCallSwapBlocker('exotel-call', () => state)
    releaseOnUnmount()
    state = { ...idle, popup: true } // stale state of an unmounted popup
    expect(swapBlocker(window, Infinity)).toBeNull()
  })
})
