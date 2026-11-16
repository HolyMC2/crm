// Manual de la tienda «Empezar con plantillas»: the starter cards come grouped by
// category, in the server's order; «Elegir todas» / «Quitar todas» choose a whole
// group, and only the chosen keys are sent. Mounted with a mocked doco.manual
// transport that records each POST.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import TemplatesSheet from '@/components/manual/TemplatesSheet.vue'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const TEMPLATES = [
  {
    key: 'equipo.reglas_oro',
    title: 'Las 7 reglas de oro',
    summary: '',
    category: 'Empieza aquí',
  },
  {
    key: 'equipo.nunca',
    title: 'Lo que nunca se hace',
    summary: '',
    category: 'Empieza aquí',
  },
  {
    key: 'mostrador.mica',
    title: 'Poner una mica',
    summary: '',
    category: 'Mostrador',
  },
  {
    key: 'guia.etiquetas',
    title: 'Imprimir etiquetas',
    summary: '',
    category: 'Guías de Muelle',
  },
]

let app
let root
let calls
let done
beforeEach(() => {
  calls = []
  done = vi.fn()
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({
      method: String(url).replace('/api/method/', ''),
      args: JSON.parse(init?.body || '{}'),
    })
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { created: ['a'], existing: [] } }),
    }
  })
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      h(TemplatesSheet, { templates: TEMPLATES, boot: {}, onDone: done }),
  })
  app.config.globalProperties.__ = window.__ || globalThis.__
  app.mount(root)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

const groups = () =>
  [...document.querySelectorAll('[data-group]')].map((node) => ({
    name: node.getAttribute('data-group'),
    keys: [...node.querySelectorAll('[data-template]')].map((input) =>
      input.getAttribute('data-template'),
    ),
  }))
const group = (name) => document.querySelector(`[data-group="${name}"]`)
const chosen = () =>
  [...document.querySelectorAll('[data-template]')]
    .filter((input) => input.checked)
    .map((input) => input.getAttribute('data-template'))

describe('Empezar con plantillas', () => {
  it('lists the cards by category in the server’s order', async () => {
    await flush()
    expect(groups()).toEqual([
      { name: 'Empieza aquí', keys: ['equipo.reglas_oro', 'equipo.nunca'] },
      { name: 'Mostrador', keys: ['mostrador.mica'] },
      { name: 'Guías de Muelle', keys: ['guia.etiquetas'] },
    ])
    expect(chosen()).toHaveLength(4)
  })

  it('a group button takes a whole category out and puts it back', async () => {
    await flush()
    const button = group('Empieza aquí').querySelector(
      '[data-testid="manual-templates-group"]',
    )
    button.click()
    await flush()
    expect(chosen()).toEqual(['mostrador.mica', 'guia.etiquetas'])
    button.click()
    await flush()
    expect(chosen()).toEqual(
      expect.arrayContaining(TEMPLATES.map((t) => t.key)),
    )
  })

  it('sends only the chosen keys', async () => {
    await flush()
    group('Empieza aquí')
      .querySelector('[data-testid="manual-templates-group"]')
      .click()
    await flush()
    document.querySelector('[data-testid="manual-templates-create"]').click()
    await flush()
    const call = calls.find((c) => c.method === 'doco.manual.api.use_templates')
    expect(call.args.keys).toEqual(['mostrador.mica', 'guia.etiquetas'])
    expect(done).toHaveBeenCalled()
  })
})
