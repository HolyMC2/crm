// Etiquetas (Productos › Etiquetas, Shell-S13): what the worker sees on the
// print screen, the job list and a job, and what each tap calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/composables/useEtiquetas', async (original) => ({
  ...(await original()),
  // happy-dom has no print dialog; the screen's reaction is what we test.
  printHtml: vi.fn(async () => ({ ok: true })),
}))

import * as etq from '@/composables/useEtiquetas'
import Etiquetas from '@/pages/Etiquetas.vue'
import EtiquetasTrabajo from '@/pages/EtiquetasTrabajo.vue'
import TagSheet from '@/components/documentos/TagSheet.vue'

const {
  cleanDesign,
  customKey,
  customLayout,
  etiquetasFor,
  etiquetasHref,
  findLayout,
  jobLine,
  jobState,
  layoutGroups,
  mergeRows,
  parsePasted,
  partsText,
  pdfFile,
  printBlock,
  printLabel,
  sendPdf,
  sizeText,
  startFrom,
  startLayout,
  totalLabels,
  withBase,
} = etq

const LAYOUTS = [
  {
    key: 'preset:medium',
    kind: 'size',
    label: 'Mediana',
    size: '50 × 30 mm',
    w_mm: 50,
    h_mm: 30,
  },
  {
    key: 'preset:gondola',
    kind: 'size',
    label: 'Góndola',
    size: '100 × 60 mm',
    w_mm: 100,
    h_mm: 60,
  },
  {
    key: 'printformat:Mercado Etiqueta 50x30 mm (Mediana)',
    kind: 'format',
    label: 'Mercado Etiqueta 50x30 mm (Mediana)',
    size: '50 × 30 mm',
    w_mm: 50,
    h_mm: 30,
  },
  {
    key: 'template:57x40mm',
    kind: 'template',
    label: '57x40mm',
    size: '',
    w_mm: 0,
    h_mm: 0,
    problem: 'Le falta el tamaño de la etiqueta.',
  },
]
// bootstrap's `design`, as doco sends it.
const PARTS = [
  ['shop', 'Tienda'],
  ['name', 'Nombre'],
  ['brand', 'Marca'],
  ['price', 'Precio'],
  ['sku', 'Código'],
  ['qr', 'QR'],
  ['bar', 'Código de barras'],
  ['sn', 'Serie'],
  ['batch', 'Lote y caducidad'],
  ['date', 'Fecha'],
  ['text', 'Texto libre'],
].map(([key, label]) => ({ key, label }))
const DEFAULT_PARTS = ['shop', 'name', 'price', 'sku', 'qr', 'sn', 'batch']
const META = {
  parts: PARTS,
  default: DEFAULT_PARTS,
  custom: { min: 10, max: 300 },
  text_max: 60,
  shop: 'Perfeccel',
  shop_max: 40,
}
const ROWS = {
  A: {
    item_code: 'A',
    item_name: 'Cargador rápido',
    barcode: '750',
    price: '149.5',
    qty: 1,
    uom: 'Pza',
    serial_no: '',
    batch_no: '',
  },
  B: {
    item_code: 'B',
    item_name: 'Funda sin precio',
    barcode: '',
    price: '',
    qty: 1,
    uom: 'Pza',
    serial_no: '',
    batch_no: '',
  },
  C: {
    item_code: 'C',
    item_name: 'Teléfono A14',
    barcode: '',
    price: '3999',
    qty: 1,
    uom: 'Pza',
    serial_no: '',
    batch_no: '',
    units: 'serie',
  },
}
const JOB = {
  name: 'LPJ-2026-00013',
  title: 'Cambios de precio',
  status: 'Failed',
  layout: 'preset:gondola',
  layout_label: 'Góndola · 100 × 60 mm',
  label_count: 24,
  owner_name: 'Lupe R.',
  mine: false,
  created: '2026-10-28 14:00:00',
  printed: '',
  print_count: 0,
  source: null,
  error: 'El navegador bloqueó la impresión.',
}

