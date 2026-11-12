// «⋯» on a record page: it opens the tools once the record bundle is in, loads
// it again when the first try failed, and says why instead of doing nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const { errors, answers } = vi.hoisted(() => ({ errors: [], answers: [] }))
vi.mock('frappe-ui', () => ({
  call: async () => {
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  },
  toast: { error: (m) => errors.push(m), success: () => {} },
}))
vi.mock('@/documentos/profiles', () => ({ loadProfile: async () => ({}) }))

import { useRecordKit } from '@/components/documentos/compras/recordKit'

let app, root
beforeEach(() => {
  errors.length = 0
  answers.length = 0
  globalThis.requestIdleCallback = (fn) => fn()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  delete globalThis.requestIdleCallback
})

async function mountKit(options = {}) {
  let kit
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    setup() {
      kit = useRecordKit('Item', { name: () => 'IPN005415', ...options })
      return () => h('div')
    },
  })
  app.use(router)
  app.mount(root)
  await router.isReady()
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
  return kit
}

const bundle = { doctype: 'Item', name: 'IPN005415', actions: {}, doc: {} }

describe('«⋯» on a record page', () => {
  it('loads the record again when the first try failed, then opens', async () => {
    answers.push(new Error('Tipo de documento X no encontrado'), bundle)
    const kit = await mountKit()
    expect(kit.record.value).toBeNull()
    await kit.openTools()
    expect(kit.open.value).toBe('tools')
    expect(errors).toEqual([])
  })

  it('lists the tools of the page itself and hands their tap back to it', async () => {
    answers.push(bundle)
    const ran = []
    const kit = await mountKit({
      pageTools: () => [
        {
          key: 'merma',
          label: 'Registrar merma',
          icon: 'lucide-package-x',
          allowed: true,
        },
      ],
      onPageTool: (key) => ran.push(key),
    })
    const keys = kit.tools.value.map((tool) => tool.key)
    expect(keys).toContain('merma')
    // With the engine's own, before the ones that copy or delete.
    expect(keys.indexOf('merma')).toBeLessThan(keys.indexOf('duplicate'))
    await kit.onTool('merma')
    expect(ran).toEqual(['merma'])
  })

  it('says why when the record still does not load', async () => {
    answers.push(
      new Error('Sin permiso para ver este producto'),
      new Error('Sin permiso para ver este producto'),
    )
    const kit = await mountKit()
    await kit.openTools()
    expect(kit.open.value).not.toBe('tools')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('No se pudieron abrir las herramientas.')
  })
})
