// A new draft opened from a queue with the shell's return protocol (Gastos
// «Nueva factura» passes return_to/return_label): the arrow says «Volver a
// Gastos» and goes there, and the saved draft returns there with done=…
// instead of opening the record. Without return_to the record opens as before.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ docApi: vi.fn() }))
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: (...args) => api.docApi(...args),
}))

import DocumentoNuevo from '@/pages/DocumentoNuevo.vue'

const SAVED = {
  doctype: 'Purchase Invoice',
  name: 'ACC-PINV-2026-00009',
  docstatus: 0,
  slug_hint: 'facturas-proveedor',
}
const answers = {
  form: {
    fields: [
      { fieldname: 'bill_no', label: 'Número', fieldtype: 'Data', reqd: 0 },
    ],
    items: null,
  },
  draft: { doc: {}, title: '' },
  save: SAVED,
}

let app, root
afterEach(() => {
  app?.unmount()
  root?.remove()
  api.docApi.mockReset()
})

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
}

async function mount(path) {
  api.docApi.mockImplementation(async (method) => answers[method])
  const page = { template: '<p>page</p>' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/documentos/:slug/nuevo', component: DocumentoNuevo },
      { path: '/documentos/:slug', component: page },
      { path: '/gastos', name: 'Gastos', component: page },
      { path: '/gastos/factura/:name', component: page },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  app.mount(root)
  await flush()
  return router
}

const FROM_GASTOS =
  '/documentos/facturas-proveedor/nuevo?return_to=%2Fcrm%2Fgastos%3Fsegment%3Dpor-registrar&return_label=Gastos'

describe('a new draft opened from a queue', () => {
  it('says «Volver a Gastos» and the arrow goes back to that queue', async () => {
    const router = await mount(FROM_GASTOS)
    const back = root.querySelector('[data-appbar-back]')
    expect(back.getAttribute('aria-label')).toBe('Back to Gastos')
    back.click()
    await flush()
    expect(router.currentRoute.value.path).toBe('/gastos')
    expect(router.currentRoute.value.query).toEqual({
      segment: 'por-registrar',
    })
  })

  it('saves the draft and returns to the queue, saying which draft', async () => {
    const router = await mount(FROM_GASTOS)
    const push = vi.spyOn(router, 'push')
    const replace = vi.spyOn(router, 'replace')
    root.querySelector('[data-testid="documentos-create"]').click()
    await flush()
    expect(api.docApi).toHaveBeenCalledWith(
      'save',
      expect.objectContaining({ doctype: 'Purchase Invoice' }),
    )
    expect(router.currentRoute.value.path).toBe('/gastos')
    expect(router.currentRoute.value.query).toEqual({
      segment: 'por-registrar',
      done: 'Purchase Invoice:ACC-PINV-2026-00009',
    })
    // The form leaves history: back from the queue does not reopen a blank form.
    expect(replace).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('without a return, the saved draft opens its record as before', async () => {
    const router = await mount('/documentos/facturas-proveedor/nuevo')
    expect(
      root.querySelector('[data-appbar-back]').getAttribute('aria-label'),
    ).toBe('Volver')
    root.querySelector('[data-testid="documentos-create"]').click()
    await flush()
    expect(router.currentRoute.value.path).toBe(
      '/gastos/factura/ACC-PINV-2026-00009',
    )
  })

  it('ignores a return target outside the shell', async () => {
    const router = await mount(
      '/documentos/facturas-proveedor/nuevo?return_to=https%3A%2F%2Fevil.invalid%2Fx&return_label=Gastos',
    )
    expect(
      root.querySelector('[data-appbar-back]').getAttribute('aria-label'),
    ).toBe('Volver')
    root.querySelector('[data-testid="documentos-create"]').click()
    await flush()
    expect(router.currentRoute.value.path).toBe(
      '/gastos/factura/ACC-PINV-2026-00009',
    )
  })
})
