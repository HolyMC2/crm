// «Importar productos» / «Importar clientes» (/crm/productos/importar,
// /crm/contactos/importar): the owner's sheet into Muelle without the Desk.
// Pick the file, check the columns and first rows, see the rows with errors,
// import, follow it, undo it. The helpers, then the page as the owner uses it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import {
  chooseColumn,
  choicesOf,
  countsOf,
  fileProblem,
  importBlocker,
  importLabel,
  moreErrorsLabel,
  nameAsCode,
  dropNameAsCode,
  offersNameAsCode,
  progressOf,
  questions,
  sampleRows,
  summaryOf,
} from '@/components/importar/importar'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  upload: vi.fn(),
  pending: vi.fn(),
  answer: vi.fn(),
  phone: null,
}))
vi.mock('@/composables/breakpoint', async (importOriginal) => {
  const { ref } = await import('vue')
  state.phone = ref(false)
  return { ...(await importOriginal()), isMobile: state.phone }
})
vi.mock('@/components/importar/importar', async (importOriginal) => ({
  ...(await importOriginal()),
  importarApi: (...args) => state.api(...args),
  uploadSheet: (...args) => state.upload(...args),
}))
vi.mock('@/components/primeros/primerosPasos', async (importOriginal) => ({
  ...(await importOriginal()),
  loadCatalogPending: (...args) => state.pending(...args),
  answerDecisions: (...args) => state.answer(...args),
}))

import Importar from '@/pages/Importar.vue'

const OPCIONES = {
  que: 'productos',
  disponible: true,
  puede: true,
  motivo: null,
  limite_mb: 10,
  limite_filas: 5000,
  campos: [],
  recientes: [],
  tambien: 'clientes',
  preguntas: 0,
}
const CAMPOS = [
  { campo: 'item_code', etiqueta: 'Código', obligatorio: true, columna: 0 },
  { campo: 'item_name', etiqueta: 'Nombre', obligatorio: true, columna: 1 },
  {
    campo: 'rate',
    etiqueta: 'Precio de venta',
    obligatorio: false,
    columna: 2,
  },
  { campo: 'cost', etiqueta: 'Costo', obligatorio: false, columna: null },
]
const COLUMNAS = [
  {
    indice: 0,
    letra: 'A',
    titulo: 'Clave',
    campos: ['item_code'],
    muestra: ['F-1'],
  },
  {
    indice: 1,
    letra: 'B',
    titulo: 'Producto',
    campos: ['item_name'],
    muestra: ['Funda'],
  },
  {
    indice: 2,
    letra: 'C',
    titulo: 'Precio',
    campos: ['rate'],
    muestra: ['249'],
  },
]
function review(overrides = {}) {
  return {
    vista: 'im-review1',
    que: 'productos',
    archivo: 'inventario.xlsx',
    archivo_id: 'file-1',
    hoja: 'Hoja1',
    encabezado: 1,
    filas: 4,
    columnas: COLUMNAS,
    campos: CAMPOS,
    dudas: [],
    faltan: [],
    nombre_como_codigo: false,
    sin_codigo: 0,
    bloqueos: [],
    cuentas: {
      nuevas: 2,
      actualizar: 0,
      existentes: 1,
      repetidas: 0,
      errores: 1,
    },
    por_importar: 2,
    existentes: 'omitir',
    en_segundo_plano: false,
    moneda: 'MXN',
    muestra: [
      {
        fila: 2,
        accion: 'crear',
        valores: [
          { campo: 'item_code', valor: 'F-1' },
          { campo: 'item_name', valor: 'Funda rosa' },
          { campo: 'rate', valor: 249 },
        ],
      },
    ],
    errores: [{ fila: 4, motivo: 'falta nombre' }],
    omitidas: [{ fila: 3, motivo: 'ya existe; se omite' }],
    notas: [],
    avisos: [],
    ya_importado: false,
    ...overrides,
  }
}
const RUNNING = {
  registro: 'IMPT-1',
  que: 'productos',
  archivo: 'inventario.xlsx',
  estado: 'En curso',
  terminada: false,
  detenida: false,
  total: 80,
  hechas: 30,
  creadas: 30,
  actualizadas: 0,
  omitidas: 0,
  fallidas: 0,
}
const DONE = {
  ...RUNNING,
  estado: 'Importado',
  terminada: true,
  hechas: 80,
  creadas: 80,
  fallas: [],
  notas: [],
  inventario: null,
  deshacible: true,
  por_que: '',
  deshecha: '',
}

