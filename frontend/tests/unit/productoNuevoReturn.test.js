// Nuevo producto opened from Hoy's «Agregar producto» (return_to): the saved
// product goes back to Hoy saying which, and «Cancelar» goes back too. Without a
// return the product opens as before.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const state = vi.hoisted(() => ({ api: vi.fn(), boot: null }))
vi.mock('@/composables/useProductos', async (importOriginal) => {
  const { ref } = await import('vue')
  state.boot = ref({ enabled: true, capabilities: { create_item: true } })
  return {
    ...(await importOriginal()),
    productosBoot: state.boot,
    loadProductosBoot: async () => state.boot.value,
    productosApi: (...args) => state.api(...args),
  }
})
vi.mock('@/components/Controls/Link.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['modelValue', 'label'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            'data-link': props.label,
            value: props.modelValue,
            onInput: (e) => emit('update:modelValue', e.target.value),
          }),
    },
  }
})

import ProductoNuevo from '@/pages/ProductoNuevo.vue'

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(path) {
  state.api.mockImplementation(async (method) =>
    method === 'create_item'
      ? { name: 'COCA-600', item_name: 'Coca 600' }
      : { rows: [] },
  )
  const page = { render: () => h('p', 'page') }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/productos/nuevo', component: ProductoNuevo },
      { path: '/productos', name: 'Productos', component: page },
      { path: '/productos/:item', name: 'Producto', component: page },
      { path: '/hoy', name: 'Hoy', component: page },
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
  window.__ = app.config.globalProperties.__
  app.mount(root)
  await flush()
  return router
}
// The return helpers load on the first save or cancel: wait for the route.
async function until(check, tries = 300) {
  for (let i = 0; i < tries && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
  }
}
function fill() {
  for (const [selector, value] of [
    ['[data-field="item_name"] input', 'Coca 600'],
    ['[data-link="Group"]', 'Bebidas'],
    ['[data-field="rate"] input', '22'],
  ]) {
    const input = root.querySelector(selector)
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.api.mockReset()
})

const FROM_HOY = '/productos/nuevo?return_to=%2Fcrm%2Fhoy&return_label=Hoy'

describe('a new product from Hoy', () => {
  it('saves and goes back to Hoy, saying which product', async () => {
    const router = await mount(FROM_HOY)
    fill()
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await until(() => router.currentRoute.value.path === '/hoy')
    expect(state.api).toHaveBeenCalledWith('create_item', expect.anything())
    expect(router.currentRoute.value.path).toBe('/hoy')
    expect(router.currentRoute.value.query).toEqual({ done: 'Item:COCA-600' })
  })

  it('«Cancelar» goes back to Hoy', async () => {
    const router = await mount(FROM_HOY)
    const cancel = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Cancel',
    )
    cancel.click()
    await until(() => router.currentRoute.value.path === '/hoy')
    expect(router.currentRoute.value.fullPath).toBe('/hoy')
  })

  it('without a return the product opens with its notice, as before', async () => {
    const router = await mount('/productos/nuevo')
    fill()
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await until(() => router.currentRoute.value.path !== '/productos/nuevo')
    expect(router.currentRoute.value.path).toBe('/productos/COCA-600')
    expect(router.currentRoute.value.query).toEqual({ creado: '1' })
  })
})
