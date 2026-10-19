// An unknown /documentos/:slug (an old or mistyped link) says the list does not exist and
// leads back to the hub; it never asks the server for an empty doctype (lab: «Internal
// Server Error» on /documentos/compras before).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ docApi: vi.fn() }))
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: (...args) => api.docApi(...args),
}))

import DocumentosList from '@/pages/DocumentosList.vue'

let app, root
afterEach(() => {
  app?.unmount()
  root?.remove()
  api.docApi.mockReset()
})

async function mount(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/documentos',
        name: 'Documentos',
        component: { template: '<p>hub</p>' },
      },
      { path: '/documentos/:slug', component: DocumentosList },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
  return router
}

describe('an unknown documentos list', () => {
  it('says so, calls nothing and goes back to the hub', async () => {
    const router = await mount('/documentos/compras')
    expect(root.textContent).toContain('Esta lista no existe')
    expect(root.textContent).not.toContain('Cargando')
    expect(api.docApi).not.toHaveBeenCalled()
    const button = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Ir a Documentos'),
    )
    button.click()
    await new Promise((done) => setTimeout(done, 0))
    expect(router.currentRoute.value.path).toBe('/documentos')
  })
})
