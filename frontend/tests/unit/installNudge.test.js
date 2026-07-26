// Install nudge (spec 1.7): visit counting (one per calendar day), the ≥3-visit
// bar, permanent dismissal, and the standalone-app skip. Module has window
// listeners → fresh import per scenario.
import { describe, it, expect, vi, beforeEach } from 'vitest'

async function fresh({ standalone = false } = {}) {
  vi.resetModules()
  localStorage.clear()
  window.matchMedia = vi.fn(() => ({ matches: standalone }))
  return await import('@/composables/installNudge')
}

function fireInstallable() {
  const e = new Event('beforeinstallprompt')
  e.preventDefault = vi.fn()
  e.prompt = vi.fn()
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(e)
  return e
}

describe('installNudge', () => {
  beforeEach(() => localStorage.clear())

  it('counts one visit per calendar day, not per reload', async () => {
    let m = await fresh()
    m.initInstallNudge()
    m = await fresh() // same day reload — must not increment
    // preserve the same-day stamp across the fresh() localStorage.clear()
    localStorage.setItem('doco-install-last-visit', new Date().toDateString())
    localStorage.setItem('doco-install-visits', '1')
    m.initInstallNudge()
    expect(localStorage.getItem('doco-install-visits')).toBe('1')
  })

  it('stays hidden below the visit bar even when installable', async () => {
    const m = await fresh()
    localStorage.setItem('doco-install-visits', '1')
    localStorage.setItem('doco-install-last-visit', new Date().toDateString())
    m.initInstallNudge()
    fireInstallable()
    expect(m.installNudgeVisible.value).toBe(false)
  })

  it('shows once installable and past the visit bar', async () => {
    const m = await fresh()
    localStorage.setItem('doco-install-visits', '5')
    localStorage.setItem('doco-install-last-visit', new Date().toDateString())
    m.initInstallNudge()
    const e = fireInstallable()
    expect(e.preventDefault).toHaveBeenCalled() // suppresses Chrome's mini-infobar
    expect(m.installNudgeVisible.value).toBe(true)
  })

  it('accept prompts the deferred event and hides the banner', async () => {
    const m = await fresh()
    localStorage.setItem('doco-install-visits', '5')
    localStorage.setItem('doco-install-last-visit', new Date().toDateString())
    m.initInstallNudge()
    const e = fireInstallable()
    await m.acceptInstall()
    expect(e.prompt).toHaveBeenCalled()
    expect(m.installNudgeVisible.value).toBe(false)
  })

  it('dismissal is permanent — later inits never re-arm', async () => {
    let m = await fresh()
    localStorage.setItem('doco-install-visits', '5')
    localStorage.setItem('doco-install-last-visit', new Date().toDateString())
    m.initInstallNudge()
    fireInstallable()
    m.dismissInstallNudge()
    expect(localStorage.getItem('doco-install-dismissed')).toBe('1')
    // fresh module, same storage (minus the clear) → simulate by re-setting flag
    const dismissed = localStorage.getItem('doco-install-dismissed')
    m = await fresh()
    localStorage.setItem('doco-install-dismissed', dismissed)
    localStorage.setItem('doco-install-visits', '9')
    m.initInstallNudge()
    fireInstallable()
    expect(m.installNudgeVisible.value).toBe(false)
  })

  it('never arms inside an installed (standalone) app', async () => {
    const m = await fresh({ standalone: true })
    localStorage.setItem('doco-install-visits', '9')
    m.initInstallNudge()
    fireInstallable()
    expect(m.installNudgeVisible.value).toBe(false)
  })
})
