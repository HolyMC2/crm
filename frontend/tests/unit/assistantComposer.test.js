import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
globalThis.__ = (text) => text

import AssistantComposer from '@/components/assistant/AssistantComposer.vue'
import {
  _resetAssistant,
  assistant,
  attachFiles,
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
    // the phone's gallery lets the owner pick several photos at once
    expect(picker.multiple).toBe(true)

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

    attachFiles([new File(['x'], 'print.jpg', { type: 'image/jpeg' })])
    await nextTick()

    expect(send.disabled).toBe(false)
    expect(
      mounted.el.querySelector('[data-testid="assistant-attachment"]'),
    ).not.toBeNull()
  })

  it('shows each picked file and takes one off with its ×', async () => {
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    attachFiles([
      new File(['x'], 'pedido.jpg', { type: 'image/jpeg' }),
      new File(['y'], 'envio.jpg', { type: 'image/jpeg' }),
      new File(['z'], 'pago.pdf', { type: 'application/pdf' }),
    ])
    await nextTick()

    const chips = () =>
      Array.from(
        mounted.el.querySelectorAll('[data-testid="assistant-attachment"]'),
      ).map((chip) => chip.getAttribute('title'))
    expect(chips()).toEqual(['pedido.jpg', 'envio.jpg', 'pago.pdf'])

    mounted.el
      .querySelectorAll('[data-testid="assistant-attachment-remove"]')[1]
      .click()
    await nextTick()
    expect(chips()).toEqual(['pedido.jpg', 'pago.pdf'])
  })

  it('with five files waiting, «+» says a message is full instead of opening the picker', async () => {
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    attachFiles(
      Array.from({ length: 5 }, (_, i) => new File(['x'], `f${i}.jpg`)),
    )
    await nextTick()
    const picker = mounted.el.querySelector('[data-testid="assistant-file"]')
    const pick = vi.spyOn(picker, 'click').mockImplementation(() => {})

    mounted.el.querySelector('[data-testid="assistant-attach"]').click()

    expect(pick).not.toHaveBeenCalled()
    expect(assistant.error).toMatch(/A message takes up to/)
  })

  it('sends the picked files with the note in one message and clears the composer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_, init) => {
        const name = init.body.get('file').name
        return {
          ok: true,
          json: async () => ({
            message: { name: `F-${name}`, file_url: `/private/files/${name}` },
          }),
        }
      }),
    )
    assistant.status = { enabled: true, can_attach: true }
    mounted = mount()
    attachFiles([
      new File(['<cfdi/>'], 'factura.xml', { type: 'text/xml' }),
      new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }),
    ])
    assistant.draft = 'Regístrala como gasto'
    await nextTick()

    mounted.el.querySelector('[data-testid="assistant-send"]').click()
    await flush()
    await flush()

    expect(fetch).toHaveBeenCalledTimes(2)
    const says = mocks.call.mock.calls.filter(([method]) => method === SAY)
    expect(says).toHaveLength(1)
    expect(says[0][1].text).toBe('Regístrala como gasto')
    expect(JSON.parse(says[0][1].attachments).map((f) => f.file_id)).toEqual([
      'F-factura.xml',
      'F-ticket.jpg',
    ])
    expect(assistant.draft).toBe('')
    expect(assistant.attachments).toEqual([])
  })
})
