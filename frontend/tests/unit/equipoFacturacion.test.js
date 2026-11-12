// «Puede ver facturación» on a person in Equipo: the owner's one switch for the
// «Mi Plan» role, with its one-line explanation. It moves on the tap and the
// server follows, its answer said beside it; a refusal puts it back and says why. A switch the owner
// cannot use is off with its sentence beside it; nobody else sees it.
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
      if (method.endsWith('set_billing_access')) {
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
  root.querySelector('[data-testid="equipo-facturacion"] [role="switch"]')
const said = (root) =>
  root.querySelector(
    '[data-testid="equipo-facturacion"] [data-testid="equipo-facturacion-dicho"]',
  )

beforeEach(() => {
  state.calls = []
  state.answer = null
  state.person = {
    user: 'lupita@example.test',
    full_name: 'Lupita Técnica',
    hr: false,
    hr_reason: 'Sin módulo de personal.',
    billing: { on: false, can_change: true, reason: null },
  }
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('Puede ver facturación', () => {
  it('says what it gives and switches the role on the tap', async () => {
    state.answer = {
      message:
        'Lupita Técnica now sees the plan and the invoices, and can pay.',
      billing: { on: true, can_change: true, reason: null },
    }
    const root = await mount()
    const section = root.querySelector('[data-testid="equipo-facturacion"]')
    expect(section.textContent).toContain('Can see billing')
    expect(section.textContent).toContain(
      'Sees the plan and the invoices, and pays; changes nothing else.',
    )
    expect(toggle(root).getAttribute('aria-checked')).toBe('false')
    toggle(root).click()
    await nextTick()
    expect(toggle(root).getAttribute('aria-checked')).toBe('true')
    await settle()
    expect(state.calls.at(-1)).toEqual([
      'doco.erp_experience.equipo.set_billing_access',
      { user: 'lupita@example.test', allow: 1 },
    ])
    // Said beside the switch: on the phone the page's notice is a screen away.
    expect(said(root).textContent).toContain(
      'Lupita Técnica now sees the plan and the invoices, and can pay.',
    )
    expect(said(root).getAttribute('aria-live')).toBe('polite')
  })

  it('a refusal puts the switch back and says why', async () => {
    state.person.billing.on = true
    state.answer = Object.assign(
      new Error(
        'Someone must keep seeing billing: give it to another person first.',
      ),
      {
        messages: [
          'Someone must keep seeing billing: give it to another person first.',
        ],
      },
    )
    const root = await mount()
    toggle(root).click()
    await settle()
    expect(state.calls.at(-1)[1]).toEqual({
      user: 'lupita@example.test',
      allow: 0,
    })
    expect(toggle(root).getAttribute('aria-checked')).toBe('true')
    expect(said(root).getAttribute('role')).toBe('alert')
    expect(said(root).textContent).toContain(
      'Someone must keep seeing billing: give it to another person first.',
    )
  })

  it('a switch the owner cannot use is off with its reason beside it', async () => {
    state.person.billing = {
      on: true,
      can_change: false,
      reason: 'Lupita Técnica runs the system and already sees billing.',
    }
    const root = await mount()
    const button = toggle(root)
    expect(button.disabled).toBe(true)
    const reason = document.getElementById(
      button.getAttribute('aria-describedby'),
    )
    expect(reason.textContent.trim()).toBe(
      'Lupita Técnica runs the system and already sees billing.',
    )
    button.click()
    await settle()
    expect(state.calls.some(([m]) => m.endsWith('set_billing_access'))).toBe(
      false,
    )
  })

  it('without the owner’s switch the section is not there', async () => {
    state.person.billing = null
    const root = await mount()
    expect(root.querySelector('[data-testid="equipo-facturacion"]')).toBeNull()
  })
})
