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
  restoreVersion,
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

  describe('a file’s versions (2026-11-08)', () => {
    const PRECIOS = { file: 'precios.csv', version: 3, kind: 'csv' }
    const VERSIONS = [
      { ...PRECIOS, origin: 'person', note: '', modified: '' },
      {
        ...PRECIOS,
        version: 2,
        origin: 'assistant',
        note: 'Precios de octubre',
      },
      { ...PRECIOS, version: 1, origin: 'materialized', note: '' },
    ]
    // canvas.facade answers {ok, compare: <canvas.compare>}
    const COMPARE = {
      file: 'precios.csv',
      kind: 'csv',
      old: { ...PRECIOS, version: 1 },
      new: { ...PRECIOS, version: 2 },
      same: false,
      table: {
        key: 'Código',
        columns_added: [],
        columns_removed: [],
        added: [{ fila: 'A-004', texto: 'Cargador 20W' }],
        removed: [],
        changed: [
          { fila: 'A-002', columna: 'Precio', antes: '95.5', despues: '99' },
        ],
        counts: {
          filas_nuevas: 1,
          filas_quitadas: 0,
          celdas_cambiadas: 3,
          filas_cambiadas: 3,
        },
        same: false,
      },
    }
    const payloadOf = (command, n = 0) =>
      JSON.parse(facade(command)[n][1].payload)

    function answer(overrides = {}) {
      mocks.call.mockImplementation((method, args) => {
        const reply = {
          versions: { ok: true, versions: VERSIONS },
          grid: { ok: true, grid: { columns: ['Código'], rows: [['A-001']] } },
          compare: { ok: true, compare: COMPARE },
          ...overrides,
        }[args?.command]
        return Promise.resolve(
          typeof reply === 'function' ? reply(args) : reply || { ok: true },
        )
      })
    }

    async function openVersions() {
      canvas.files = [{ ...PRECIOS }]
      canvas.loaded = true
      canvas.selected = 'precios.csv'
      const mounted = mount(AssistantCanvas)
      await flush()
      mounted.el.querySelector('[data-testid="canvas-history"]').click()
      await vi.dynamicImportSettled()
      await flush()
      return mounted
    }
    const rows = (el) => [...el.querySelectorAll('[data-version]')]
    const caption = (el) =>
      el.querySelector('[data-canvas-file] figcaption').textContent

    it('are listed under the file, newest first, with who wrote each', async () => {
      answer()
      const { el, app } = await openVersions()
      expect(payloadOf('versions')).toEqual({ file: 'precios.csv' })
      const text = rows(el).map((row) => row.textContent.replace(/\s+/g, ' '))
      expect(text[0]).toContain('Version 3')
      expect(text[0]).toContain('current')
      expect(text[0]).toContain('Edited by you')
      expect(text[1]).toContain('Made by Muelle · Precios de octubre')
      expect(text[2]).toContain('Made by Muelle from your data')
      expect(text[1]).not.toContain('current')
      // the current version can say what it changed but not restore itself
      expect(el.querySelector('[data-testid="canvas-compare"]')).not.toBeNull()
      expect(el.querySelector('[data-testid="canvas-restore"]')).toBeNull()
      app.unmount()
    })

    it('a file with a single version has no history to open', async () => {
      answer()
      canvas.files = [{ ...PRECIOS, version: 1 }]
      canvas.loaded = true
      canvas.selected = 'precios.csv'
      const { el, app } = mount(AssistantCanvas)
      await flush()
      expect(el.querySelector('[data-testid="canvas-history"]')).toBeNull()
      app.unmount()
    })

    it('an earlier one opens in the viewer and says what it changed', async () => {
      answer()
      const { el, app } = await openVersions()
      rows(el)[1].click()
      await flush()
      expect(payloadOf('grid', 1)).toEqual({
        file: 'precios.csv',
        version: 2,
        limit: 200,
      })
      expect(caption(el)).toContain('version 2, an earlier one')
      expect(el.querySelector('a[download]').getAttribute('href')).toContain(
        'version=2',
      )
      el.querySelector('[data-testid="canvas-compare"]').click()
      await flush()
      expect(payloadOf('compare')).toEqual({ file: 'precios.csv', new: 2 })
      const changes = el.querySelector('[data-testid="canvas-changes"]')
      const said = changes.textContent.replace(/\s+/g, ' ')
      expect(said).toContain('Against version 1')
      expect(said).toContain('A-002, Precio: 95.5 → to 99')
      expect(said).toContain('A-004 Cargador 20W')
      // three cells changed, one listed
      expect(
        changes.querySelector('[data-changes="changed"]').textContent,
      ).toContain('And 2 more.')
      expect(said).toContain('Rows are matched by Código.')
      // the oldest version has nothing before it to compare with
      rows(el)[2].click()
      await flush()
      expect(el.querySelector('[data-testid="canvas-compare"]')).toBeNull()
      expect(el.querySelector('[data-testid="canvas-restore"]')).not.toBeNull()
      app.unmount()
    })

    it('restores an earlier one in one tap, and the replaced one stays', async () => {
      answer({
        restore: {
          ok: true,
          file: {
            ...PRECIOS,
            version: 4,
            origin: 'restored',
            note: 'Restaurado de la versión 2',
          },
        },
      })
      const { el, app } = await openVersions()
      rows(el)[1].click()
      await flush()
      el.querySelector('[data-testid="canvas-restore"]').click()
      await flush()
      expect(payloadOf('restore')).toEqual({ file: 'precios.csv', version: 2 })
      expect(canvas.files[0].version).toBe(4)
      expect(el.querySelector('[role="status"]').textContent).toContain(
        'Restored as version 4. Version 3 stays in the history.',
      )
      // the viewer is back on the current version, and the list reads again
      expect(caption(el)).toContain('version 4')
      expect(caption(el)).not.toContain('earlier')
      expect(facade('versions')).toHaveLength(2)
      app.unmount()
    })

    it('a chart restored here stays out of the chat’s answers', async () => {
      // the event is published on commit: before the answer or after it
      const chart = { file: 'ventas.html', kind: 'html' }
      canvas.files = [{ ...chart, version: 2 }]
      mocks.call.mockImplementation((method, args) => {
        if (args?.command !== 'restore') return Promise.resolve({ ok: true })
        onCanvasEvent({ ...chart, version: 3 })
        return Promise.resolve({ ok: true, file: { ...chart, version: 3 } })
      })
      onMessage({ chat_id: chat, mid: 'b1', text: 'Listo.' })
      const out = await restoreVersion(canvas.files[0], 1)
      expect(out.file.version).toBe(3)
      onCanvasWritten({ ...chart, version: 3 })
      expect(canvas.pending).toEqual([])
      expect(assistant.messages[0].canvas).toBeUndefined()
      // a turn writing the same file later still goes under its answer
      onCanvasWritten({ ...chart, version: 4 })
      expect(assistant.messages[0].canvas).toEqual([{ ...chart, version: 4 }])
    })

    it('says so when the version restored is already the current content', async () => {
      answer({ restore: { ok: true, file: { ...PRECIOS } } })
      const { el, app } = await openVersions()
      rows(el)[1].click()
      await flush()
      el.querySelector('[data-testid="canvas-restore"]').click()
      await flush()
      expect(canvas.files[0].version).toBe(3)
      expect(el.querySelector('[role="status"]').textContent).toContain(
        'The current version already has this content.',
      )
      app.unmount()
    })

    it('a text shows its lines with their sign, and a refusal is said', async () => {
      answer({
        compare: {
          ok: true,
          compare: {
            ...COMPARE,
            kind: 'md',
            table: undefined,
            text: {
              diff: [
                '@@ -1,2 +1,2 @@',
                ' # Resumen',
                '-ventas 100',
                '+ventas 120',
              ],
              added: 1,
              removed: 1,
              same: false,
              truncated: false,
            },
          },
        },
      })
      const { el, app } = await openVersions()
      el.querySelector('[data-testid="canvas-compare"]').click()
      await flush()
      const lines = [...el.querySelectorAll('[data-sign]')].map((line) => [
        line.dataset.sign,
        line.textContent,
      ])
      expect(lines).toEqual([
        ['@', '⋯'],
        [' ', ' # Resumen'],
        ['-', '-ventas 100'],
        ['+', '+ventas 120'],
      ])
      expect(el.textContent).toContain('Lines added: 1. Lines taken out: 1.')
      app.unmount()

      answer({ compare: { ok: false, message: 'Esa versión ya no está.' } })
      const again = await openVersions()
      again.el.querySelector('[data-testid="canvas-compare"]').click()
      await flush()
      expect(
        again.el.querySelector('[data-testid="canvas-versions"] [role="alert"]')
          .textContent,
      ).toContain('Esa versión ya no está.')
      again.app.unmount()
    })
  })
})