let app, root, router
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const button = (text) =>
  [...root.querySelectorAll('button')].find((b) =>
    b.textContent.trim().includes(text),
  )
const calls = (method) =>
  state.api.mock.calls.filter(([name]) => name === method)

async function mount(path = '/productos/importar') {
  const page = { render: () => h('p', 'page') }
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/productos/importar',
        component: Importar,
        props: { que: 'productos' },
      },
      {
        path: '/contactos/importar',
        component: Importar,
        props: { que: 'clientes' },
      },
      { path: '/productos', component: page },
      { path: '/contactos', component: page },
      { path: '/hoy', component: page },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  app.mount(root)
  await flush()
}

async function pick(file) {
  const input = root.querySelector('[data-importar-archivo]')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flush()
}
const sheet = (name = 'inventario.xlsx', size = 2048) => ({ name, size })

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.api.mockReset()
  state.upload.mockReset()
  state.pending.mockReset()
  state.answer.mockReset()
  state.upload.mockResolvedValue('file-1')
  state.api.mockImplementation(async (method) => {
    if (method === 'opciones') return { ...OPCIONES }
    if (method === 'revisar') return review()
    return {}
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.useRealTimers()
})

describe('the helpers', () => {
  it('a field takes a column and the field that had it lets it go', () => {
    const choices = { item_code: 0, item_name: 1, rate: 2 }
    expect(chooseColumn(choices, 'cost', 2)).toEqual({
      item_code: 0,
      item_name: 1,
      cost: 2,
    })
    expect(chooseColumn(choices, 'rate', '')).toEqual(choices)
  })

  it('the name stands in for the code and moves with the name', () => {
    const linked = nameAsCode({ item_name: 1, rate: 2 })
    expect(linked).toEqual({ item_name: 1, item_code: 1, rate: 2 })
    expect(chooseColumn(linked, 'item_name', 3)).toEqual({
      item_name: 3,
      item_code: 3,
      rate: 2,
    })
    expect(dropNameAsCode(linked)).toEqual({ item_name: 1, rate: 2 })
  })

  it('reads the review’s mapping as the choices it starts from', () => {
    expect(choicesOf(review())).toEqual({ item_code: 0, item_name: 1, rate: 2 })
  })

  it('asks an ambiguous title as a question with each answer', () => {
    const [question] = questions(
      review({
        dudas: [
          {
            tipo: 'ambigua',
            columna: 2,
            titulo: 'Precio',
            campos: ['rate', 'cost'],
          },
        ],
      }),
    )
    expect(question.text).toBe('Is «Precio» Precio de venta or Costo?')
    expect(question.options.map((o) => [o.campo, o.columna])).toEqual([
      ['rate', 2],
      ['cost', 2],
    ])
  })

  it('counts what goes in, what stays and what has errors', () => {
    expect(countsOf(review()).map((line) => [line.key, line.value])).toEqual([
      ['nuevas', 2],
      ['existentes', 1],
      ['errores', 1],
    ])
    expect(importLabel(review())).toBe('Import 2 products')
    expect(importLabel(review({ que: 'clientes', por_importar: 1 }))).toBe(
      'Import 1 customer',
    )
    // nothing goes in: «Importar», never «Importar 0 productos»
    expect(importLabel(review({ por_importar: 0 }))).toBe('Import')
  })

  it('says why «Importar» waits', () => {
    expect(importBlocker(review())).toBe('')
    expect(importBlocker(review({ faltan: ['item_code'] }))).toBe(
      'Choose the column of Código.',
    )
    expect(importBlocker(review({ por_importar: 0 }))).toMatch(/nothing/)
    // every row refused for want of a code: the guard names the way out
    expect(importBlocker(review({ por_importar: 0, sin_codigo: 4 }))).toBe(
      'Tap «My products have no code: use the name», or fill in the codes in your sheet.',
    )
  })

  it('offers the name as the code when products were refused for want of one', () => {
    expect(offersNameAsCode(review())).toBe(false)
    // the template's «Código» left empty, as its note says
    expect(offersNameAsCode(review({ sin_codigo: 3 }))).toBe(true)
    expect(
      offersNameAsCode(review({ sin_codigo: 3, nombre_como_codigo: true })),
    ).toBe(false)
    expect(offersNameAsCode(review({ sin_codigo: 3, que: 'clientes' }))).toBe(
      false,
    )
    const noName = CAMPOS.map((c) =>
      c.campo === 'item_name' ? { ...c, columna: null } : c,
    )
    expect(offersNameAsCode(review({ sin_codigo: 3, campos: noName }))).toBe(
      false,
    )
  })

  it('says how many rows with errors the list holds when it holds the first ones', () => {
    expect(moreErrorsLabel(review())).toBe('See all 1')
    const first = Array.from({ length: 100 }, (_, i) => ({
      fila: i + 2,
      motivo: 'falta código',
    }))
    expect(
      moreErrorsLabel(review({ errores: first, cuentas: { errores: 412 } })),
    ).toBe('See 100 of 412')
  })

  it('shows a first row by its name, the rest in words', () => {
    const [row] = sampleRows(review())
    expect(row.titulo).toBe('Funda rosa')
    expect(row.detalle).toContain('Código: F-1')
    expect(row.detalle).toContain('Precio de venta: ')
    const named = sampleRows(review({ nombre_como_codigo: true }))[0]
    expect(named.detalle).not.toContain('Código')
  })

  it('refuses a file that is not a sheet, empty or too big before it uploads', () => {
    expect(fileProblem(sheet('fotos.zip'))).toMatch(/not a spreadsheet/)
    expect(fileProblem(sheet('a.csv', 0))).toMatch(/empty/)
    expect(
      fileProblem(sheet('a.xlsx', 11 * 1024 * 1024), { limite_mb: 10 }),
    ).toMatch(/bigger than 10 MB/)
    expect(fileProblem(sheet('a.XLS'))).toBe('')
  })

  it('a refused upload says the site’s own reason', async () => {
    const { uploadSheet } = await vi.importActual(
      '@/components/importar/importar',
    )
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 417,
      json: async () => ({
        _server_messages: JSON.stringify([
          JSON.stringify({
            message: 'File size exceeded the maximum allowed size of 5 MB',
          }),
        ]),
      }),
    })
    vi.stubGlobal('fetch', fetch)
    try {
      await expect(uploadSheet(new File(['x'], 'a.xlsx'))).rejects.toThrow(
        'File size exceeded the maximum allowed size of 5 MB',
      )
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: { name: 'file-9', file_url: '/x' } }),
      })
      await expect(uploadSheet(new File(['x'], 'a.xlsx'))).resolves.toBe(
        'file-9',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('follows a background import and sums up the end', () => {
    expect(progressOf(RUNNING)).toEqual({ pct: 38, text: '30 of 80 rows' })
    expect(summaryOf(DONE)).toEqual({
      titulo: 'Imported',
      lineas: ['80 new products'],
    })
    expect(
      summaryOf({ ...DONE, estado: 'Deshecho', deshecha: '80 eliminados' }),
    ).toEqual({ titulo: 'Import undone', lineas: ['80 eliminados'] })
  })
})

