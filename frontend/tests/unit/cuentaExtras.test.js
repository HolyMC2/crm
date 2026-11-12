// Mi cuenta › Resumen's last blocks. «Una copia de tus datos» over doco's
// data_export: «Pedir mis datos», «Preparando…» (asked again every few seconds,
// and at once on doco's realtime event), «Descargar (zip)» with its size and
// until when; the daily limit's sentence beside the button it disables. A Muelle
// outage (capability «incidents», my_incidents through miplan.call): Boat's
// title, since when in the site's clock, «Ya quedó» once fixed, and nothing of
// what Boat may add. «Tus reportes a soporte» opens doco's «Mis reportes» where
// the shell has it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  seam: vi.fn(),
  exportStatus: vi.fn(),
  requestExport: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled || props.loading,
              // frappe-ui draws its spinner inside a loading button.
              'data-spinner': props.loading ? '' : undefined,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  seam: (...args) => state.seam(...args),
  exportStatus: (...args) => state.exportStatus(...args),
  requestExport: (...args) => state.requestExport(...args),
}))

import {
  FAST_POLL_FOR_MS,
  POLL_MS,
  REALTIME_EVENT,
  SLOW_POLL_MS,
  createExport,
  exportView,
} from '@/components/cuenta/exportar'
import {
  incidentRows,
  lastedText,
  sinceText,
} from '@/components/cuenta/incidentes'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'
import ExportarDatos from '@/components/cuenta/ExportarDatos.vue'

const READY = {
  name: 'EXP-0007',
  status: 'Lista',
  running: false,
  ready: true,
  expired: false,
  failed: false,
  size_label: '2.4 MB',
  expires_label: '18 de noviembre de 2026, 14:30',
}
const RUNNING = {
  name: 'EXP-0008',
  status: 'En proceso',
  running: true,
  ready: false,
}
const LIMIT =
  'Puedes pedir 3 exportaciones al día. La siguiente puede empezar el 12 de noviembre de 2026, 09:10.'

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
function fakeTimers() {
  const pending = new Map()
  let next = 1
  return {
    pending,
    set: (fn, ms) => {
      pending.set(next, { fn, ms })
      return next++
    },
    clear: (id) => pending.delete(id),
    async fire() {
      const [[id, { fn }]] = [...pending]
      pending.delete(id)
      fn()
      await flush()
    },
  }
}

beforeEach(() => {
  state.seam.mockReset()
  state.exportStatus.mockReset()
  state.requestExport.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})

describe('exportView', () => {
  it('reads each state in the owner’s words, with the download only when ready', () => {
    expect(exportView({ export: null, can_request: true })).toMatchObject({
      state: 'none',
      canAsk: true,
      askLabel: 'Ask for my data',
      download: '',
    })
    const ready = exportView({ export: READY, can_request: true })
    expect(ready.state).toBe('ready')
    expect(ready.line).toBe(
      'Ready: 2.4 MB. You can download it until 18 de noviembre de 2026, 14:30.',
    )
    expect(ready.download).toBe(
      '/api/method/doco.docoutils.data_export.download?export=EXP-0007',
    )
    expect(ready.askLabel).toBe('Ask for a new copy')
    const running = exportView({ export: RUNNING, can_request: false })
    expect(running).toMatchObject({ state: 'running', canAsk: false })
    expect(running.refusal).toBe('')
    expect(
      exportView({
        export: { failed: true, error: 'La preparación se detuvo.' },
        can_request: true,
      }).line,
    ).toBe('La preparación se detuvo.')
    expect(
      exportView({ export: { expired: true }, can_request: true }).state,
    ).toBe('expired')
  })

  it('the daily limit closes «Pedir mis datos» and says when the next one can start', () => {
    const view = exportView({
      export: READY,
      can_request: false,
      refusal: LIMIT,
    })
    expect(view.canAsk).toBe(false)
    expect(view.refusal).toBe(LIMIT)
    // A ready copy still downloads.
    expect(view.download).toContain('EXP-0007')
  })
})

