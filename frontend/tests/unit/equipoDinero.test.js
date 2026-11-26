// «Ve el dinero del negocio» on a person in Equipo: the owner's switch that keeps
// Bancos, Resultados, today's sales and costs from that person, with its one-line
// explanation. It moves on the tap and the server follows, its answer said beside
// it; a refusal puts it back and says why. A switch the owner cannot use is on with
// its sentence beside it; nobody else sees it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  person: null,
  calls: [],
  answer: null,
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ name: '', params: {}, query: {}, fullPath: '/' })
  const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  return { useRoute: () => route, useRouter: () => router }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  const labelled = (tag) => ({
    props: ['label', 'theme', 'variant', 'loading', 'disabled', 'iconLeft'],
    setup: (props) => () => h(tag, props.label),
  })
  return {
    Avatar: { render: () => h('span') },
    Badge: labelled('span'),
    Button: labelled('button'),
    Dialog: { render: () => null },
    FormControl: { render: () => null },
    call: vi.fn(),
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  }
})
vi.mock('@/composables/useEquipo', async (importOriginal) => {
  const { ref } = await import('vue')
  return {
    ...(await importOriginal()),
    equipoBoot: ref({ capabilities: {} }),
    loadEquipoBoot: async () => {},
    equipoApi: async (method, args) => {
      state.calls.push([method, args])
      if (method.endsWith('set_money_access')) {
        if (state.answer instanceof Error) throw state.answer
        return state.answer
      }
      return state.person
    },
  }
})
vi.mock('@/composables/whatsapp', async () => {
  const { ref } = await import('vue')
  return { whatsappMode: ref('off') }
})
vi.mock('@/composables/useHoy', () => ({ hoyLive: () => ({}) }))
vi.mock('@/vendor/muelle-shell/live-sync/vue', () => ({
  useLiveWatch: () => {},
}))
vi.mock('@/composables/shellKeyboard', () => ({
  appleKeys: false,
  registerPageShortcuts: () => {},
  registerPageKeys: () => () => {},
}))
const stub = { default: { render: () => null } }
vi.mock('@/components/compras/ComprasPicker.vue', () => stub)
vi.mock('@/components/pendientes/RecordPendientes.vue', () => stub)

let app
let host
async function mount() {
  const page = (await import('@/pages/EquipoPersona.vue')).default
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(page, { employee: 'HR-EMP-00007' }) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(host)
  await settle()
  return host
}
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r))
  await nextTick()
}
const toggle = (root) =>
  root.querySelector('[data-testid="equipo-dinero"] [role="switch"]')
const said = (root) =>
  root.querySelector(
    '[data-testid="equipo-dinero"] [data-testid="equipo-dinero-dicho"]',
  )

beforeEach(() => {
  state.calls = []
  state.answer = null
  state.person = {
    user: 'jenni@example.test',
    full_name: 'Jenni Encargada',
    hr: false,
    hr_reason: 'Sin módulo de personal.',
    billing: null,
    dinero: { on: true, can_change: true, reason: null },
  }
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('Ve el dinero del negocio', () => {
  it('says what it covers and hides the money on the tap', async () => {
    state.answer = {
      message:
        'Jenni Encargada no longer sees Bancos, Resultados, today’s sales or costs.',
      dinero: { on: false, can_change: true, reason: null },
    }
    const root = await mount()
    const section = root.querySelector('[data-testid="equipo-dinero"]')
    expect(section.textContent).toContain('Sees the money of the business')
    expect(section.textContent).toContain(
      'Bancos, Resultados, the sales of the day and costs. Off, they keep selling, buying and changing prices.',
    )
    expect(toggle(root).getAttribute('aria-checked')).toBe('true')
    toggle(root).click()
    await nextTick()
    expect(toggle(root).getAttribute('aria-checked')).toBe('false')
    await settle()
    expect(state.calls.at(-1)).toEqual([
      'doco.erp_experience.equipo.set_money_access',
      { user: 'jenni@example.test', allow: 0 },
    ])
    expect(said(root).textContent).toContain(
      'Jenni Encargada no longer sees Bancos, Resultados, today’s sales or costs.',
    )
    expect(said(root).getAttribute('aria-live')).toBe('polite')
    // The first test pays the Equipo page's cold import (see equipoFacturacion).
  }, 20000)

  it('a refusal puts the switch back and says why', async () => {
    state.answer = Object.assign(
      new Error('Only the owner decides who sees the business’s money.'),
      {
        messages: ['Only the owner decides who sees the business’s money.'],
      },
    )
    const root = await mount()
    toggle(root).click()
    await settle()
    expect(state.calls.at(-1)[1]).toEqual({
      user: 'jenni@example.test',
      allow: 0,
    })
    expect(toggle(root).getAttribute('aria-checked')).toBe('true')
    expect(said(root).getAttribute('role')).toBe('alert')
    expect(said(root).textContent).toContain(
      'Only the owner decides who sees the business’s money.',
    )
  })

  it('a switch the owner cannot use stays on with its reason beside it', async () => {
    state.person.dinero = {
      on: true,
      can_change: false,
      reason: 'Jenni Encargada runs the system and always sees the money.',
    }
    const root = await mount()
    const button = toggle(root)
    expect(button.disabled).toBe(true)
    const reason = document.getElementById(
      button.getAttribute('aria-describedby'),
    )
    expect(reason.textContent.trim()).toBe(
      'Jenni Encargada runs the system and always sees the money.',
    )
    button.click()
    await settle()
    expect(state.calls.some(([m]) => m.endsWith('set_money_access'))).toBe(
      false,
    )
  })

  it('without the owner’s switch the section is not there', async () => {
    state.person.dinero = null
    const root = await mount()
    expect(root.querySelector('[data-testid="equipo-dinero"]')).toBeNull()
  })
})
