// The top bar's status items (shell/ShellStatus.vue): each shows only while
// its thing is off — messages waiting for signal, this computer's label
// printer (composables/printerStatus.js), the worker's caja left open from an
// earlier day (crm.api.shell.bar_status) — and a tap does the one fix.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const fixture = vi.hoisted(() => ({ call: null }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: (...args) => fixture.call(...args),
}))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))

import { createPrinterStatus } from '@/composables/printerStatus'
import { resetBarStatusForTests } from '@/composables/barStatus'
import { outbox } from '@/composables/outbox'

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
  await nextTick()
}

describe('this computer’s label printer', () => {
  let status
  function setup({ name = 'M110S', answers = [] } = {}) {
    const printer = ref(name)
    const connected = ref(true)
    const replies = [...answers]
    const find = vi.fn(
      async () => replies.shift() || { printers: ['M110S'], missing: false },
    )
    status = createPrinterStatus({
      printer,
      find,
      connection: async () => connected,
    })
    status.start()
    return { printer, connected, find, status }
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    status?.stop()
    vi.useRealTimers()
  })

  it('never loads Muelle QZ on a computer that prints with the dialog', async () => {
    const { find } = setup({ name: '' })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(find).not.toHaveBeenCalled()
    expect(status.state.value).toBe('ok')
  })

  it('says Muelle QZ is closed when it does not answer, and checks again until it does', async () => {
    const { find } = setup({ answers: [{ printers: [], missing: true }] })
    expect(status.state.value).toBe('ok')
    await vi.advanceTimersByTimeAsync(8_000)
    expect(status.state.value).toBe('qz')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(find).toHaveBeenCalledTimes(2)
    expect(status.state.value).toBe('ok')
  })

  it('says the printer is missing when Muelle QZ no longer sees it', async () => {
    setup({ answers: [{ printers: ['Zebra ZD220'], missing: false }] })
    await vi.advanceTimersByTimeAsync(8_000)
    expect(status.state.value).toBe('missing')
  })

  it('says so at once when Muelle QZ closes', async () => {
    const { connected } = setup()
    await vi.advanceTimersByTimeAsync(8_000)
    expect(status.state.value).toBe('ok')
    connected.value = false
    await settle()
    expect(status.state.value).toBe('qz')
  })

  it('checks the printer Etiquetas chooses, and goes quiet when it is cleared', async () => {
    const { printer, find } = setup({
      answers: [{ printers: ['M110S'], missing: false }],
    })
    await vi.advanceTimersByTimeAsync(8_000)
    printer.value = 'Zebra ZD220'
    await settle()
    expect(find).toHaveBeenCalledTimes(2)
    expect(status.state.value).toBe('missing')
    printer.value = ''
    await settle()
    expect(status.state.value).toBe('ok')
  })
})

describe('the top bar’s status items', () => {
  let app
  let root
  async function mountStatus() {
    const { default: ShellStatus } = await import(
      '@/components/shell/ShellStatus.vue'
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    })
    await router.push('/resultados')
    root = document.createElement('div')
    document.body.append(root)
    app = createApp(ShellStatus)
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await settle()
  }
  const item = (key) => root.querySelector(`[data-testid="status-${key}"]`)

  beforeEach(() => {
    vi.useFakeTimers()
    resetBarStatusForTests()
    fixture.call = vi.fn(async () => ({ caja: null }))
  })
  afterEach(() => {
    app?.unmount()
    root?.remove()
    document.body.innerHTML = ''
    outbox.value = []
    vi.useRealTimers()
  })

  it('shows nothing while all is in order', async () => {
    await mountStatus()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fixture.call).toHaveBeenCalledWith('crm.api.shell.bar_status')
    expect(root.querySelector('[data-testid^="status-"]')).toBeNull()
  })

  it('counts the messages waiting for signal and opens their queue', async () => {
    outbox.value = [
      { _ts: 1, reference_name: 'CRM-LEAD-1', to: '6691', message: 'Ya está' },
      { _ts: 2, reference_name: 'CRM-LEAD-2', to: '6692', message: 'Gracias' },
    ]
    await mountStatus()
    expect(item('outbox').textContent).toContain('2 to send')
    item('outbox').click()
    await vi.dynamicImportSettled()
    await settle()
    expect(document.body.textContent).toContain('Ya está')
  })

  it('names the caja the worker left open and opens the POS to close it', async () => {
    fixture.call = vi.fn(async () => ({
      caja: {
        name: 'POS-OS-1',
        pos_profile: 'Mostrador',
        since: '2026-11-25 09:02:00',
      },
    }))
    await mountStatus()
    expect(item('caja')).toBeNull()
    await vi.advanceTimersByTimeAsync(2_000)
    await settle()
    const caja = item('caja')
    expect(caja.textContent).toContain('Caja not closed')
    expect(caja.getAttribute('aria-label')).toContain('Mostrador')
    const href = caja.getAttribute('href')
    expect(href.startsWith('/posapp')).toBe(true)
    // The POS offers the way back to where the worker was.
    expect(decodeURIComponent(href)).toContain('/crm/resultados')
  })
})
