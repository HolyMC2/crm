// The Archivos page asks the server once per list, tree and summary when it opens:
// the boot's company, the record origin and start() all name the same company.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import '@/uiHost'
import Archivos from '@/pages/Archivos.vue'
import { loadArchivosBoot } from '@/composables/useArchivos'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

// A folder's listing: two pictures around a PDF.
const file = (id, name, preview) => ({
  id,
  source: 'attachment',
  name: id.split(':')[1],
  title: name,
  file_name: name,
  media_type: preview === 'image' ? 'image/jpeg' : 'application/pdf',
  preview,
  file_size: 900,
  file_url: `/private/files/${name}`,
  creation: '2026-10-02 09:00:00',
  modified: '2026-10-02 09:00:00',
  kind: preview === 'image' ? 'foto' : 'factura',
  owner_label: 'Ana',
  can_edit: false,
})
const PICTURES = [
  file('file:F-1', 'fachada.jpg', 'image'),
  file('file:F-2', 'luz.pdf', 'pdf'),
  file('file:F-3', 'mostrador.jpg', 'image'),
]

let app
let root
let router
async function mountAt(path) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('/api/method/')[1] || ''
      const body = init?.body ? JSON.parse(init.body) : {}
      calls.push([method, body])
      let message = {}
      if (method.endsWith('.boot'))
        message = {
          enabled: true,
          company: 'Doco MX',
          companies: ['Doco MX', 'Otra SA'],
          kinds: [],
          link_types: [],
          user: 'ana@example.invalid',
        }
      else if (method.endsWith('.queue'))
        message = { documents: [], page: 1, has_more: false, counts: {} }
      else if (method.endsWith('.folders')) message = { folders: [] }
      else if (method.endsWith('.summary')) message = { total: 0 }
      else if (method.endsWith('browse.files'))
        message = { items: PICTURES, page: 1, has_more: false, total: 3 }
      else if (method.endsWith('browse.file'))
        message = PICTURES.find((row) => row.id === body.id) || {}
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
  // The boot is cached per page load: this mount starts cold.
  await loadArchivosBoot({ refresh: true })
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [{ path: '/archivos', component: Archivos }],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Archivos) })
  app.use(router)
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await flush()
  return calls
}
const perMethod = (calls) =>
  calls.reduce((acc, [method]) => {
    const short = method.split('.').slice(-2).join('.')
    acc[short] = (acc[short] || 0) + 1
    return acc
  }, {})

afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('opening Archivos', () => {
  it('reads the inbox, the tree and the summary once when the boot names the company', async () => {
    const calls = await mountAt('/archivos')
    const counts = perMethod(calls)
    expect(counts['bandeja.queue']).toBe(1)
    expect(counts['browse.folders']).toBe(1)
    expect(counts['browse.summary']).toBe(1)
    const asked = calls.filter(([m]) => m.endsWith('.summary'))[0][1]
    expect(asked.company).toBe('Doco MX')
  })
  it('reads them once too when the URL already names the company', async () => {
    const calls = await mountAt('/archivos?company=Otra%20SA')
    const counts = perMethod(calls)
    expect(counts['bandeja.queue']).toBe(1)
    expect(counts['browse.folders']).toBe(1)
    expect(counts['browse.summary']).toBe(1)
    expect(calls.filter(([m]) => m.endsWith('.summary'))[0][1].company).toBe(
      'Otra SA',
    )
  })
})

describe('a picture in Archivos', () => {
  it("opens full screen, walks the folder's pictures, and closes on the one the worker ended on", async () => {
    await mountAt('/archivos?view=recientes&file=file%3AF-1')
    await vi.waitFor(
      () =>
        expect(
          document.querySelector('[data-testid="archivo-ver-foto"]'),
        ).not.toBeNull(),
      { timeout: 10000 },
    )
    document.querySelector('[data-testid="archivo-ver-foto"]').click()
    await vi.waitFor(
      () => expect(document.querySelector('[data-ui-viewer]')).not.toBeNull(),
      { timeout: 10000 },
    )
    await flush()
    // The PDF between them is not a picture: the set is two.
    expect(document.querySelector('[data-ui-viewer-count]').textContent).toBe(
      '1 of 2',
    )
    expect(
      document.querySelector('[data-ui-viewer] header').textContent,
    ).toContain('fachada.jpg')
    document.querySelector('[data-ui-viewer-thumb="1"]').click()
    await flush()
    expect(
      document.querySelector('[data-ui-viewer] header').textContent,
    ).toContain('mostrador.jpg')
    // The pane behind has not moved yet.
    expect(router.currentRoute.value.query.file).toBe('file:F-1')
    document.querySelector('[data-ui-viewer-close]').click()
    await flush()
    expect(router.currentRoute.value.query.file).toBe('file:F-3')
  })
})
