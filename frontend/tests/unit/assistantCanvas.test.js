import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import AssistantCanvasFile from '@/components/assistant/AssistantCanvasFile.vue'
import {
  _resetCanvas,
  canvas,
  canvasByAnswer,
  onCanvasEvent,
  previewUrl,
} from '@/components/assistant/assistantCanvas'
import {
  _resetAssistant,
  assistant,
  onMessage,
  retireConversation,
} from '@/components/assistant/useAssistant'

beforeEach(() => {
  _resetAssistant()
  _resetCanvas()
  mocks.call.mockReset()
  mocks.call.mockResolvedValue({ ok: true, files: [] })
  assistant.status = { enabled: true, chat_id: 'desk:a@x.com' }
})

const chat = 'desk:a@x.com'

describe('a chart the turn writes', () => {
  it('goes under the answer that ends the turn, even when it edits the progress line', () => {
    onMessage({ chat_id: chat, mid: 'b1', text: 'Armando la gráfica…' })
    // doco canvas.publish: the file's kind rides as `kind`
    onCanvasEvent({ kind: 'html', file: 'ventas.html', version: 2 })
    onCanvasEvent({ kind: 'xlsx', file: 'ventas.xlsx', version: 1 })
    onMessage({
      chat_id: chat,
      mid: 'b1',
      edit: true,
      text: 'Aquí está la gráfica de ventas.',
    })
    expect(assistant.messages).toHaveLength(1)
    expect(assistant.messages[0].canvas).toEqual([
      { file: 'ventas.html', version: 2, kind: 'html' },
    ])
    expect(canvas.pending).toEqual([])
  })

  it('a reset drops what the old turn was still writing', () => {
    onCanvasEvent({ kind: 'html', file: 'viejo.html', version: 1 })
    retireConversation()
    onMessage({ chat_id: chat, mid: 'b2', text: 'Hola.' })
    expect(assistant.messages[0].canvas).toBeUndefined()
  })

  it('after a reload goes under the first answer logged after it, in this conversation only', () => {
    const messages = [
      { id: 'u1', role: 'user', at: '2026-10-29 10:00:00' },
      { id: 'b1', role: 'bot', at: '2026-10-29 10:00:20' },
      { id: 'u2', role: 'user', at: '2026-10-29 10:05:00' },
      { id: 'b2', role: 'bot', at: '2026-10-29 10:05:30' },
    ]
    const files = [
      { file: 'ventas.html', kind: 'html', modified: '2026-10-29 10:05:10' },
      { file: 'viejo.html', kind: 'html', modified: '2026-10-28 09:00:00' },
      { file: 'tabla.csv', kind: 'csv', modified: '2026-10-29 10:05:11' },
    ]
    expect(canvasByAnswer(messages, files)).toEqual({ b2: [files[0]] })
  })
})

describe('the inline viewer', () => {
  it('loads model HTML only in an iframe with an empty sandbox, from canvas.preview', () => {
    const el = document.createElement('div')
    const file = { file: 'ventas semana.html', version: 3, kind: 'html' }
    const app = createApp({ render: () => h(AssistantCanvasFile, { file }) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    const frame = el.querySelector('iframe')
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('src')).toBe(previewUrl(file))
    expect(previewUrl(file)).toBe(
      '/api/method/doco.docoutils.assistant.canvas.preview?file=ventas+semana.html&version=3',
    )
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('Open in Lienzo')
    app.unmount()
  })
})
