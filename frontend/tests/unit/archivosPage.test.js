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

let app
let root
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
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
  // The boot is cached per page load: this mount starts cold.
  await loadArchivosBoot({ refresh: true })
  const router = createRouter({
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
