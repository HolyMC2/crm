// The desktop's top bar (shell/ShellTopBar.vue) and today's widgets
// (shell/ShellWidgets.vue): the shop and a clock in the worker's language and
// zone; the clock opens the agenda, the day's sales and the pendientes from
// Hoy's one read, each a link that keeps the worker's way back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const fixture = vi.hoisted(() => ({ boot: null, loadHoy: null }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))
vi.mock('@/composables/muelleShell', () => ({
  get shellBoot() {
    return fixture.boot
  },
}))
vi.mock('@/composables/useHoy', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHoy: (...args) => fixture.loadHoy(...args),
}))

const sales = {
  available: true,
  currency: 'MXN',
  value: 1250,
  prev: 0,
  facts: [{ label: 'Tickets', value: 3, format: 'count' }],
  drill: { path: '/crm/resultados/documentos', query: { tipo: 'ventas' } },
}
const day = (over = {}) => ({
  today: '2026-11-26',
  time_zone: 'America/Mazatlan',
  agenda: {
    available: true,
    sources: [],
    events: [
      {
        id: 'E1',
        source: 'Event',
        title: 'Entrega a Ana',
        start: '2026-11-26T22:00:00Z',
        end: '2026-11-26T22:30:00Z',
      },
    ],
  },
  ventas: sales,
  pendientes: {
    available: true,
    overdue: { rows: [{ name: 'T1', description: 'Llamar al proveedor' }] },
    today: { rows: [{ name: 'T2', description: 'Contar cajón' }] },
  },
  ...over,
})

let app
let root
async function mountBar() {
  const { default: ShellTopBar } = await import(
    '@/components/shell/ShellTopBar.vue'
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  await router.push('/resultados')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ShellTopBar, { avisos: false })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(root)
  await nextTick()
  return router
}
// The panel is its own chunk: wait for it, then for Hoy's read.
const flush = async () => {
  await vi.dynamicImportSettled()
  for (let i = 0; i < 6; i++) await new Promise((done) => setTimeout(done))
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 13:08 in Mazatlán.
  vi.setSystemTime(new Date('2026-11-26T20:08:30Z'))
  fixture.boot = ref({
    company: 'Celulares Doco',
    locale: 'es-MX',
    time_zone: 'America/Mazatlan',
  })
  fixture.loadHoy = vi.fn(async () => day())
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.resetModules()
})

describe('the top bar', () => {
  it('names the shop and reads the clock in the worker’s language and zone', async () => {
    await mountBar()
    expect(
      root.querySelector('[data-testid="shell-topbar-shop"]').textContent,
    ).toBe('Celulares Doco')
    expect(
      root.querySelector('[data-testid="shell-clock"]').textContent.trim(),
    ).toBe('jue 26 nov 13:08')
  })

  it('falls back to Muelle without a company', async () => {
    fixture.boot.value = { locale: 'en-US', time_zone: 'America/Mazatlan' }
    await mountBar()
    expect(
      root.querySelector('[data-testid="shell-topbar-shop"]').textContent,
    ).toBe('Muelle')
    expect(
      root.querySelector('[data-testid="shell-clock"]').textContent.trim(),
    ).toBe('Thu Nov 26 13:08')
  })
})

describe('today’s widgets', () => {
  async function openWidgets() {
    const router = await mountBar()
    root.querySelector('[data-testid="shell-clock"]').click()
    await flush()
    return router
  }
  const widget = (key) => document.querySelector(`[data-widget="${key}"]`)

  it('shows the agenda, the day’s sales and the pendientes from one Hoy read', async () => {
    await openWidgets()
    expect(fixture.loadHoy).toHaveBeenCalledOnce()
    expect(widget('agenda').textContent).toContain('Entrega a Ana')
    expect(widget('agenda').textContent).toContain('15:00')
    expect(widget('ventas').textContent).toContain('1,250.00')
    const tasks = widget('pendientes')
    expect(tasks.textContent).toContain('Llamar al proveedor')
    expect(tasks.textContent).toContain('Contar cajón')
    expect(tasks.querySelector('.num').textContent.trim()).toBe('2')
    // One is overdue: the count is the red figure, the rows stay grey.
    expect(tasks.querySelector('.num').className).toContain('text-ink-red-7')
  })

  it('leaves out what the worker may not see', async () => {
    fixture.loadHoy = vi.fn(async () =>
      day({ ventas: { available: false }, agenda: { available: false } }),
    )
    await openWidgets()
    expect(widget('ventas')).toBeNull()
    expect(widget('agenda')).toBeNull()
    expect(widget('pendientes')).not.toBeNull()
  })

  it('opens each module without sending the worker back to Hoy', async () => {
    await openWidgets()
    const href = widget('ventas').getAttribute('href')
    expect(href).toContain('/resultados/documentos?tipo=ventas')
    expect(href).not.toContain('return_to')
    expect(widget('agenda').getAttribute('href')).not.toContain('return_to')
  })

  it('says so and offers a retry when the day cannot be read', async () => {
    fixture.loadHoy = vi.fn(async () => {
      throw new Error('down')
    })
    await openWidgets()
    const alert = document.querySelector(
      '[data-testid="shell-widgets"] [role="alert"]',
    )
    expect(alert.textContent).toContain('We could not read your day.')
  })

  it('closes when the worker goes elsewhere', async () => {
    const router = await openWidgets()
    expect(
      document.querySelector('[data-testid="shell-widgets"]'),
    ).not.toBeNull()
    await router.push('/agenda')
    await flush()
    expect(document.querySelector('[data-testid="shell-widgets"]')).toBeNull()
  })
})
