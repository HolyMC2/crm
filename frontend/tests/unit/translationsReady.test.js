import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_WAIT_MS,
  mountWhenTranslated,
  translationsReady,
} from '@/utils/translationsReady'

const SRC = '/api/method/crm.www.crm.translations?v=abc'

function addScript() {
  const script = document.createElement('script')
  script.setAttribute('src', SRC)
  document.body.appendChild(script)
  return script
}

beforeEach(() => {
  vi.useFakeTimers()
  delete window.translated_messages
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.useRealTimers()
  delete window.translated_messages
})

describe('the mount waits for the dictionary script', () => {
  it('nothing to wait for without the script on the page', () => {
    expect(translationsReady()).toBeNull()
  })

  it('nothing to wait for once the script has run', () => {
    addScript()
    window.translated_messages = { Hoy: 'Today' }
    expect(translationsReady()).toBeNull()
  })

  it('settles when the script runs', async () => {
    const script = addScript()
    const settled = vi.fn()
    const wait = translationsReady()
    wait.then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    script.dispatchEvent(new Event('load'))
    await wait
    expect(settled).toHaveBeenCalledOnce()
  })

  it('settles when the script fails: the shell shows, in the source language', async () => {
    const script = addScript()
    const wait = translationsReady()
    script.dispatchEvent(new Event('error'))
    await expect(wait).resolves.toBeUndefined()
  })

  it('never waits past the cap', async () => {
    addScript()
    const settled = vi.fn()
    translationsReady().then(settled)
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('mounts at once when there is nothing to wait for, after the script otherwise', async () => {
    const mount = vi.fn(() => 'app')
    expect(mountWhenTranslated(mount)).toBe('app')
    expect(mount).toHaveBeenCalledOnce()

    const script = addScript()
    const later = vi.fn()
    const result = mountWhenTranslated(later)
    expect(later).not.toHaveBeenCalled()
    script.dispatchEvent(new Event('load'))
    await result
    expect(later).toHaveBeenCalledOnce()
  })
})
