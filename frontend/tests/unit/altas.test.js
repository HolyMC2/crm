// «Registrar algo nuevo» and «Altas por revisar»: the worker's form sends the row,
// then each photo, then hands it over; nothing goes without a photo or a name. The
// alta page shows the assistant's proposal and, to who decides, the three ways out;
// «Dar de alta» sends the name and group the person kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  altaTitle,
  estadoTone,
  piezas,
  tipoLabel,
} from '@/composables/useAltas'

const state = vi.hoisted(() => ({ calls: [], photos: [], detalle: null }))

vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  const route = { name: '', params: {}, query: {}, fullPath: '/' }
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    beforeEach: vi.fn(),
    afterEach: vi.fn(),
    currentRoute: { value: route },
  }
  return {
    useRoute: () => route,
    useRouter: () => router,
    RouterLink: {
      props: ['to'],
      setup:
        (_, { slots }) =>
        () =>
          h('a', slots.default?.()),
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})
vi.mock('@/composables/useAltas', async (importOriginal) => ({
  ...(await importOriginal()),
  altasApi: async (method, args) => {
    state.calls.push([method, args])
    if (method === 'boot') return { photo_cap: 4, can_propose: true }
    if (method === 'ubicaciones') return { rows: [] }
    if (method === 'proponer') return { name: 'ALTA-00001' }
    if (method === 'detalle') return state.detalle
    if (method === 'decidir')
      return { item: 'IPN1', item_name: 'Conector FPC', said: [] }
    return {}
  },
  sendAltaPhoto: async (alta, file) => {
    state.photos.push([alta, file.name])
    return { alta }
  },
}))

let app
let host
async function mount(path, props = {}) {
  const page = (await import(`@/pages/${path}.vue`)).default
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(page, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(host)
  await settle()
  return host
}
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r))
  await nextTick()
}
function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

beforeEach(() => {
  state.calls = []
  state.photos = []
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:foto')
  globalThis.URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('words', () => {
  it('counts pieces and names the alta by the best name it has', () => {
    expect(piezas(1)).toBe('1 piece')
    expect(piezas(10)).toBe('10 pieces')
    expect(
      altaTitle({ propuesta: { nombre: 'Conector FPC' }, nombre: 'fpc' }),
    ).toBe('Conector FPC')
    expect(altaTitle({ propuesta: {}, nombre: 'fpc a26' })).toBe('fpc a26')
    expect(estadoTone('Por revisar')).toBe('warning')
    expect(tipoLabel('Se usa en el taller')).toBe('Used in the workshop')
  })
})

describe('Registrar algo nuevo', () => {
  it('waits for a photo or a name, then sends the row, the photos and hands it over', async () => {
    const root = await mount('AltaNueva')
    const send = root.querySelector('[data-alta-enviar]')
    expect(send.disabled).toBe(true)
    expect(root.querySelector('[data-alta-falta]').textContent).toContain(
      'Take a photo or write what it is.',
    )
    const input = root.querySelector('[data-alta-camara] input')
    const file = new File(['x'], 'etiqueta.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    type(root.querySelector('[data-alta-nombre]'), 'pin de carga a26')
    await nextTick()
    expect(root.querySelectorAll('[data-alta-foto]').length).toBe(1)
    expect(send.disabled).toBe(false)
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await settle()
    const methods = state.calls.map(([m]) => m)
    expect(methods.slice(-2)).toEqual(['proponer', 'enviar'])
    expect(state.calls.find(([m]) => m === 'proponer')[1]).toMatchObject({
      nombre: 'pin de carga a26',
      cantidad: 1,
      tipo: 'Para vender',
    })
    expect(state.photos).toEqual([['ALTA-00001', 'etiqueta.jpg']])
    expect(root.querySelector('[data-alta-enviada]')).not.toBeNull()
  }, 20000)
})

describe('Una alta', () => {
  const detalle = (extra = {}) => ({
    name: 'ALTA-00001',
    estado: 'Por revisar',
    nombre: 'fpc a26',
    tipo: 'Para vender',
    cantidad: 10,
    lugar: 'Anaquel A › Caja 3',
    codigo: '43009948',
    quien: 'Jessica',
    fotos: ['/files/a.jpg'],
    agente_estado: 'Lista',
    propuesta: {
      nombre: 'Conector FPC de carga para Samsung A26',
      grupo: 'Centros de Carga',
      compatible: ['Samsung Galaxy A26'],
      etiqueta: '10Pcs Charging FPCA26 A266',
      nota: null,
    },
    parecido: null,
    parecidos: [],
    can_decide: true,
    grupos: ['Centros de Carga', 'Insumos de Taller'],
    money_hidden: false,
    ...extra,
  })

  it('shows the proposal and creates it with the name and group kept', async () => {
    state.detalle = detalle()
    const root = await mount('Alta', { name: 'ALTA-00001' })
    expect(root.querySelector('[data-alta-propuesta]').textContent).toContain(
      'Conector FPC de carga para Samsung A26',
    )
    root.querySelector('[data-alta-dar]').click()
    await settle()
    const name = document.querySelector('[data-alta-dar-nombre]')
    expect(name.value).toBe('Conector FPC de carga para Samsung A26')
    expect(document.querySelector('[data-alta-dar-grupo]').value).toBe(
      'Centros de Carga',
    )
    document.querySelector('#alta-dar').dispatchEvent(new Event('submit'))
    await settle()
    const [, args] = state.calls.find(([m]) => m === 'decidir')
    expect(args).toMatchObject({
      alta: 'ALTA-00001',
      accion: 'alta',
      datos: {
        nombre: 'Conector FPC de carga para Samsung A26',
        grupo: 'Centros de Carga',
        codigo: '43009948',
      },
    })
  }, 20000)

  it('who waits sees no way to decide, only who decides it', async () => {
    state.detalle = detalle({ can_decide: false })
    const root = await mount('Alta', { name: 'ALTA-00001' })
    expect(root.querySelector('[data-alta-acciones]')).toBeNull()
    expect(root.querySelector('[data-alta-espera]')).not.toBeNull()
  })
})
