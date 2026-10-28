// One list-and-record shape: with no record open, the split's right pane sums
// up the list (by status, and the way into its first document); a module can
// drop its side column for chips and Vistas.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ListSummary from '@/components/documentos/ListSummary.vue'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'

let app
let root
async function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  app = createApp({ render: () => h(component, props) })
  app.use(router)
  app.mount(root)
  await router.isReady()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})

const summary = (over = {}) => ({
  title: 'Pedidos',
  icon: 'lucide-clipboard-check',
  chips: [
    { value: 'por-entregar', label: 'Por entregar', count: 24 },
    { value: 'borrador', label: 'Borradores', count: 0 },
    { value: '', label: 'Todos', count: 47 },
  ],
  chip: 'por-entregar',
  setChip: vi.fn(),
  shown: 24,
  more: false,
  first: '/documentos/pedidos/SO-1',
  firstTitle: 'Ana López',
  loading: false,
  ...over,
})
const text = () => root.textContent.replace(/\s+/g, ' ')

describe('the list summary', () => {
  it('counts the list by status and marks the status on screen', async () => {
    await mount(ListSummary, { summary: summary() })
    expect(text()).toContain('Pedidos')
    expect(text()).toContain('24 documentos en esta vista')
    const tiles = [...root.querySelectorAll('[data-summary-chip]')]
    const words = (t) => [...t.children].map((c) => c.textContent.trim())
    expect(tiles.map((t) => words(t).join(' '))).toEqual([
      'Por entregar 24',
      'Borradores 0',
      'Todos 47',
    ])
    expect(tiles.map((t) => t.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  it('narrows the list from a status tile and opens the first document', async () => {
    const s = summary()
    await mount(ListSummary, { summary: s })
    root.querySelector('[data-summary-chip="todos"]').click()
    expect(s.setChip).toHaveBeenCalledWith('')
    const first = root.querySelector('[data-testid="documentos-summary-first"]')
    expect(first.getAttribute('href')).toBe('/documentos/pedidos/SO-1')
    expect(text()).toContain('Ana López')
  })

  it('says how to get rows back when the filters leave none', async () => {
    await mount(ListSummary, {
      summary: summary({ shown: 0, first: null, firstTitle: '' }),
    })
    expect(text()).toContain('Sin documentos en esta vista')
    expect(text()).toContain('Cambia el estado o quita los filtros')
    expect(root.querySelector('[data-testid="documentos-summary-first"]')).toBe(
      null,
    )
  })

  it('reads «más de» when the list has another page', async () => {
    await mount(ListSummary, { summary: summary({ shown: 30, more: true }) })
    expect(text()).toContain('Más de 30 documentos en esta vista')
  })
})

describe('a module without its side column', () => {
  it('drops the column and keeps the page', async () => {
    await mount(ModuleLayout, {
      title: 'Contactos',
      entries: [{ value: 'all', label: 'Todos' }],
      aside: false,
    })
    expect(root.querySelector('aside')).toBe(null)
    app.unmount()
    root.remove()
    await mount(ModuleLayout, {
      title: 'Contactos',
      entries: [{ value: 'all', label: 'Todos' }],
    })
    expect(root.querySelector('aside')).not.toBe(null)
  })
})