describe('createExport', () => {
  it('asks every few seconds while it runs, less after two minutes, and stops once ready', async () => {
    const timers = fakeTimers()
    let clock = 0
    state.exportStatus.mockResolvedValue({ export: RUNNING })
    const exp = createExport({ timers, now: () => clock })
    await exp.load()
    expect(exp.view.value.state).toBe('running')
    expect([...timers.pending.values()][0].ms).toBe(POLL_MS)
    clock = FAST_POLL_FOR_MS + 1
    await timers.fire()
    expect(state.exportStatus).toHaveBeenCalledTimes(2)
    expect([...timers.pending.values()][0].ms).toBe(SLOW_POLL_MS)
    state.exportStatus.mockResolvedValue({ export: READY, can_request: true })
    await timers.fire()
    expect(exp.view.value.state).toBe('ready')
    expect(timers.pending.size).toBe(0)
    exp.dispose()
  })

  it('doco’s realtime event reads the status at once; dispose unbinds it', async () => {
    const handlers = {}
    const unbind = vi.fn()
    state.exportStatus.mockResolvedValue({ export: RUNNING })
    const exp = createExport({
      timers: fakeTimers(),
      listen: (event, fn) => {
        handlers[event] = fn
        return unbind
      },
    })
    await exp.load()
    state.exportStatus.mockResolvedValue({ export: READY, can_request: true })
    handlers[REALTIME_EVENT]({ status: 'Lista' })
    await flush()
    expect(exp.view.value.state).toBe('ready')
    exp.dispose()
    expect(unbind).toHaveBeenCalledTimes(1)
  })

  it('a refused request keeps the server’s sentence; a read in flight never undoes a request', async () => {
    const timers = fakeTimers()
    state.exportStatus.mockResolvedValue({ export: null, can_request: true })
    const exp = createExport({ timers })
    await exp.load()
    state.requestExport.mockRejectedValue(
      Object.assign(new Error('doco.docoutils.data_export.request_export'), {
        exc_type: 'RateLimitExceededError',
        messages: [LIMIT],
      }),
    )
    state.exportStatus.mockResolvedValue({
      export: null,
      can_request: false,
      refusal: LIMIT,
    })
    await exp.ask()
    expect(exp.askError.value).toBe(LIMIT)
    expect(exp.view.value.canAsk).toBe(false)

    // A slow read started before the request answered lands after it: dropped.
    let slow
    state.exportStatus.mockImplementationOnce(
      () => new Promise((resolve) => (slow = resolve)),
    )
    const stale = exp.load()
    state.requestExport.mockResolvedValue({ export: RUNNING })
    state.exportStatus.mockResolvedValue({ export: RUNNING })
    await exp.ask()
    slow({ export: null, can_request: true })
    await stale
    expect(exp.view.value.state).toBe('running')
    exp.dispose()
  })

  it('start() shows a copy being prepared or ready, and asks only when none is', async () => {
    state.exportStatus.mockResolvedValue({ export: READY, can_request: true })
    const ready = createExport({ timers: fakeTimers() })
    await ready.start()
    expect(state.requestExport).not.toHaveBeenCalled()
    const save = vi.fn()
    const download = createExport({ timers: fakeTimers(), save })
    await download.load()
    download.download()
    expect(save).toHaveBeenCalledWith(
      '/api/method/doco.docoutils.data_export.download?export=EXP-0007',
    )

    state.exportStatus.mockResolvedValue({ export: null, can_request: true })
    state.requestExport.mockResolvedValue({ export: RUNNING })
    const none = createExport({ timers: fakeTimers() })
    await none.start()
    expect(state.requestExport).toHaveBeenCalledTimes(1)

    state.exportStatus.mockResolvedValue({
      export: null,
      can_request: false,
      refusal: LIMIT,
    })
    const limited = createExport({ timers: fakeTimers() })
    await limited.start()
    expect(state.requestExport).toHaveBeenCalledTimes(1)
  })
})

