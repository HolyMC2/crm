import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import AssistantCanvas from '@/components/assistant/AssistantCanvas.vue'
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
  onCanvasWritten,
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

  it('arriving after the answer (it is published on commit) goes under that answer', () => {
    onMessage({ chat_id: chat, mid: 'b1', text: 'Lista: quedó en tu Lienzo.' })
    onCanvasWritten({ kind: 'html', file: 'grafica.html', version: 1 })
    expect(assistant.messages[0].canvas).toEqual([
      { file: 'grafica.html', version: 1, kind: 'html' },
    ])
    expect(canvas.pending).toEqual([])
  })

  it('while the turn still runs waits for its answer; on an empty log it only reaches the Lienzo', () => {
    onMessage({ chat_id: chat, mid: 'b1', text: 'Armando la gráfica…' })
    onCanvasWritten({ kind: 'html', file: 'grafica.html', version: 1 })
    expect(assistant.messages[0].canvas).toBeUndefined()
    expect(canvas.pending).toHaveLength(1)
    retireConversation()
    onCanvasWritten({ kind: 'png', file: 'foto.png', version: 1 })
    expect(canvas.pending).toEqual([])
  })

  it('a reset drops what the old turn was still writing', () => {
    onCanvasEvent({ kind: 'html', file: 'viejo.html', version: 1 })
    retireConversation()
    onMessage({ chat_id: chat, mid: 'b2', text: 'Hola.' })
    expect(assistant.messages[0].canvas).toBeUndefined()
  })

  it('after a reload goes under the answer of its turn, in this conversation only', () => {
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

  it('after a reload finds its answer even when the answer row keeps its progress line time', () => {
    // history collapses an edit trail at its first position: the answer reads
    // 21:16:37 (the progress line), the file was written at 21:16:46
    const messages = [
      { id: 'u1', role: 'user', at: '2026-10-29 21:16:35.495857' },
      { id: 'b1', role: 'bot', at: '2026-10-29 21:16:37.804698' },
    ]
    const files = [
      {
        file: 'prueba-lienzo.html',
        kind: 'html',
        modified: '2026-10-29 21:16:46.672134',
      },
    ]
    expect(canvasByAnswer(messages, files)).toEqual({ b1: files })
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

describe('the Lienzo view (Marco 2026-11-05: «/lienzo is just broken»)', () => {
  const FACADE = 'doco.docoutils.assistant.canvas.facade'
  const facade = (command) =>
    mocks.call.mock.calls.filter(
      ([m, args]) => m === FACADE && args.command === command,
    )

  async function flush() {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  function mount(component, props = {}) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render: () => h(component, props) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    return { el, app }
  }

  it('draws a table from its first rows instead of a frame that downloads it', async () => {
    mocks.call.mockResolvedValue({
      ok: true,
      grid: {
        columns: ['Producto', 'Piezas', 'Saldo'],
        rows: [
          ['Batería LTH', 12, '1,200.50'],
          ['Filtro', 3, ''],
        ],
        total_rows: 450,
        truncated: true,
      },
    })
    const file = { file: 'ventas.csv', version: 2, kind: 'csv' }
    const { el, app } = mount(AssistantCanvasFile, { file, full: true })
    await flush()
    expect(el.querySelector('iframe')).toBeNull()
    expect(JSON.parse(facade('grid')[0][1].payload)).toEqual({
      file: 'ventas.csv',
      version: 2,
      limit: 200,
    })
    const table = el.querySelector('[data-testid="canvas-table"]')
    expect(
      [...table.querySelectorAll('th')].map((th) => th.textContent.trim()),
    ).toEqual(['Producto', 'Piezas', 'Saldo'])
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    // a csv brings «1,200.50» as text: its column still lines up as figures
    const figure = (th) => th.classList.contains('text-right')
    expect([...table.querySelectorAll('th')].map(figure)).toEqual([
      false,
      true,
      true,
    ])
    expect(table.textContent).toContain('Showing 2 of 450 rows')
    expect(el.textContent).toContain('Table · version 2')
    app.unmount()
  })

  it('reads notes as text with their headings, not raw «#» and «**»', async () => {
    mocks.call.mockResolvedValue({
      ok: true,
      text: '# Pedido de baterías\n\n**Proveedor:** LTH',
    })
    const file = { file: 'pedido.md', version: 1, kind: 'md' }
    const { el, app } = mount(AssistantCanvasFile, { file, full: true })
    await flush()
    expect(facade('get')).toHaveLength(1)
    const notes = el.querySelector('[data-testid="canvas-notes"]')
    expect(notes.textContent).toContain('Pedido de baterías')
    expect(notes.textContent).not.toContain('#')
    expect(notes.textContent).not.toContain('**')
    app.unmount()
  })

  it('indents data and says so when a file cannot be read', async () => {
    mocks.call.mockResolvedValueOnce({
      ok: true,
      text: '{"total":3,"ok":true}',
    })
    const json = mount(AssistantCanvasFile, {
      file: { file: 'datos.json', version: 1, kind: 'json' },
      full: true,
    })
    await flush()
    expect(
      json.el.querySelector('[data-testid="canvas-text"]').textContent,
    ).toBe('{\n  "total": 3,\n  "ok": true\n}')
    json.app.unmount()

    mocks.call.mockResolvedValueOnce({ ok: false, message: 'No encontré «x».' })
    const broken = mount(AssistantCanvasFile, {
      file: { file: 'x.txt', version: 1, kind: 'txt' },
      full: true,
    })
    await flush()
    expect(broken.el.querySelector('[role="alert"]').textContent).toContain(
      'No encontré «x».',
    )
    broken.app.unmount()
  })

  it('a file read inline under an answer stays a preview: no read, no delete', async () => {
    const { el, app } = mount(AssistantCanvasFile, {
      file: { file: 'ventas.csv', version: 1, kind: 'csv' },
    })
    await flush()
    expect(mocks.call).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="canvas-delete"]')).toBeNull()
    expect(el.querySelector('[data-testid="canvas-open"]')).not.toBeNull()
    app.unmount()
  })

  it('deletes in two taps in place and leaves the list without it', async () => {
    canvas.files = [
      { file: 'pedido.md', version: 1, kind: 'md' },
      { file: 'viejo.html', version: 1, kind: 'html' },
    ]
    canvas.selected = 'pedido.md'
    const { el, app } = mount(AssistantCanvasFile, {
      file: canvas.files[0],
      full: true,
    })
    await flush()
    el.querySelector('[data-testid="canvas-delete"]').click()
    await flush()
    expect(facade('delete')).toHaveLength(0)
    const confirm = el.querySelector('[data-testid="canvas-delete-confirm"]')
    expect(document.activeElement).toBe(confirm)
    confirm.click()
    await flush()
    expect(JSON.parse(facade('delete')[0][1].payload)).toEqual({
      file: 'pedido.md',
    })
    expect(canvas.files.map((f) => f.file)).toEqual(['viejo.html'])
    expect(canvas.selected).toBeNull()
    app.unmount()
  })

  it('a file picked while another loads keeps the screen', async () => {
    let first
    mocks.call
      .mockImplementationOnce(() => new Promise((ok) => (first = ok)))
      .mockResolvedValueOnce({ ok: true, text: 'segundo' })
    const file = reactive({ file: 'uno.txt', version: 1, kind: 'txt' })
    const { el, app } = mount(
      { render: () => h(AssistantCanvasFile, { file, full: true }) },
      {},
    )
    await flush()
    Object.assign(file, { file: 'dos.txt' })
    await flush()
    first({ ok: true, text: 'primero' })
    await flush()
    expect(el.querySelector('[data-testid="canvas-text"]').textContent).toBe(
      'segundo',
    )
    app.unmount()
  })

  it('lists every file with what it is and opens the one picked above the list', async () => {
    mocks.call.mockImplementation((method, args) =>
      Promise.resolve(
        args?.command === 'list'
          ? {
              ok: true,
              files: [
                {
                  file: 'grafica.html',
                  version: 1,
                  kind: 'html',
                  note: 'Ventas',
                },
                { file: 'pedido.md', version: 1, kind: 'md' },
              ],
            }
          : { ok: true, text: '# Pedido' },
      ),
    )
    const { el, app } = mount(AssistantCanvas)
    await flush()
    expect(facade('list')).toHaveLength(1)
    const rows = [...el.querySelectorAll('[data-canvas]')]
    const lines = (row) =>
      [...row.querySelectorAll('span.block')].map((s) => s.textContent.trim())
    expect(rows.map(lines)).toEqual([
      ['grafica.html', expect.stringMatching(/^Page · Ventas/)],
      ['pedido.md', expect.stringMatching(/^Notes/)],
    ])
    rows[1].click()
    await flush()
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')
    expect(
      el.querySelector(
        '[data-canvas-file="pedido.md"] [data-testid="canvas-notes"]',
      ),
    ).not.toBeNull()
    app.unmount()
  })
})
