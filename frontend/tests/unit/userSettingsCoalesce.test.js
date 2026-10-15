import { beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.fn()
vi.mock('frappe-ui', () => ({ call: (...args) => call(...args) }))

const { getUserSettings, useUserSettings } = await import('@/data/userSettings')

// SPEC §4: no API called twice for one render. The event popup and the
// notifications panel both read the Event settings at mount.
describe('user settings reads', () => {
  beforeEach(() => {
    call.mockReset()
    useUserSettings().clearCache()
  })

  it('two readers at once share one request', async () => {
    let resolve
    call.mockReturnValue(new Promise((r) => (resolve = r)))
    const first = getUserSettings('Event', 'notifications')
    const second = getUserSettings('Event', 'notifications')
    resolve(JSON.stringify({ notifications: { completedEvents: ['E-1'] } }))
    expect(await first).toEqual({ completedEvents: ['E-1'] })
    expect(await second).toEqual({ completedEvents: ['E-1'] })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('a later read after a failure asks again', async () => {
    call.mockRejectedValueOnce(new Error('502'))
    await expect(useUserSettings().get('Event')).rejects.toThrow('502')
    call.mockResolvedValueOnce('{}')
    await expect(useUserSettings().get('Event')).resolves.toEqual({})
    expect(call).toHaveBeenCalledTimes(2)
  })
})