describe('helpers', () => {
  it('adds the same product to the line already there, a serial once', () => {
    const rows = mergeRows(
      [{ ...ROWS.A, qty: 2 }],
      [{ ...ROWS.A, qty: 3 }, ROWS.B],
    )
    expect(rows.map((r) => [r.item_code, r.qty])).toEqual([
      ['A', 5],
      ['B', 1],
    ])
    const serial = { ...ROWS.A, serial_no: 'IMEI1', qty: 4 }
    expect(mergeRows([], [serial, serial]).map((r) => r.qty)).toEqual([1])
    expect(totalLabels([{ ...ROWS.A, qty: 500 }, serial])).toBe(201)
  })
  it('says why it cannot print yet, beside the button', () => {
    expect(printBlock({ rows: [], layout: 'preset:medium' })).toBe(
      'Agrega al menos un producto para imprimir.',
    )
    expect(printBlock({ rows: [ROWS.A], layout: '' })).toBe(
      'Elige la medida de la etiqueta.',
    )
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...ROWS.A,
      item_code: `X${i}`,
      qty: 200,
    }))
    expect(printBlock({ rows: many, layout: 'preset:medium' })).toMatch(
      /^Son 1,200 etiquetas/,
    )
    expect(printBlock({ rows: [ROWS.A], layout: 'preset:medium' })).toBe('')
    expect(printLabel([{ ...ROWS.A, qty: 3 }])).toBe('Imprimir 3 etiquetas')
    expect(printLabel([ROWS.A])).toBe('Imprimir 1 etiqueta')
  })
  it('starts from a selection, a document or a job link', () => {
    expect(startFrom({ codigos: 'A, B,,' }).items).toEqual([
      { code: 'A', qty: 1 },
      { code: 'B', qty: 1 },
    ])
    expect(startFrom({ desde: 'Purchase Receipt:MAT-PRE-1' })).toMatchObject({
      doctype: 'Purchase Receipt',
      name: 'MAT-PRE-1',
    })
    expect(startFrom({ desde: 'Sales Invoice:X' }).doctype).toBe('')
    expect(etiquetasHref(['A', 'A', 'B'])).toBe(
      '/productos/etiquetas?codigos=A%2CB',
    )
    expect(etiquetasHref([], { desde: 'Stock Entry:STE-1' })).toBe(
      '/productos/etiquetas?desde=Stock+Entry%3ASTE-1',
    )
    // A record's door: a product's own labels, a document's lines, or none.
    expect(etiquetasFor('Item', 'A')).toBe('/productos/etiquetas?codigos=A')
    expect(etiquetasFor('Purchase Invoice', 'PINV-1')).toBe(
      '/productos/etiquetas?desde=Purchase+Invoice%3APINV-1',
    )
    expect(etiquetasFor('Sales Invoice', 'SINV-1')).toBe('')
  })
  it('names each job state in the worker’s words', () => {
    expect(jobState('Dispatched').label).toBe('Enviada a la impresora')
    expect(jobState('Failed')).toEqual({
      label: 'No se imprimió',
      tone: 'danger',
    })
    expect(jobState('nonsense').label).toBe('Sin imprimir')
    const line = jobLine(JOB, { now: new Date('2026-10-28T15:00:00') })
    expect(line.startsWith('24 etiquetas · ')).toBe(true)
    expect(line).toContain('Lupe R.')
    expect(line.endsWith('Góndola · 100 × 60 mm')).toBe(true)
  })
  it('groups layouts and starts with one that prints', () => {
    expect(
      layoutGroups(LAYOUTS).map((g) => [g.title, g.layouts.length]),
    ).toEqual([
      ['Medidas', 2],
      ['Formatos de la tienda', 1],
      ['Plantillas de diseño', 1],
    ])
    expect(startLayout(LAYOUTS, 'template:57x40mm', 'preset:medium')).toBe(
      'preset:medium',
    )
    expect(startLayout(LAYOUTS, 'preset:gondola', 'preset:medium')).toBe(
      'preset:gondola',
    )
    expect(startLayout(LAYOUTS, '', '')).toBe('preset:medium')
  })
  it('resolves label images against the site inside the frame', () => {
    expect(
      withBase('<html><head><title>x</title></head></html>', 'https://t.test'),
    ).toBe(
      '<html><head><base href="https://t.test/"><title>x</title></head></html>',
    )
    expect(withBase('<base href="/x/">y', 'https://t.test')).toBe(
      '<base href="/x/">y',
    )
  })
  it('takes a measure the worker types when it is one that prints', () => {
    expect(customLayout('custom:62x29')).toMatchObject({
      kind: 'size',
      label: 'Medida',
      size: '62 × 29 mm',
      w_mm: 62,
      h_mm: 29,
    })
    expect(customLayout('custom:5x29')).toBeNull()
    expect(customLayout('custom:62x29', { min: 10, max: 50 })).toBeNull()
    expect(customLayout('preset:medium')).toBeNull()
    expect(customKey('62.5', 29.04)).toBe('custom:62.5x29')
    expect(sizeText(62.5, 29)).toBe('62.5 × 29 mm')
    expect(findLayout('custom:62x29', LAYOUTS).size).toBe('62 × 29 mm')
    expect(findLayout('preset:gondola', LAYOUTS).label).toBe('Góndola')
    expect(startLayout(LAYOUTS, 'custom:62x29', 'preset:medium')).toBe(
      'custom:62x29',
    )
    expect(startLayout(LAYOUTS, 'custom:900x29', 'preset:medium')).toBe(
      'preset:medium',
    )
  })
  it('cleans a design as doco reads it', () => {
    const design = cleanDesign(
      {
        parts: ['qr', 'name', 'nope'],
        name_size: 'xl',
        price_size: 'xl',
        code: 'serial',
        text: 'x'.repeat(80),
      },
      META,
    )
    expect(design).toMatchObject({
      parts: ['name', 'qr'],
      name_size: 'm',
      price_size: 'xl',
      code: 'unit',
    })
    expect(design.text).toHaveLength(60)
    // What older screens kept: the parts alone.
    expect(cleanDesign(['price', 'name'], META).parts).toEqual([
      'name',
      'price',
    ])
    expect(cleanDesign(null, META).parts).toEqual(DEFAULT_PARTS)
    expect(cleanDesign({ parts: [] }, META).parts).toEqual(DEFAULT_PARTS)
    expect(partsText({ parts: ['name', 'qr', 'batch'] }, PARTS)).toBe(
      'Nombre, QR, Lote y caducidad',
    )
  })
  it('reads codes pasted from a sheet or a message, with their copies', () => {
    expect(
      parsePasted('750123 3\nA-1\tx2\n\nB;C\n750123\nD, 4\nE 900'),
    ).toEqual([
      { code: '750123', qty: 4 },
      { code: 'A-1', qty: 2 },
      { code: 'B', qty: 1 },
      { code: 'C', qty: 1 },
      { code: 'D', qty: 4 },
      { code: 'E', qty: 200 },
    ])
    expect(parsePasted('  \n')).toEqual([])
  })
  it('shares the PDF on a phone and saves it on a computer', async () => {
    const file = pdfFile(btoa('%PDF-1.4'), 'LPJ-9.pdf')
    expect([file.name, file.type, file.size]).toEqual([
      'LPJ-9.pdf',
      'application/pdf',
      8,
    ])
    const share = vi.fn(async () => {})
    const nav = { canShare: () => true, share }
    expect(await sendPdf(file, { share: true, nav })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'LPJ-9.pdf' })
    const cancelled = Object.assign(new Error('x'), { name: 'AbortError' })
    share.mockRejectedValueOnce(cancelled)
    expect(await sendPdf(file, { share: true, nav })).toBe('cancelled')
    const saved = await saving(() => sendPdf(file, { share: false, nav }))
    expect(saved.result).toBe('saved')
    expect(saved.clicks).toBe(1)
    expect(share).toHaveBeenCalledTimes(2)
  })
})

