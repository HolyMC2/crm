import { describe, expect, it, vi } from 'vitest'
import {
  installNetworkRecovery,
  isNetworkFailure,
  retryViews,
} from '@/utils/networkRecovery'

describe('network recovery', () => {
  it('recognizes dropped connections, not server answers or aborts', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(
      isNetworkFailure(
        new TypeError('NetworkError when attempting to fetch resource.'),
      ),
    ).toBe(true)
    expect(
      isNetworkFailure(
        new TypeError('Failed to fetch dynamically imported module: /x.js'),
      ),
    ).toBe(true)
    expect(
      isNetworkFailure({ name: 'AbortError', message: 'Failed to fetch' }),
    ).toBe(false)
    expect(
      isNetworkFailure({ status: 500, messages: ['Failed to fetch upstream'] }),
    ).toBe(false)
    expect(
      isNetworkFailure(new Error('Cannot read properties of undefined')),
    ).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })

  it('turns an unhandled network rejection into one retry notice', () => {
    const notify = vi.fn()
    expect(installNetworkRecovery({ notify })).toBe(true)
    expect(installNetworkRecovery({ notify })).toBe(false) // once per page
    const fire = (reason) => {
      const event = new Event('unhandledrejection', { cancelable: true })
      event.reason = reason
      window.dispatchEvent(event)
      return event
    }
    const first = fire(new TypeError('Failed to fetch'))
    expect(first.defaultPrevented).toBe(true)
    fire(new TypeError('Failed to fetch')) // same outage: no second notice
    expect(notify).toHaveBeenCalledTimes(1)
    expect(fire(new Error('real bug')).defaultPrevented).toBe(false)
    // «Retry» re-runs reload-on-return views (they listen to focus)
    const onFocus = vi.fn()
    window.addEventListener('focus', onFocus)
    notify.mock.calls[0][0]()
    window.dispatchEvent(new Event('online'))
    expect(onFocus).toHaveBeenCalledTimes(2)
    window.removeEventListener('focus', onFocus)
    expect(typeof retryViews).toBe('function')
  })
})
