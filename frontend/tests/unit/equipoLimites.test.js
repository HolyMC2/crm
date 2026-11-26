// «Límites» on a person in Equipo: how far they go on their own (the discount at
// the register), from the apps that enforce them. A tap saves through Equipo,
// the answer is said under the rows, a refusal puts the chip back.
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
      if (method.endsWith('set_limit')) {
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
const ROW = {
  key: 'discount',
  provider: 'posawesome.posawesome.api.person_limits',
  label: 'Descuento que da sin pedir',
  value: 0,
  unit: '%',
  choices: [
    { value: 0, label: 'Como la caja' },
    { value: 10, label: '10 %' },
  ],
  said: 'Sigue el límite de la caja.',
}
const chip = (root, value) =>
  root.querySelector(`[data-testid="equipo-limite-discount-${value}"]`)
const said = (root) =>
  root.querySelector('[data-testid="equipo-limites-dicho"]')

beforeEach(() => {
  state.calls = []
  state.answer = null
  state.person = {
    user: 'jessica@example.test',
    full_name: 'Jessica Cajera',
    hr: false,
    hr_reason: 'Sin módulo de personal.',
    billing: null,
    dinero: null,
    fotos: null,
    limites: { rows: [{ ...ROW }] },
  }
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('Límites', () => {
  it('shows each limit with what it means now', async () => {
    const root = await mount()
    const section = root.querySelector('[data-testid="equipo-limites"]')
    expect(section.textContent).toContain('Descuento que da sin pedir')
    expect(section.textContent).toContain('Sigue el límite de la caja.')
    expect(chip(root, 0).getAttribute('aria-pressed')).toBe('true')
  })

  it('saves a tapped limit through Equipo and says the answer', async () => {
    state.answer = {
      message: 'Guardado. Da hasta 10 % por su cuenta.',
      limites: { rows: [{ ...ROW, value: 10, said: 'Da hasta 10 %.' }] },
    }
    const root = await mount()
    chip(root, 10).click()
    await settle()
    expect(state.calls.at(-1)).toEqual([
      'doco.erp_experience.equipo.set_limit',
      {
        user: 'jessica@example.test',
        provider: 'posawesome.posawesome.api.person_limits',
        key: 'discount',
        value: 10,
      },
    ])
    expect(chip(root, 10).getAttribute('aria-pressed')).toBe('true')
    expect(said(root).textContent).toContain('Da hasta 10 %')
  })

  it('puts the chip back and says why when the server refuses', async () => {
    state.answer = Object.assign(new Error('nope'), {
      messages: ['Solo el dueño pone los límites de una persona.'],
    })
    const root = await mount()
    chip(root, 10).click()
    await settle()
    expect(chip(root, 0).getAttribute('aria-pressed')).toBe('true')
    expect(said(root).getAttribute('role')).toBe('alert')
  })

  it('has no section when no app sets a limit for the person', async () => {
    state.person.limites = null
    const root = await mount()
    expect(root.querySelector('[data-testid="equipo-limites"]')).toBeNull()
  })
})
