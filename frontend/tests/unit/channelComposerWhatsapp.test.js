import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
// Plain holder, set before each mount: the component reads it at setup.
const h = vi.hoisted(() => ({ manual: { value: false } }))
vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  Dialog: { template: '<div><slot name="body-content" /></div>' },
  Button: {
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')">{{ label }}</button>',
  },
}))
vi.mock('@/composables/whatsapp', () => ({ whatsappManual: h.manual }))
import { call } from 'frappe-ui'
import ChannelComposer from '@/components/doco/channel/ChannelComposer.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
  h.manual.value = false
})

async function open(config) {
  call.mockImplementation(async (method) => {
    if (method === 'doco_marketing.api.channel.get_channel_config')
      return config
    return []
  })
  const show = ref(false)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({
    components: { ChannelComposer },
    setup: () => ({ show }),
    template:
      '<ChannelComposer v-model="show" doctype="CRM Deal" docname="DEAL-1" phone="5512345678" />',
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  show.value = true
  await vi.waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'doco_marketing.api.channel.get_channel_config',
    ),
  )
  await nextTick()
  await nextTick()
  return el
}

const labels = (el) =>
  [...el.querySelectorAll('button.press')].map((b) => b.textContent.trim())

describe('channel composer WhatsApp rail', () => {
  it('offers the WhatsApp deeplink when marketing says the site is manual', async () => {
    const el = await open({ tier: 0, whatsapp_deeplink: true })
    expect(labels(el)).toEqual(['💬 WhatsApp', '✉ SMS', '📞 Llamar'])
  })

  it('drops only WhatsApp when marketing says the site is on the API, even if the SPA thought manual', async () => {
    h.manual.value = true
    const el = await open({ tier: 2, whatsapp_deeplink: false })
    expect(labels(el)).toEqual(['✉ SMS', '📞 Llamar'])
  })

  it('an older marketing config without the key follows the site channel mode', async () => {
    h.manual.value = false
    expect(labels(await open({ tier: 2 }))).toEqual(['✉ SMS', '📞 Llamar'])
    cleanups.splice(0).forEach((fn) => fn())
    h.manual.value = true
    expect(labels(await open({ tier: 0 }))).toEqual([
      '💬 WhatsApp',
      '✉ SMS',
      '📞 Llamar',
    ])
  })
})