// A file saved through a download link: the link is clicked, nothing opens.
async function saving(run) {
  const create = URL.createObjectURL
  const revoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:etiquetas')
  URL.revokeObjectURL = vi.fn()
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  try {
    const result = await run()
    return { result, clicks: click.mock.calls.length }
  } finally {
    click.mockRestore()
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
  }
}

// ── screens ────────────────────────────────────────────────────────────

let app
let root
let calls
let answers

function boot(extra = {}) {
  return {
    capabilities: {
      print: true,
      reason: '',
      all_jobs: true,
      design: false,
      desk: false,
    },
    layouts: LAYOUTS,
    default_layout: 'preset:medium',
    fields: PARTS,
    design: META,
    price_list: 'Standard Selling',
    printer: { kind: 'browser', text: 'Imprime con la impresora que elijas.' },
    counts: { today: 2, failed: 1 },
    new_template_url: '',
    pdf: true,
    ...extra,
  }
}

function stubApi() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('doco.workspaces.labels.')[1]
      const args = JSON.parse(init?.body || '{}')
      calls.push([method, args])
      const answer = answers[method]
      const message = typeof answer === 'function' ? answer(args) : answer
      if (message instanceof Error)
        return {
          ok: false,
          status: 403,
          json: async () => ({
            exc_type: 'PermissionError',
            _server_messages: JSON.stringify([
              JSON.stringify({ message: message.message }),
            ]),
          }),
        }
      return { ok: true, json: async () => ({ message }) }
    }),
  )
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/productos',
        name: 'Productos',
        component: { render: () => null },
      },
      { path: '/productos/etiquetas', name: 'Etiquetas', component: Etiquetas },
      {
        path: '/productos/etiquetas/trabajo/:name',
        name: 'EtiquetasTrabajo',
        component: EtiquetasTrabajo,
        props: true,
      },
      {
        path: '/productos/:item',
        name: 'Producto',
        component: { render: () => null },
      },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

