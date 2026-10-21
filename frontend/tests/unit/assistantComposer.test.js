import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
globalThis.__ = (text) => text

import AssistantComposer from '@/components/assistant/AssistantComposer.vue'
import {
  _resetAssistant,
  assistant,
  attachFile,
} from '@/components/assistant/useAssistant'

const SAY = 'doco.docoutils.assistant.shell_api.say'

function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(AssistantComposer) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  return { el, app }
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the composer', () => {
  let mounted

  beforeEach(() => {
    _resetAssistant()
    mocks.call.mockReset()
    mocks.call.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    mounted?.app.unmount()
    mounted?.el.remove()
    mounted = null
    vi.unstubAllGlobals()
  })

  it('takes the photo, PDF and XML types the Desk takes, for the owner', () => {
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    const picker = mounted.el.querySelector('[data-testid="assistant-file"]')
    expect(picker.getAttribute('accept')).toContain('image/*')
    expect(picker.getAttribute('accept')).toContain('.xml')

    const pick = vi.spyOn(picker, 'click').mockImplementation(() => {})
    mounted.el.querySelector('[data-testid="assistant-attach"]').click()

    expect(pick).toHaveBeenCalledTimes(1)
    expect(assistant.error).toBe('')
  })

  it('tells someone who may not attach why the clip does nothing, and what to do', () => {
    assistant.status = { enabled: true, can_attach: false }
    mounted = mount()
    const picker = mounted.el.querySelector('[data-testid="assistant-file"]')
    const pick = vi.spyOn(picker, 'click').mockImplementation(() => {})

    mounted.el.querySelector('[data-testid="assistant-attach"]').click()

    expect(pick).not.toHaveBeenCalled()
    expect(assistant.error).toMatch(/Only the owner can send files/)
    expect(assistant.error).toMatch(/Type what the file says/)
  })

  it('keeps send off until there is a note or a file', async () => {
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    const send = mounted.el.querySelector('[data-testid="assistant-send"]')
    expect(send.disabled).toBe(true)

    attachFile(new File(['x'], 'print.jpg', { type: 'image/jpeg' }))
    await nextTick()

    expect(send.disabled).toBe(false)
    expect(
      mounted.el.querySelector('[data-testid="assistant-attachment"]'),
    ).not.toBeNull()
  })

  it('sends the picked file with its note and clears the composer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: { file_url: '/private/files/factura.xml' },
        }),
      })),
    )
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    attachFile(new File(['<cfdi/>'], 'factura.xml', { type: 'text/xml' }))
    assistant.draft = 'Regístrala como gasto'
    await nextTick()

    mounted.el.querySelector('[data-testid="assistant-send"]').click()
    await flush()
    await flush()

    expect(fetch).toHaveBeenCalledWith(
      '/api/method/upload_file',
      expect.anything(),
    )
    expect(mocks.call).toHaveBeenCalledWith(
      SAY,
      expect.objectContaining({
        text: 'Regístrala como gasto',
        file_url: '/private/files/factura.xml',
      }),
    )
    expect(assistant.draft).toBe('')
    expect(assistant.attachment).toBeNull()
  })
})
