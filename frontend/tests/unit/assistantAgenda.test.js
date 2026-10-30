import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import AssistantAgenda from '@/components/assistant/AssistantAgenda.vue'
import {
  _resetAgenda,
  agenda,
  dueCount,
  fromPicker,
  groupEncargos,
  loadAgenda,
  quickPicks,
  recordTarget,
} from '@/components/assistant/assistantAgenda'

const API = 'doco.docoutils.assistant.shell_api'
// Thursday 2026-10-29, 18:30 at the shop
const NOW = new Date(2026, 9, 29, 18, 30)

const pilas = {
  encargo: 'ENC-0001',
  titulo: '¿Ya llegaron las pilas?',
  estado: 'Programado',
  cuando: '2026-10-30 09:00',
  cuando_es: 'mañana 9:00',
  registro: { doctype: 'CRM Deal', name: 'CRM-DEAL-0042' },
}
const cobros = {
  encargo: 'ENC-0002',
  titulo: 'Revisar los cobros',
  estado: 'Programado',
  cuando: '2026-10-29 17:00',
  cuando_es: 'hoy 17:00',
}
const posts = {
  encargo: 'ENC-0003',
  titulo: 'Posts de la semana',
  estado: 'Esperando',
  cuando: '2026-10-29 10:00',
  repetir: 'Semanal',
}
const corte = {
  encargo: 'ENC-0004',
  titulo: 'Corte de caja',
  estado: 'En curso',
  cuando: '2026-10-29 21:00',
}

let items
function answer(method) {
  if (method === `${API}.encargos`) return Promise.resolve({ items })
  return Promise.resolve({ encargo: 'ENC-0001' })
}
function calls(method) {
  return mocks.call.mock.calls.filter(([m]) => m === method)
}
async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

beforeEach(() => {
  _resetAgenda()
  items = [pilas, cobros, posts, corte]
  mocks.call.mockReset()
  mocks.call.mockImplementation(answer)
})

describe('the grouping', () => {
  it('puts overdue and today in hoy, later in próximos, waiting apart, each by time', () => {
    const groups = groupEncargos(items, NOW)
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.encargo)])).toEqual([
      ['hoy', ['ENC-0002', 'ENC-0004']],
      ['proximos', ['ENC-0001']],
      ['esperando', ['ENC-0003']],
    ])
    expect(dueCount(items, NOW)).toBe(2)
    expect(groupEncargos([], NOW)).toEqual([])
  })

  it('offers +1 h, mañana 9:00 and the next Monday 9:00', () => {
    expect(quickPicks(NOW).map((p) => p.at)).toEqual([
      '2026-10-29 19:30',
      '2026-10-30 09:00',
      '2026-11-02 09:00',
    ])
    // on a Monday, «lunes» is the next one
    expect(quickPicks(new Date(2026, 10, 2, 8, 0))[2].at).toBe(
      '2026-11-09 09:00',
    )
    expect(fromPicker('2026-11-03T16:45')).toBe('2026-11-03 16:45')
  })

  it('opens the record an encargo is about in the shell when it has a screen', () => {
    expect(recordTarget(pilas)).toEqual({
      to: '/deal/CRM-DEAL-0042',
      label: 'CRM-DEAL-0042',
    })
    expect(
      recordTarget({ registro: { doctype: 'Repair Order', name: 'RO-7' } }),
    ).toEqual({ href: '/app/repair-order/RO-7', label: 'RO-7' })
    expect(recordTarget(cobros)).toBe(null)
  })
})

describe('the panel', () => {
  async function mount() {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
    })
    router.push('/')
    await router.isReady()
    const app = createApp({ render: () => h(AssistantAgenda) })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(el)
    await loadAgenda()
    await flush()
    return el
  }

  it('snoozes with a quick pick, marks done, and cancels on the second tap', async () => {
    const el = await mount()
    const row = el.querySelector('[data-encargo="ENC-0001"]')
    expect(row.textContent).toContain('¿Ya llegaron las pilas?')
    expect(row.textContent).toContain('mañana 9:00')
    row.querySelector('[data-testid="encargo-snooze"]').click()
    await flush()
    row.querySelector('[data-pick="manana"]').click()
    await flush()
    const [[, snoozed]] = calls(`${API}.encargo_accion`)
    expect(snoozed).toMatchObject({ encargo: 'ENC-0001', accion: 'posponer' })
    expect(snoozed.hasta).toMatch(/^\d{4}-\d{2}-\d{2} 09:00$/)
    // the list reloads after each action
    expect(calls(`${API}.encargos`)).toHaveLength(2)

    el.querySelector(
      '[data-encargo="ENC-0002"] [data-testid="encargo-done"]',
    ).click()
    await flush()
    expect(calls(`${API}.encargo_accion`)[1][1]).toEqual({
      encargo: 'ENC-0002',
      accion: 'cerrar',
    })

    el.querySelector(
      '[data-encargo="ENC-0004"] [data-testid="encargo-cancel"]',
    ).click()
    await flush()
    expect(calls(`${API}.encargo_accion`)).toHaveLength(2)
    el.querySelector(
      '[data-encargo="ENC-0004"] [data-testid="encargo-cancel-confirm"]',
    ).click()
    await flush()
    expect(calls(`${API}.encargo_accion`)[2][1]).toEqual({
      encargo: 'ENC-0004',
      accion: 'cancelar',
    })
  })

  it('says what to ask for when the agenda is empty', async () => {
    items = []
    const el = await mount()
    expect(
      el.querySelector('[data-testid="assistant-agenda-empty"]'),
    ).not.toBeNull()
  })

  it('goes away on a server without the agenda', async () => {
    mocks.call.mockRejectedValue(new Error('Failed to get method for command'))
    await loadAgenda()
    expect(agenda.available).toBe(false)
    expect(agenda.error).toBe('')
  })
})
