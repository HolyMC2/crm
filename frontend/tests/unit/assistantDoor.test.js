import { beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('frappe-ui', () => ({ call }))

import {
  _resetAssistantDoor,
  assistantOn,
  bootAssistantStatus,
  loadAssistantStatus,
} from '@/components/assistant/assistantDoor'
import { readCachedList, writeCachedList } from '@/utils/listCache'

const router = { isReady: () => Promise.resolve() }
const flush = () => new Promise((done) => setTimeout(done))

beforeEach(() => {
  // currentScope() reads the page boot's scope and the user cookie.
  window.site_name = 'muelle.test'
  window.shell_scope = 'abc123'
  document.cookie = 'user_id=ana%40example.test'
  localStorage.clear()
  _resetAssistantDoor()
  call.mockReset()
  vi.useRealTimers()
})

describe('the assistant doors show from the last answer', () => {
  it('a first visit asks at once and keeps the answer', async () => {
    call.mockResolvedValue({ enabled: true, surface: 'sheet' })
    bootAssistantStatus(router)
    expect(call).toHaveBeenCalledTimes(1)
    await flush()
    expect(assistantOn.value).toBe(true)
    expect(readCachedList('assistant:status')).toEqual({
      enabled: true,
      surface: 'sheet',
    })
  })

  it('with an answer saved the doors show now and the check waits for the first screen', async () => {
    vi.useFakeTimers()
    writeCachedList('assistant:status', { enabled: true })
    call.mockResolvedValue({ enabled: false })
    bootAssistantStatus(router)
    expect(assistantOn.value).toBe(true)
    expect(call).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(call).toHaveBeenCalledTimes(1)
    expect(assistantOn.value).toBe(false)
    expect(readCachedList('assistant:status')).toEqual({ enabled: false })
  })

  it('a door before the check asks once; the check reuses its answer', async () => {
    vi.useFakeTimers()
    writeCachedList('assistant:status', { enabled: true })
    call.mockResolvedValue({ enabled: true })
    bootAssistantStatus(router)
    await loadAssistantStatus()
    await vi.runAllTimersAsync()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('offline keeps the last answer; a refusal hides the doors and drops it', async () => {
    writeCachedList('assistant:status', { enabled: true })
    call.mockRejectedValueOnce(new Error('offline'))
    await loadAssistantStatus()
    expect(assistantOn.value).toBe(true)

    call.mockRejectedValueOnce(
      Object.assign(new Error('no'), { exc_type: 'PermissionError' }),
    )
    await loadAssistantStatus({ refresh: true })
    expect(assistantOn.value).toBe(false)
    expect(readCachedList('assistant:status')).toBeNull()
  })
})
