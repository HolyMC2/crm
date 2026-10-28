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

const {
  etiquetasHref,
  jobLine,
  jobState,
  layoutGroups,
  mergeRows,
  printBlock,
  printLabel,
  startFrom,
  startLayout,
  totalLabels,
  withBase,
} = etq

const LAYOUTS = [
  { key: 'preset:medium', kind: 'size', label: 'Mediana', size: '50 × 30 mm' },
  {
    key: 'preset:gondola',
    kind: 'size',
    label: 'Góndola',
    size: '100 × 60 mm',
  },
  {
    key: 'printformat:Mercado Etiqueta 50x30 mm (Mediana)',
    kind: 'format',
    label: 'Mercado Etiqueta 50x30 mm (Mediana)',
    size: '50 × 30 mm',
  },
  {
    key: 'template:57x40mm',
    kind: 'template',
    label: '57x40mm',
    size: '',
    problem: 'Le falta el tamaño de la etiqueta.',
  },
]
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
      'Elige una plantilla.',
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
      ['Tamaños', 2],
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
})

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
    fields: [
      { key: 'name', label: 'Nombre' },
      { key: 'price', label: 'Precio' },
    ],
    price_list: 'Standard Selling',
    printer: { kind: 'browser', text: 'Imprime con la impresora que elijas.' },
    counts: { today: 2, failed: 1 },
    new_template_url: '',
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
const button = (label) =>
  [...root.querySelectorAll('button')].find((b) =>
    b.textContent.trim().includes(label),
  )

beforeEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
  localStorage.clear()
  answers = {
    bootstrap: boot(),
    rows: (args) => ({
      rows: JSON.parse(args.items || '[]')
        .map((it) => ROWS[it.code])
        .filter(Boolean),
      unknown: JSON.parse(args.items || '[]')
        .map((it) => it.code)
        .filter((code) => !ROWS[code]),
      source: null,
    }),
    preview: {
      html: '<html><body>label</body></html>',
      label_count: 2,
      shown: 2,
      warnings: [
        {
          key: 'sin_precio',
          items: ['B'],
          text: '1 sin precio en Standard Selling: su etiqueta sale sin precio.',
        },
      ],
    },
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
    expect(text()).toContain('Mediana · 50 × 30 mm')
    await new Promise((resolve) => setTimeout(resolve, 400))
    await flush()
    expect(calls.some(([m]) => m === 'preview')).toBe(true)
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
    expect(printed.fields).toEqual(['name', 'price'])
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
