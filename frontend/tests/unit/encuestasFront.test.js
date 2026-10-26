// Formularios and Encuestas share one front (Shell SPEC §8.2, Q7 = B; DE6):
// one tab strip on both pages, each tab its own route, and a tab you come back
// to opens where you left it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

const who = vi.hoisted(() => ({ manager: true }))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => who.manager }),
}))
vi.mock('@/composables/muelleShell', async () => {
  const { ref } = await import('vue')
  return { shellBoot: ref(null) }
})

import FormsEncuestasTabs from '@/components/encuestas/FormsEncuestasTabs.vue'
import { shellBoot } from '@/composables/muelleShell'
import { frontTabs } from '@/composables/useEncuestas'

const encuestasOn = (enabled = true) => ({
  modules: { encuestas: { key: 'encuestas', enabled, capabilities: {} } },
})

describe('frontTabs', () => {
  it('lists Formularios then Encuestas, each with its route', () => {
    expect(frontTabs({ forms: true, encuestas: true })).toEqual([
      { value: 'Forms', label: 'Forms', path: '/forms' },
      { value: 'Encuestas', label: 'Encuestas', path: '/encuestas' },
    ])
  })

  it('offers only what the worker may open', () => {
    expect(
      frontTabs({ forms: false, encuestas: true }).map((t) => t.value),
    ).toEqual(['Encuestas'])
    expect(
      frontTabs({ forms: true, encuestas: false }).map((t) => t.value),
    ).toEqual(['Forms'])
  })
})

describe('FormsEncuestasTabs', () => {
  let app
  let router

  beforeEach(() => {
    who.manager = true
    shellBoot.value = encuestasOn()
  })
  afterEach(() => app?.unmount())

  async function mount(path) {
    router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [
        { path: '/forms', name: 'Forms', component: FormsEncuestasTabs },
        { path: '/encuestas', name: 'Encuestas', component: FormsEncuestasTabs },
      ],
    })
    await router.push(path)
    const root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(RouterView) })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await router.isReady()
    await nextTick()
    return root
  }
  const tabs = (root) =>
    [...root.querySelectorAll('[role="radio"]')].map((b) => ({
      label: b.textContent.trim(),
      checked: b.getAttribute('aria-checked') === 'true',
    }))
  const click = async (root, label) => {
    ;[...root.querySelectorAll('[role="radio"]')]
      .find((b) => b.textContent.trim() === label)
      .click()
    await new Promise((done) => setTimeout(done))
    await nextTick()
  }

  it('shows the same two tabs on /forms and on /encuestas, the page own tab chosen', async () => {
    let root = await mount('/forms')
    expect(tabs(root)).toEqual([
      { label: 'Forms', checked: true },
      { label: 'Encuestas', checked: false },
    ])
    app.unmount()
    root = await mount('/encuestas')
    expect(tabs(root)).toEqual([
      { label: 'Forms', checked: false },
      { label: 'Encuestas', checked: true },
    ])
  })

  it('switching tabs changes the route, and coming back keeps where the worker was', async () => {
    const root = await mount('/encuestas?view=seguimiento&periodo=90')
    await click(root, 'Forms')
    expect(router.currentRoute.value.fullPath).toBe('/forms')
    await click(root, 'Encuestas')
    expect(router.currentRoute.value.fullPath).toBe(
      '/encuestas?view=seguimiento&periodo=90',
    )
  })

  it('hides the strip when the worker may open only one of the two', async () => {
    who.manager = false
    let root = await mount('/encuestas')
    expect(root.querySelector('[data-testid="encuestas-front"]')).toBeNull()
    app.unmount()
    who.manager = true
    shellBoot.value = encuestasOn(false)
    root = await mount('/forms')
    expect(root.querySelector('[data-testid="encuestas-front"]')).toBeNull()
  })
})

describe('both pages carry the shared front', () => {
  const page = (name) =>
    readFileSync(resolve(__dirname, `../../src/pages/${name}.vue`), 'utf8')

  it.each(['Forms', 'Encuestas'])('%s.vue renders <FormsEncuestasTabs>', (name) => {
    expect(page(name)).toMatch(/<FormsEncuestasTabs\b/)
  })
})

describe('es.po', () => {
  const po = readFileSync(
    resolve(__dirname, '../../../crm/locale/es.po'),
    'utf8',
  )
  it('translates the strip label', () => {
    expect(po).toContain(
      'msgid "Forms and surveys"\nmsgstr "Formularios y encuestas"',
    )
  })
})
