// Manual de la tienda, review fix round 1: the editor's leave guard after a new
// article's first save (F1) and the sheets' panel and history copy (UX-1, F6, HIST-1),
// mounted with a mocked doco.manual transport.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  // The rich editor is not under test: a plain textarea stands in for it.
  TextEditor: defineComponent({
    props: { content: { type: String, default: '' } },
    emits: ['change'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          'data-testid': 'body-stub',
          value: props.content,
          onInput: (event) => emit('change', event.target.value),
        })
    },
  }),
}))
vi.mock('@/components/editor/config', () => ({ uploadFile: vi.fn() }))

import ManualEditor from '@/pages/ManualEditor.vue'
import HistorySheet from '@/components/manual/HistorySheet.vue'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const Stub = (name) => defineComponent({ name, render: () => h('p', name) })
const article = (extra = {}) => ({
  name: 'art1',
  title: 'Cierre de caja',
  category: '',
  summary: '',
  body: '<p>x</p>',
  status: 'Borrador',
  modified: '2026-10-14 10:00:00.000001',
  company: null,
  audience: [],
  place: null,
  history: [],
  can_edit: true,
  ...extra,
})

let app
let root
let answers
beforeEach(() => {
  answers = {
    'crm.api.manual.get_capabilities': {
      enabled: true,
      capabilities: { read: true, write: true },
      places: [],
      companies: [],
    },
    'doco.manual.api.list_articles': { rows: [], categories: [] },
    'doco.manual.api.save_article': article(),
  }
  globalThis.fetch = vi.fn(async (url) => {
    const method = String(url).replace('/api/method/', '')
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: answers[method] }),
    }
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

async function mountEditor(start) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/manual', name: 'Manual', component: Stub('Manual') },
      { path: '/manual/nuevo', name: 'ManualNuevo', component: ManualEditor },
      {
        path: '/manual/:name/editar',
        name: 'ManualEditar',
        component: ManualEditor,
        props: true,
      },
      {
        path: '/manual/:name',
        name: 'ManualArticulo',
        component: Stub('Articulo'),
        props: true,
      },
    ],
  })
  router.push(start)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = window.__ || globalThis.__
  app.mount(root)
  await flush()
  return router
}
function type(selector, value) {
  const input = root.querySelector(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('editor leave guard (F1)', () => {
  it('still asks before leaving after a new article’s first save', async () => {
    const router = await mountEditor('/manual/nuevo')
    type('input[maxlength="140"]', 'Cierre de caja')
    await flush()
    root.querySelector('[data-testid="manual-save"]').click()
    await flush()
    expect(router.currentRoute.value.name).toBe('ManualEditar')
    expect(router.currentRoute.value.params.name).toBe('art1')
    // Typing after the first save, then leaving.
    type('input[maxlength="140"]', 'Cierre de caja (cambio)')
    await flush()
    window.confirm = vi.fn(() => false)
    await router.push('/manual')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('ManualEditar')
    // Saying yes leaves.
    window.confirm = vi.fn(() => true)
    await router.push('/manual')
    expect(router.currentRoute.value.name).toBe('Manual')
  })

  it('leaves without asking when nothing changed', async () => {
    const router = await mountEditor('/manual/nuevo')
    window.confirm = vi.fn(() => false)
    await router.push('/manual')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('Manual')
  })
})

describe('history sheet (UX-1, F6, HIST-1)', () => {
  // The surface tokens frappe-ui's Tailwind preset actually generates.
  const surfaces = new Set(
    Object.keys(
      JSON.parse(
        fs.readFileSync(
          path.resolve(
            __dirname,
            '../../node_modules/frappe-ui/tailwind/generated/colors.json',
          ),
          'utf8',
        ),
      ).themedVariables.light.surface,
    ),
  )

  async function mountSheet(history) {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () => h(HistorySheet, { history, title: 'Cierre' }),
    })
    app.config.globalProperties.__ = window.__ || globalThis.__
    app.mount(root)
    await flush()
    return document.querySelector('[data-testid="manual-sheet"]')
  }

  it('the panel has a real background, says «last 10 changes» and no hidden field', async () => {
    const panel = await mountSheet([
      {
        who: 'Ana',
        when: '2026-10-14 10:00:00',
        fields: ['audience', 'body', 'plain_text'],
      },
    ])
    const backgrounds = [...panel.classList].filter((c) =>
      c.startsWith('bg-surface-'),
    )
    expect(backgrounds.length).toBeGreaterThan(0)
    for (const name of backgrounds)
      expect(surfaces.has(name.slice('bg-surface-'.length))).toBe(true)
    expect(panel.textContent).toMatch(/last 10 changes/)
    expect(panel.textContent).toContain('Who reads it')
    expect(panel.textContent).not.toContain('plain_text')
  })

  it('every manual component uses generated surface tokens only', () => {
    const dir = path.resolve(__dirname, '../../src/components/manual')
    const used = new Set()
    for (const file of fs.readdirSync(dir))
      for (const match of fs
        .readFileSync(path.join(dir, file), 'utf8')
        .matchAll(/\bbg-surface-([a-z0-9-]+)/g))
        used.add(match[1])
    expect([...used].filter((name) => !surfaces.has(name))).toEqual([])
  })
})
