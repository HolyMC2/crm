import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ resources: {} }))
vi.mock('frappe-ui', () => ({
  createResource: (options) => {
    const resource = { options, fetch: vi.fn() }
    h.resources[options.url] = resource
    return resource
  },
}))

async function load() {
  vi.resetModules()
  h.resources = {}
  return import('@/composables/whatsapp')
}

describe('site WhatsApp channel mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the one channel from frappe_whatsapp with a GET', async () => {
    await load()
    const channel = h.resources['frappe_whatsapp.channel.get_channel']
    expect(channel.options).toMatchObject({ method: 'GET', auto: true })
  })

  it('manual mode exposes only the manual action and the shop number', async () => {
    const wa = await load()
    h.resources['frappe_whatsapp.channel.get_channel'].options.onSuccess({
      mode: 'manual',
      shop_number: '+52 55 0000 0000',
      sender_hint: 'Envía desde el WhatsApp del negocio (+52 55 0000 0000).',
    })
    expect(wa.whatsappManual.value).toBe(true)
    expect(wa.whatsappEnabled.value).toBe(false)
    expect(wa.whatsappTabEnabled.value).toBe(true)
    expect(wa.whatsappShopNumber.value).toBe('+52 55 0000 0000')
  })

  it('api and off never enable the manual action', async () => {
    const wa = await load()
    const onSuccess =
      h.resources['frappe_whatsapp.channel.get_channel'].options.onSuccess
    onSuccess({ mode: 'api' })
    expect([wa.whatsappEnabled.value, wa.whatsappManual.value]).toEqual([
      true,
      false,
    ])
    onSuccess({ mode: 'off' })
    expect([
      wa.whatsappEnabled.value,
      wa.whatsappManual.value,
      wa.whatsappTabEnabled.value,
    ]).toEqual([false, false, false])
  })

  it('without the channel module the API-only behaviour is kept', async () => {
    const wa = await load()
    h.resources['frappe_whatsapp.channel.get_channel'].options.onError()
    const legacy = h.resources['crm.api.whatsapp.is_whatsapp_enabled']
    expect(legacy.fetch).toHaveBeenCalled()
    legacy.options.onSuccess(true)
    expect(wa.whatsappEnabled.value).toBe(true)
    expect(wa.whatsappManual.value).toBe(false)
    legacy.options.onSuccess(false)
    expect(wa.whatsappTabEnabled.value).toBe(false)
  })
})
