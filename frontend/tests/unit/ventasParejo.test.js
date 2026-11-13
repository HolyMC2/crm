// Lane ventas-parejo: Tratos, Prospectos and the deal record read alike.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitColumns } from '@/utils/fitColumns'

describe('Tratos fits its columns to the list (no sideways scroll)', () => {
  const widths = {
    customer: '150px',
    stage: '130px',
    value: '110px',
    owner: 44,
  }
  const dropOrder = ['owner', 'customer', 'stage', 'value']
  const chosen = ['customer', 'stage', 'owner', 'value']

  it('shows every chosen column before the list is measured, or when it fits', () => {
    expect([...fitColumns(chosen, { widths, dropOrder, room: 0 })]).toEqual(
      chosen,
    )
    expect(
      fitColumns(chosen, { widths, dropOrder, room: 2000, fixed: 300, gap: 16 })
        .size,
    ).toBe(4)
  })

  it('steps columns aside in the drop order until the row fits', () => {
    // 300 fixed + stage 146 + value 126 = 572: owner and customer step aside
    const shown = fitColumns(chosen, {
      widths,
      dropOrder,
      room: 600,
      fixed: 300,
      gap: 16,
    })
    expect([...shown].sort()).toEqual(['stage', 'value'])
  })

  it('never keeps a column the worker did not choose', () => {
    const shown = fitColumns(['value'], { widths, dropOrder, room: 2000 })
    expect([...shown]).toEqual(['value'])
  })
})

describe('«Llamar» without a phone integration', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  async function store({ enabled }) {
    const toast = { info: vi.fn() }
    vi.doMock('frappe-ui', () => ({ toast }))
    vi.doMock('@/composables/telephony', async () => {
      const { ref } = await import('vue')
      return {
        callEnabled: ref(enabled),
        integrationsKnown: Promise.resolve(),
      }
    })
    vi.doMock('vue', async (orig) => ({
      ...(await orig()),
      getCurrentInstance: () => ({
        appContext: { config: { globalProperties: {} } },
      }),
    }))
    vi.stubGlobal('__', (text) => text)
    const location = { href: '' }
    vi.stubGlobal('location', location)
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { globalStore } = await import('@/stores/global')
    return { store: globalStore(), location, toast }
  }

  it('dials through the device instead of doing nothing', async () => {
    const { store: s, location } = await store({ enabled: false })
    await s.makeCall('+52 669 442 1311')
    expect(location.href).toBe('tel:+526694421311')
  })

  it('places the call on the shop line once the integration is ready', async () => {
    const { store: s, location } = await store({ enabled: true })
    const placed = []
    s.setMakeCall((number) => placed.push(number))
    await s.makeCall('6694421311')
    expect(placed).toEqual(['6694421311'])
    expect(location.href).toBe('')
  })

  it('never dials around a shop line that is still getting ready', async () => {
    const { store: s, location, toast } = await store({ enabled: true })
    await s.makeCall('6694421311')
    expect(location.href).toBe('')
    expect(toast.info).toHaveBeenCalled()
  })
})
