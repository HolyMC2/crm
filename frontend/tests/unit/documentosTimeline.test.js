// Contacto's Actividad (E3) reads the one timeline API, once per record version.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.fn()
vi.mock('frappe-ui', () => ({ call: (...args) => call(...args) }))

const { loadTimeline } = await import('@/components/documentos/timeline')

describe('loadTimeline', () => {
  beforeEach(() => call.mockReset())

  it('asks the timeline API for the record and shares the answer per version', async () => {
    call.mockResolvedValue({ events: [{ kind: 'create', who: 'Ana' }] })
    const first = await loadTimeline(
      'Contact',
      'Ana Pérez',
      '2026-10-24 10:00:00',
    )
    const again = await loadTimeline(
      'Contact',
      'Ana Pérez',
      '2026-10-24 10:00:00',
    )
    expect(first.events[0].who).toBe('Ana')
    expect(again).toBe(first)
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('crm.api.documentos.timeline', {
      doctype: 'Contact',
      name: 'Ana Pérez',
    })
  })

  it('asks again after a save (new modified) and after a failure', async () => {
    call.mockRejectedValueOnce(new Error('403'))
    await expect(
      loadTimeline('Contact', 'Beto', '2026-10-24 10:00:00'),
    ).rejects.toThrow('403')
    call.mockResolvedValue({ events: [] })
    await loadTimeline('Contact', 'Beto', '2026-10-24 10:00:00')
    await loadTimeline('Contact', 'Beto', '2026-10-24 10:05:00')
    expect(call).toHaveBeenCalledTimes(3)
  })
})