const text = () => root.textContent.replace(/\s+/g, ' ')
const button = (label, scope = root) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().includes(label),
  )
// Sheets open in the page's body, outside the screen's root.
const sheetButton = (label) => button(label, document.body)
// The preview waits 250 ms for the last change before drawing.
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 400))
  await flush()
}
function type(input, value, event = 'input') {
  input.value = value
  input.dispatchEvent(new Event(event))
}
const lastCall = (method) => calls.filter(([m]) => m === method).at(-1)?.[1]

// Two products, one label each, as doco's design engine draws them.
const LABELS_HTML =
  '<html><head></head><body><div class="doco-label">A</div><div class="doco-label">B</div></body></html>'
function sizeOf(key) {
  const custom = /^custom:(\d+)x(\d+)$/.exec(key || '')
  if (custom) return { w_mm: Number(custom[1]), h_mm: Number(custom[2]) }
  const layout = LAYOUTS.find((entry) => entry.key === key)
  return { w_mm: layout?.w_mm || 0, h_mm: layout?.h_mm || 0 }
}

beforeEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
  localStorage.clear()
  answers = {
    bootstrap: boot(),
    rows: (args) => ({
      rows: JSON.parse(args.items || '[]')
        .map((it) => ROWS[it.code] && { ...ROWS[it.code], qty: it.qty || 1 })
        .filter(Boolean),
      unknown: JSON.parse(args.items || '[]')
        .map((it) => it.code)
        .filter((code) => !ROWS[code]),
      source: null,
    }),
    preview: (args) => ({
      html: LABELS_HTML,
      label_count: 2,
      shown: JSON.parse(args.rows || '[]').length || 1,
      size: sizeOf(args.layout),
      fit: { dropped: [], text: '', notes: [] },
      warnings: [
        {
          key: 'sin_precio',
          items: ['B'],
          text: '1 sin precio en Standard Selling: su etiqueta sale sin precio.',
        },
      ],
    }),
    print_labels: (args) => ({
      job: {
        ...JOB,
        name: 'LPJ-9',
        status: 'Rendered',
        label_count: JSON.parse(args.rows).length,
      },
      html: '<html><body>labels</body></html>',
    }),
    mark: (args) => ({
      job: {
        ...JOB,
        name: args.job,
        status: args.outcome === 'printed' ? 'Dispatched' : 'Failed',
        label_count: 2,
        layout_label: 'Mediana · 50 × 30 mm',
      },
    }),
    jobs: {
      rows: [JOB],
      more: false,
      counts: { today: 2, failed: 1 },
      all: true,
    },
    job: {
      ...JOB,
      rows: [ROWS.A],
      preview: '<html></html>',
      problem: '',
      can_reprint: true,
      desk_url: '',
    },
    reprint: {
      job: { ...JOB, status: 'Rendered' },
      html: '<html>again</html>',
    },
    candidates: (args) =>
      args.kind === 'piezas'
        ? {
            rows: ['S1', 'S2'].map((serial) => ({
              ...ROWS.C,
              serial_no: serial,
            })),
            more: false,
          }
        : { rows: [] },
  }
  stubApi()
  etq.printHtml.mockClear()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('Etiquetas › Imprimir', () => {
  it('loads the selected products with their price and the guard for the one without', async () => {
    await mountAt('/productos/etiquetas?codigos=A,B,ZZZ')
    expect(calls.map(([m]) => m).slice(0, 2)).toEqual(['bootstrap', 'rows'])
    expect(text()).toContain('Cargador rápido')
    expect(text()).toContain('$149.50')
    expect(root.querySelector('[data-etq-sin-precio]').textContent).toContain(
      'Sin precio · ponle uno',
    )
    expect(text()).toContain('No encontré ZZZ')
    await settle()
    expect(calls.some(([m]) => m === 'preview')).toBe(true)
    // The stage names the size it draws.
    expect(text()).toContain('Mediana · 50 × 30 mm')
    expect(text()).toContain('1 sin precio en Standard Selling')
    expect(button('Imprimir 2 etiquetas')).toBeTruthy()
  })

  it('without products the print button says why it waits', async () => {
    await mountAt('/productos/etiquetas')
    const print = root.querySelector('[data-etq-print] button')
    expect(print.disabled).toBe(true)
    expect(root.querySelector('[data-etq-print-why]').textContent).toContain(
      'Agrega al menos un producto para imprimir.',
    )
  })

  it('copies go up and down, and «Quitar los sin precio» removes them', async () => {
    await mountAt('/productos/etiquetas?codigos=A,B')
    root
      .querySelector('[aria-label="Una copia más de Cargador rápido"]')
      .click()
    await flush()
    expect(button('Imprimir 3 etiquetas')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await flush()
    button('Quitar el que no tiene precio').click()
    await flush()
    expect(text()).not.toContain('Funda sin precio')
    expect(button('Imprimir 2 etiquetas')).toBeTruthy()
  })

  it('prints: records the job, prints in the browser and shows how it went', async () => {
    await mountAt('/productos/etiquetas?codigos=A')
    root.querySelector('[data-etq-print] button').click()
    await flush()
    const [, printed] = calls.find(([m]) => m === 'print_labels')
    expect(printed.layout).toBe('preset:medium')
    expect(JSON.parse(printed.rows).map((r) => r.item_code)).toEqual(['A'])
    expect(JSON.parse(printed.design).parts).toEqual(DEFAULT_PARTS)
    expect(printed.output).toBe('html')
    expect(printed.request_key).toBeTruthy()
    expect(etq.printHtml).toHaveBeenCalledWith(
      '<html><body>labels</body></html>',
    )
    expect(calls.find(([m]) => m === 'mark')[1]).toMatchObject({
      job: 'LPJ-9',
      outcome: 'printed',
    })
    expect(root.querySelector('[data-etq-result]').textContent).toContain(
      'Enviada a la impresora',
    )
    expect(button('Ver trabajo')).toBeTruthy()
  })

  it('a browser that cannot print marks the job and offers the way on', async () => {
    etq.printHtml.mockResolvedValueOnce({
      ok: false,
      reason: 'Este navegador no puede imprimir.',
    })
    await mountAt('/productos/etiquetas?codigos=A')
    root.querySelector('[data-etq-print] button').click()
    await flush()
    expect(calls.find(([m]) => m === 'mark')[1]).toMatchObject({
      outcome: 'failed',
      error: 'Este navegador no puede imprimir.',
    })
    const result = root.querySelector('[data-etq-result]').textContent
    expect(result).toContain('No se imprimió')
    expect(result).toContain('Este navegador no puede imprimir.')
    expect(button('Volver a intentar')).toBeTruthy()
    expect(button('Descargar etiquetas')).toBeTruthy()
    button('Volver a intentar').click()
    await flush()
    expect(calls.some(([m, a]) => m === 'reprint' && a.job === 'LPJ-9')).toBe(
      true,
    )
  })

  it('a document link loads its lines and prints them as that document', async () => {
    answers.rows = (args) => ({
      rows: [{ ...ROWS.A, qty: 10 }],
      unknown: [],
      source: {
        doctype: args.doctype,
        name: args.name,
        title: `Recepción ${args.name} · Perfeccel`,
      },
    })
    await mountAt('/productos/etiquetas?desde=Purchase%20Receipt:MAT-PRE-1')
    expect(calls.find(([m]) => m === 'rows')[1]).toEqual({
      doctype: 'Purchase Receipt',
      name: 'MAT-PRE-1',
    })
    expect(root.querySelector('[data-etq-source-line]').textContent).toContain(
      'Recepción MAT-PRE-1 · Perfeccel',
    )
    root.querySelector('[data-etq-print] button').click()
    await flush()
    expect(calls.find(([m]) => m === 'print_labels')[1]).toMatchObject({
      source_doctype: 'Purchase Receipt',
      source_name: 'MAT-PRE-1',
    })
  })

  it('without the right to print it says why and leads back', async () => {
    answers.bootstrap = boot({
      capabilities: {
        print: false,
        design: false,
        reason: 'Tu usuario no imprime etiquetas en esta tienda.',
      },
    })
    await mountAt('/productos/etiquetas')
    expect(text()).toContain('No puedes imprimir etiquetas')
    expect(text()).toContain('Tu usuario no imprime etiquetas en esta tienda.')
    expect(button('Volver a Productos')).toBeTruthy()
  })

  it('with no template that prints it says who makes one', async () => {
    answers.bootstrap = boot({ layouts: [LAYOUTS[3]] })
    await mountAt('/productos/etiquetas')
    expect(text()).toContain('Aún no hay plantillas de etiqueta')
    expect(text()).toContain('Pide al encargado')
  })
})

describe('Etiquetas › the label and its design', () => {
  it('pages through the products, a tap shows a row’s label and renames it for this print', async () => {
    await mountAt('/productos/etiquetas?codigos=A,B')
    await settle()
    const pager = () => root.querySelector('[data-etq-pager]').textContent
    expect(pager()).toContain('1 de 2')
    root
      .querySelector(
        '[aria-label="Funda sin precio: ver su etiqueta y editarla"]',
      )
      .click()
    await flush()
    expect(pager()).toContain('2 de 2')
    expect(text()).toContain('Funda sin precio · 1 copia')
    const name = root.querySelector('[aria-label="Nombre en la etiqueta de B"]')
    type(name, 'Funda azul A14', 'change')
    await flush()
    expect(text()).toContain('el producto se sigue llamando «Funda sin precio»')
    expect(button('Volver al nombre')).toBeTruthy()
    await settle()
    expect(
      JSON.parse(lastCall('preview').rows).map((r) => r.item_name),
    ).toEqual(['Cargador rápido', 'Funda azul A14'])
    root.querySelector('[data-etq-print] button').click()
    await flush()
    expect(
      JSON.parse(lastCall('print_labels').rows).map((r) => r.item_name),
    ).toEqual(['Cargador rápido', 'Funda azul A14'])
  })

  it('switching a part off redraws the label without it and prints it so', async () => {
    await mountAt('/productos/etiquetas?codigos=A')
    await vi.waitFor(
      () => expect(root.querySelector('[data-etq-part="qr"]')).toBeTruthy(),
      { timeout: 3000 },
    )
    const qr = () => root.querySelector('[data-etq-part="qr"] [role="switch"]')
    expect(qr().getAttribute('aria-checked')).toBe('true')
    expect(text()).toContain('Se escanea en caja')
    qr().click()
    await settle()
    expect(qr().getAttribute('aria-checked')).toBe('false')
    const drawn = JSON.parse(lastCall('preview').design)
    expect(drawn.parts).not.toContain('qr')
    expect(drawn.parts).toContain('name')
    // The next visit starts with the same design.
    expect(
      JSON.parse(localStorage.getItem('muelle:etiquetas:diseno')).parts,
    ).toEqual(drawn.parts)
    root.querySelector('[data-etq-print] button').click()
    await flush()
    expect(JSON.parse(lastCall('print_labels').design).parts).toEqual(
      drawn.parts,
    )
  })

  it('a measure the worker types says why until it prints, then draws and prints at it', async () => {
    await mountAt('/productos/etiquetas?codigos=A')
    await vi.waitFor(
      () => expect(root.querySelector('[data-etq-otra-medida]')).toBeTruthy(),
      { timeout: 3000 },
    )
    root.querySelector('[data-etq-otra-medida]').click()
    await flush()
    const form = root.querySelector('[data-etq-medida-form]')
    const width = form.querySelector('[aria-label^="Ancho"]')
    const height = form.querySelector('[aria-label^="Alto"]')
    type(width, '5')
    type(height, '29')
    await flush()
    expect(root.querySelector('[data-etq-medida-why]').textContent).toContain(
      'Cada lado va de 10 a 300 mm.',
    )
    expect(button('Usar').disabled).toBe(true)
    type(width, '62')
    await flush()
    expect(button('Usar').disabled).toBe(false)
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()
    expect(lastCall('preview').layout).toBe('custom:62x29')
    expect(text()).toContain('Medida · 62 × 29 mm')
    expect(localStorage.getItem('muelle:etiquetas:plantilla')).toBe(
      'custom:62x29',
    )
    expect(
      JSON.parse(localStorage.getItem('muelle:etiquetas:medidas')),
    ).toEqual(['custom:62x29'])
    root.querySelector('[data-etq-print] button').click()
    await flush()
    expect(lastCall('print_labels').layout).toBe('custom:62x29')
  })

  it('pasted codes come in with their copies', async () => {
    await mountAt('/productos/etiquetas')
    button('Pegar códigos').click()
    await vi.waitFor(
      () => expect(document.querySelector('[data-etq-pegar]')).toBeTruthy(),
      { timeout: 3000 },
    )
    type(document.querySelector('[data-etq-pegar]'), 'A 3\nB')
    await flush()
    expect(document.body.textContent).toContain('2 códigos, 4 etiquetas.')
    sheetButton('Agregar 2 códigos').click()
    await flush()
    expect(JSON.parse(lastCall('rows').items)).toEqual([
      { code: 'A', qty: 3 },
      { code: 'B', qty: 1 },
    ])
    expect(button('Imprimir 4 etiquetas')).toBeTruthy()
  })

  it('a product with serials gives way to the pieces picked, one label each', async () => {
    await mountAt('/productos/etiquetas?codigos=C')
    const serie = () => root.querySelector('[data-etq-part="sn"]')?.textContent
    await vi.waitFor(() =>
      expect(serie()).toContain(
        'Para que salga, elige las piezas por serie en la lista.',
      ),
    )
    root
      .querySelector('[aria-label="Teléfono A14: ver su etiqueta y editarla"]')
      .click()
    await flush()
    button('Elegir piezas por serie').click()
    await vi.waitFor(
      () => expect(sheetButton('Agregar 2 etiquetas')).toBeTruthy(),
      { timeout: 3000 },
    )
    expect(lastCall('candidates')).toMatchObject({
      kind: 'piezas',
      query: 'C',
    })
    sheetButton('Agregar 2 etiquetas').click()
    await flush()
    const rows = [...root.querySelectorAll('[data-etq-row]')]
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Serie S1'),
      expect.stringContaining('Serie S2'),
    ])
    expect(text()).toContain('1 pieza')
    expect(button('Imprimir 2 etiquetas')).toBeTruthy()
    expect(serie()).toContain('La serie o el IMEI de cada pieza')
  })

  it('a PDF records the job and is saved on a computer', async () => {
    answers.print_labels = (args) => ({
      job: { ...JOB, name: 'LPJ-10', status: 'Rendered', label_count: 1 },
      pdf: btoa('%PDF-1.4'),
      filename: 'LPJ-10.pdf',
      output: args.output,
    })
    await mountAt('/productos/etiquetas?codigos=A')
    const saved = await saving(async () => {
      root.querySelector('[data-etq-pdf]').click()
      await flush()
    })
    expect(lastCall('print_labels')).toMatchObject({
      layout: 'preset:medium',
      output: 'pdf',
    })
    expect(saved.clicks).toBe(1)
    const result = root.querySelector('[data-etq-result]').textContent
    expect(result).toContain('PDF guardado')
    expect(result).toContain('1 etiqueta, una por página.')
    expect(etq.printHtml).not.toHaveBeenCalled()
  })
})