describe('the page', () => {
  it('starts with the file, the template and the way back', async () => {
    await mount()
    expect(calls('opciones')[0][1]).toEqual({ que: 'productos' })
    expect(
      root.querySelector('[data-importar-plantilla]').getAttribute('href'),
    ).toBe('/api/method/crm.api.importar.plantilla?que=productos')
    expect(
      root.querySelector('[data-importar-volver]').getAttribute('href'),
    ).toBe('/crm/productos')
    expect(root.querySelector('[data-importar-otro]')).not.toBeNull()
  })

  it('a too-big file is refused on the phone, before anything uploads', async () => {
    await mount()
    await pick(sheet('lista.xlsx', 50 * 1024 * 1024))
    expect(state.upload).not.toHaveBeenCalled()
    expect(root.textContent).toContain('bigger than 10 MB')
  })

  it('a picked file is reviewed: counts, the rows with errors and their download', async () => {
    await mount()
    await pick(sheet())
    expect(state.upload).toHaveBeenCalledTimes(1)
    expect(calls('revisar')[0][1]).toEqual({
      archivo: 'file-1',
      que: 'productos',
      columnas: '',
      existentes: 'omitir',
    })
    expect(root.querySelector('[data-importar-revision]')).not.toBeNull()
    // every required column found: the columns wait folded under the review
    expect(root.querySelector('[data-importar-columnas]').open).toBe(false)
    expect(root.querySelector('[data-importar-errores]').textContent).toContain(
      'Row 4',
    )
    expect(root.querySelector('[data-importar-errores]').textContent).toContain(
      'falta nombre',
    )
    expect(
      root
        .querySelector('[data-importar-descargar-errores]')
        .getAttribute('href'),
    ).toBe('/api/method/crm.api.importar.filas_con_error?vista=im-review1')
    expect(
      root.querySelector('[data-importar-importar]').textContent,
    ).toContain('Import 2 products')
  })

  it('a sheet without codes waits for the column, or the name as the code', async () => {
    state.api.mockImplementation(async (method, args) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar')
        return args.columnas
          ? review({ nombre_como_codigo: true })
          : review({
              vista: null,
              faltan: ['item_code'],
              por_importar: 0,
              campos: CAMPOS.map((c) =>
                c.campo === 'item_code' ? { ...c, columna: null } : c,
              ),
            })
      return {}
    })
    await mount()
    await pick(sheet())
    expect(root.querySelector('[data-importar-espera]').textContent).toContain(
      'Choose the column of Código.',
    )
    expect(root.querySelector('[data-importar-importar]').disabled).toBe(true)
    // the columns open by themselves while one is missing
    expect(root.querySelector('[data-importar-columnas]').open).toBe(true)
    root.querySelector('[data-importar-nombre-codigo]').click()
    await flush()
    expect(JSON.parse(calls('revisar')[1][1].columnas)).toEqual({
      item_name: 1,
      rate: 2,
      item_code: 1,
    })
    expect(root.textContent).toContain('The name is the code')
  })

  it('a template with its codes left empty offers the name as the code by the errors', async () => {
    const refused = [2, 3, 4].map((fila) => ({ fila, motivo: 'falta código' }))
    state.api.mockImplementation(async (method, args) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar')
        return args.columnas
          ? review({ nombre_como_codigo: true })
          : review({
              sin_codigo: 3,
              por_importar: 0,
              cuentas: {
                nuevas: 0,
                actualizar: 0,
                existentes: 0,
                repetidas: 0,
                errores: 3,
              },
              muestra: [],
              errores: refused,
            })
      return {}
    })
    await mount()
    await pick(sheet())
    const offer = root.querySelector('[data-importar-sin-codigo]')
    expect(offer.textContent).toContain('3 products have no code.')
    // the rows download to fix even when none can be imported
    expect(
      root.querySelector('[data-importar-descargar-errores]'),
    ).not.toBeNull()
    expect(root.querySelector('[data-importar-importar]').disabled).toBe(true)
    offer.querySelector('button').click()
    await flush()
    expect(JSON.parse(calls('revisar')[1][1].columnas)).toEqual({
      item_code: 1,
      item_name: 1,
      rate: 2,
    })
    expect(root.querySelector('[data-importar-sin-codigo]')).toBeNull()
  })

  it('a long list of rows with errors says it shows the first ones', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      fila: i + 2,
      motivo: 'falta nombre',
    }))
    state.api.mockImplementation(async (method) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar')
        return review({
          errores: first,
          cuentas: { ...review().cuentas, errores: 412 },
        })
      return {}
    })
    await mount()
    await pick(sheet())
    button('See 100 of 412').click()
    await flush()
    expect(root.querySelectorAll('[data-importar-errores] li').length).toBe(100)
    expect(root.textContent).toContain(
      'The other 312 are in the download of the rows with errors.',
    )
  })

  it('an import that left the stock out says why at the end', async () => {
    state.api.mockImplementation(async (method) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar') return review()
      if (method === 'importar')
        return {
          ...DONE,
          existencia: [
            'The stock was not recorded: the company has no temporary opening account.',
          ],
        }
      return {}
    })
    await mount()
    await pick(sheet())
    root.querySelector('[data-importar-importar]').click()
    await flush()
    expect(
      root.querySelector('[data-importar-existencia]').textContent,
    ).toContain('The stock was not recorded')
    expect(root.querySelector('[data-importar-inventario]')).toBeNull()
  })

  it('a column changed by hand reviews the sheet again with every choice', async () => {
    await mount()
    await pick(sheet())
    const select = root.querySelector('[data-campo="cost"] select')
    select.value = '2'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(JSON.parse(calls('revisar')[1][1].columnas)).toEqual({
      item_code: 0,
      item_name: 1,
      cost: 2,
    })
  })

  it('imports, follows the progress, and undoes it in two taps', async () => {
    vi.useFakeTimers()
    let reads = 0
    state.api.mockImplementation(async (method) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar') return review()
      if (method === 'importar') return { ...RUNNING }
      if (method === 'estado')
        return reads++
          ? { ...DONE, fallas: [{ fila: 9, motivo: 'Falta nombre' }] }
          : { ...RUNNING }
      if (method === 'deshacer')
        return {
          ...DONE,
          estado: 'Deshecho',
          deshacible: false,
          deshecha: '80 eliminados',
          fallas: [{ fila: 9, motivo: 'Falta nombre' }],
        }
      return {}
    })
    await mount()
    await pick(sheet())
    root.querySelector('[data-importar-importar]').click()
    await flush()
    expect(calls('importar')[0][1]).toEqual({ vista: 'im-review1' })
    expect(root.textContent).toContain('30 of 80 rows')
    await vi.advanceTimersByTimeAsync(1500)
    await flush()
    // A reload keeps following it.
    expect(router.currentRoute.value.query.registro).toBe('IMPT-1')
    await vi.advanceTimersByTimeAsync(1500)
    await flush()
    expect(root.querySelector('[data-importar-resumen]').textContent).toContain(
      'Imported',
    )
    expect(root.textContent).toContain('80 new products')
    expect(root.textContent).toContain('Rows that failed')
    button('Undo the import').click()
    await flush()
    expect(calls('deshacer')).toHaveLength(0) // the first tap only asks
    root.querySelector('[data-importar-deshacer-si]').click()
    await flush()
    expect(calls('deshacer')[0][1]).toEqual({ registro: 'IMPT-1' })
    expect(root.querySelector('[data-importar-resumen]').textContent).toContain(
      'Import undone',
    )
    // what was taken back, not the failures of the import it undid
    expect(root.textContent).not.toContain('Rows that failed')
  })

  it('a file with nothing to read has one way on: another file', async () => {
    state.api.mockImplementation(async (method) => {
      if (method === 'opciones') return { ...OPCIONES }
      if (method === 'revisar')
        return review({
          vista: null,
          por_importar: 0,
          bloqueos: ['No hay filas con datos debajo de los títulos.'],
        })
      return {}
    })
    await mount()
    await pick(sheet())
    expect(root.textContent).toContain(
      'No hay filas con datos debajo de los títulos.',
    )
    expect(root.querySelector('[data-importar-importar]')).toBeNull()
    expect(root.querySelector('[data-importar-espera]')).toBeNull()
    root.querySelector('[data-importar-otro-archivo]').click()
    await flush()
    expect(root.querySelector('[data-importar-inicio]')).not.toBeNull()
  })

  it('opened from Hoy, it goes back to Hoy', async () => {
    await mount('/productos/importar?return_to=%2Fcrm%2Fhoy&return_label=Hoy')
    const back = root.querySelector('[data-importar-volver]')
    expect(back.getAttribute('href')).toBe('/crm/hoy')
    expect(back.textContent).toContain('Back to Hoy')
  })

  it('asks Abordo’s catalog questions before the first products', async () => {
    let asked = 0
    state.api.mockImplementation(async (method) => {
      if (method === 'opciones')
        return { ...OPCIONES, preguntas: asked++ ? 0 : 1 }
      return {}
    })
    state.pending.mockResolvedValue([
      {
        decision_key: 'catalog.serial_numbers',
        question: '¿Tus productos llevan número de serie?',
        why: 'Los celulares llevan IMEI.',
        options: [
          { value: true, label: 'Sí' },
          { value: false, label: 'No' },
        ],
        default: true,
      },
    ])
    state.answer.mockResolvedValue([])
    await mount()
    expect(root.querySelector('[data-importar-preguntas]')).not.toBeNull()
    expect(root.querySelector('[data-importar-archivo]')).toBeNull()
    root.querySelector('[data-importar-respuestas]').click()
    await flush()
    expect(state.answer).toHaveBeenCalledWith({
      'catalog.serial_numbers': true,
    })
    expect(root.querySelector('[data-importar-archivo]')).not.toBeNull()
  })

  it('someone who may not add products is told why, with no file to pick', async () => {
    state.api.mockResolvedValue({
      ...OPCIONES,
      puede: false,
      motivo: 'Your user cannot add products.',
    })
    await mount()
    expect(
      root.querySelector('[data-importar-sin-permiso]').textContent,
    ).toContain('Your user cannot add products.')
    expect(root.querySelector('[data-importar-archivo]')).toBeNull()
  })
})