describe('incident notices', () => {
  // 11 Nov 2026, 13:00 in Mazatlán (UTC−7).
  const NOW = new Date(Date.UTC(2026, 10, 11, 20, 0))

  it('says since when in the site’s clock, whatever the browser’s zone', () => {
    expect(sinceText('2026-11-11T11:58:00-07:00', NOW)).toBe('Since 11:58')
    expect(sinceText('2026-11-11T01:05:00-07:00', NOW)).toBe('Since 1:05')
    expect(sinceText('2026-11-10T23:50:00-07:00', NOW)).toBe(
      'Since 10 de noviembre at 23:50',
    )
    // Cancún is an hour ahead: 14:00 there is still the 11th.
    expect(sinceText('2026-11-11T09:05:00-05:00', NOW)).toBe('Since 9:05')
    expect(sinceText('', NOW)).toBe('')
  })

  it('says how long a fixed one lasted', () => {
    const start = '2026-11-11T11:58:00-07:00'
    expect(lastedText(start, '2026-11-11T12:13:00-07:00')).toBe(
      'It lasted about 15 minutes.',
    )
    expect(lastedText(start, '2026-11-11T13:58:00-07:00')).toBe(
      'It lasted about 2 hours.',
    )
    expect(lastedText(start, '2026-11-11T12:58:20-07:00')).toBe(
      'It lasted about an hour.',
    )
    expect(lastedText(start, start)).toBe('It lasted less than a minute.')
  })

  it('reads only Boat’s title, detail, state and times; a refusal shows nothing', () => {
    const rows = incidentRows(
      {
        ok: true,
        incidents: [
          {
            id: 'a1b2',
            kind: 'outage',
            title: 'Tu sistema no abre',
            detail: 'Tu sistema no abre o no termina de cargar.',
            status: 'open',
            started_at: '2026-11-11T11:58:00-07:00',
            resolved_at: null,
            host: 'cell-9.internal',
            alertname: 'MuelleCellDown',
          },
          {
            id: 'c3d4',
            kind: 'degraded',
            title: 'Tu sistema está lento',
            detail: 'Tu sistema responde más lento de lo normal.',
            status: 'resolved',
            started_at: '2026-11-11T08:00:00-07:00',
            resolved_at: '2026-11-11T08:40:00-07:00',
          },
        ],
      },
      NOW,
    )
    expect(rows).toEqual([
      {
        id: 'a1b2',
        kind: 'outage',
        open: true,
        title: 'Tu sistema no abre',
        when: 'Since 11:58',
        detail:
          'Tu sistema no abre o no termina de cargar. You do not need to do anything; we tell you when it is fixed.',
      },
      {
        id: 'c3d4',
        kind: 'degraded',
        open: false,
        title: 'Tu sistema está lento',
        when: 'Fixed: your system works normally again. It lasted about 40 minutes.',
        detail: '',
      },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/cell-9|MuelleCellDown/)
    expect(
      incidentRows({ ok: false, reason: 'disabled', message: 'x' }),
    ).toEqual([])
    expect(incidentRows(null)).toEqual([])
  })
})

let app, root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () => h(component, { ...props, onAct: (key) => events.push(key) }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  delete window.docoSupport
})
function door(capabilities) {
  const pagos = createPagos({
    read: vi.fn(),
    mutate: vi.fn(),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    invoices: [],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
  }
  pagos.loading.value = false
  pagos.resolvePaymentState(pagos.boot.value.payment_state)
  return pagos
}

describe('Resumen’s blocks', () => {
  it('the outage shows only where Boat offers it, under the plan', async () => {
    state.exportStatus.mockResolvedValue({ export: null, can_request: true })
    state.seam.mockResolvedValue({
      ok: true,
      incidents: [
        {
          id: 'a1b2',
          kind: 'outage',
          title: 'Tu sistema no abre',
          detail: 'Tu sistema no abre o no termina de cargar.',
          status: 'open',
          started_at: '2026-11-11T11:58:00-07:00',
          cell: 'cell-9',
        },
      ],
    })
    mount(CuentaResumen, { door: door() })
    await flush()
    expect(state.seam).not.toHaveBeenCalled()
    expect(root.querySelector('[data-testid="cuenta-fallas"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="cuenta-verdict"]').textContent,
    ).toContain('All in order')
    app.unmount()
    root.remove()

    mount(CuentaResumen, { door: door(['incidents']) })
    await flush()
    expect(state.seam).toHaveBeenCalledWith('my_incidents')
    const block = root.querySelector('[data-testid="cuenta-fallas"]')
    expect(block.textContent).toContain('Tu sistema no abre')
    expect(block.textContent).toContain('Since')
    expect(block.textContent).not.toContain('cell-9')
    // Right after the plan's header, which says no «Todo en orden» over it.
    expect(root.firstElementChild.children[1]).toBe(block)
    expect(root.querySelector('[data-testid="cuenta-verdict"]')).toBeNull()
    app.unmount()
    root.remove()

    // Fixed: «Ya quedó» under a plan that is in order again.
    state.seam.mockResolvedValue({
      ok: true,
      incidents: [
        {
          id: 'a1b2',
          kind: 'outage',
          title: 'Tu sistema no abre',
          status: 'resolved',
          started_at: '2026-11-11T11:58:00-07:00',
          resolved_at: '2026-11-11T12:13:00-07:00',
        },
      ],
    })
    mount(CuentaResumen, { door: door(['incidents']) })
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-fallas"]').textContent,
    ).toContain('Fixed')
    expect(
      root.querySelector('[data-testid="cuenta-verdict"]').textContent,
    ).toContain('All in order')
  })

  it('«Tus reportes a soporte» opens doco’s «Mis reportes» where the shell has it', async () => {
    state.exportStatus.mockResolvedValue({ export: null, can_request: true })
    mount(CuentaResumen, { door: door() })
    await flush()
    expect(root.querySelector('[data-testid="cuenta-reportes"]')).toBeNull()
    app.unmount()
    root.remove()

    const openReports = vi.fn()
    window.docoSupport = { openReports, openHelp: vi.fn() }
    mount(CuentaResumen, { door: door() })
    await flush()
    const row = root.querySelector('[data-testid="cuenta-reportes"]')
    expect(row.textContent).toContain('Your reports to support')
    row.querySelector('button').click()
    expect(openReports).toHaveBeenCalledTimes(1)
  })

  it('«Pedir mis datos» goes to «Preparando…»; the daily limit disables it with its sentence', async () => {
    state.exportStatus.mockResolvedValue({ export: null, can_request: true })
    state.requestExport.mockImplementation(async () => {
      state.exportStatus.mockResolvedValue({
        export: RUNNING,
        can_request: false,
      })
      return { export: RUNNING, already_running: false }
    })
    mount(ExportarDatos)
    await flush()
    const block = root.querySelector('[data-testid="cuenta-datos"]')
    expect(block.dataset.state).toBe('none')
    block.querySelector('[data-testid="cuenta-datos-pedir"]').click()
    await flush()
    expect(state.requestExport).toHaveBeenCalledTimes(1)
    expect(block.dataset.state).toBe('running')
    expect(block.textContent).toContain('Preparing…')
    // One spinner while it is prepared: the button's.
    expect(
      block.querySelectorAll('[data-spinner], .animate-spin'),
    ).toHaveLength(1)
    app.unmount()
    root.remove()

    state.exportStatus.mockResolvedValue({
      export: {
        name: 'EXP-0006',
        failed: true,
        error: 'Se detuvo a la mitad.',
      },
      can_request: false,
      refusal: LIMIT,
    })
    mount(ExportarDatos)
    await flush()
    const limited = root.querySelector('[data-testid="cuenta-datos"]')
    expect(limited.dataset.state).toBe('failed')
    expect(limited.textContent).toContain('Se detuvo a la mitad.')
    const ask = limited.querySelector('[data-testid="cuenta-datos-pedir"]')
    expect(ask.disabled).toBe(true)
    expect(
      limited.querySelector('[data-testid="cuenta-datos-limite"]').textContent,
    ).toContain(LIMIT)
    app.unmount()
    root.remove()

    // A ready copy at the limit: its download, no second ask, no limit line.
    state.exportStatus.mockResolvedValue({
      export: READY,
      can_request: false,
      refusal: LIMIT,
    })
    mount(ExportarDatos)
    await flush()
    const ready = root.querySelector('[data-testid="cuenta-datos"]')
    expect(ready.dataset.state).toBe('ready')
    expect(ready.textContent).toContain('Download (zip)')
    expect(ready.textContent).toContain('2.4 MB')
    expect(ready.querySelector('[data-testid="cuenta-datos-otra"]')).toBeNull()
    expect(
      ready.querySelector('[data-testid="cuenta-datos-limite"]'),
    ).toBeNull()
  })
})