describe('Etiquetas › Trabajos', () => {
  it('lists the jobs with their state and filters the ones that did not print', async () => {
    await mountAt('/productos/etiquetas?vista=trabajos')
    // «Trabajos» loads with its own chunk.
    await vi.waitFor(() => expect(text()).toContain('Cambios de precio'), {
      timeout: 3000,
    })
    expect(text()).toContain('No se imprimió')
    expect(text()).toContain('Lupe R.')
    button('No se imprimieron').click()
    await flush()
    await flush()
    const last = calls.filter(([m]) => m === 'jobs').at(-1)[1]
    expect(last).toMatchObject({ status: 'Failed', mine: 0 })
  })
})

describe('Etiquetas › a job', () => {
  it('shows why it failed and reprints it', async () => {
    await mountAt('/productos/etiquetas/trabajo/LPJ-2026-00013')
    expect(text()).toContain('No se imprimió')
    expect(text()).toContain('El navegador bloqueó la impresión.')
    expect(text()).toContain('Góndola · 100 × 60 mm')
    button('Volver a imprimir').click()
    await flush()
    expect(
      calls.some(([m, a]) => m === 'reprint' && a.job === 'LPJ-2026-00013'),
    ).toBe(true)
    expect(etq.printHtml).toHaveBeenCalledWith('<html>again</html>')
    expect(calls.find(([m]) => m === 'mark')[1]).toMatchObject({
      outcome: 'printed',
    })
    expect(text()).toContain('Enviada a la impresora')
  })
})

describe('a record’s tags', () => {
  it('point a document with products to the labels that print', async () => {
    const router = await mountAt('/productos')
    const sheet = (doctype) => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const view = createApp({
        render: () =>
          h(TagSheet, {
            open: true,
            doctype,
            name: 'PINV-1',
            tags: ['38x35mm'],
          }),
      })
      view.use(router)
      view.mount(host)
      return { view, host }
    }
    const invoice = sheet('Purchase Invoice')
    await flush()
    const door = document.querySelector('[data-testid="tag-sheet-labels"] a')
    expect(door.textContent).toContain('Imprimir etiquetas')
    expect(door.getAttribute('href')).toBe(
      '/crm/productos/etiquetas?desde=Purchase+Invoice%3APINV-1',
    )
    invoice.view.unmount()
    invoice.host.remove()
    const sale = sheet('Sales Invoice')
    await flush()
    expect(
      document.querySelector('[data-testid="tag-sheet-labels"]'),
    ).toBeNull()
    sale.view.unmount()
    sale.host.remove()
  })
})
