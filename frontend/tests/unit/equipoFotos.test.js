// «Toma fotos de productos» on a person in Equipo: the owner's switch that lets
// that person add and change product photos without editing products, with its
// one-line explanation. It moves on the tap and the server follows, its answer said beside
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
      if (method.endsWith('set_photo_access')) {
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
  root.querySelector('[data-testid="equipo-fotos"] [role="switch"]')
const said = (root) =>
  root.querySelector(
    '[data-testid="equipo-fotos"] [data-testid="equipo-fotos-dicho"]',
  )

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
    fotos: { on: false, can_change: true, reason: null },
  }
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('Toma fotos de productos', () => {
  it('says what it opens and turns photos on at the tap', async () => {
    state.answer = {
      message:
        'Jessica Cajera can add and change product photos now, without editing the products.',
      fotos: { on: true, can_change: true, reason: null },
    }
    const root = await mount()
    const section = root.querySelector('[data-testid="equipo-fotos"]')
    expect(section.textContent).toContain('Takes product photos')
    expect(section.textContent).toContain(
      'Adds and changes the photos of products, without editing the products or their prices.',
    )
    expect(toggle(root).getAttribute('aria-checked')).toBe('false')
    toggle(root).click()
    await nextTick()
    expect(toggle(root).getAttribute('aria-checked')).toBe('true')
    await settle()
    expect(state.calls.at(-1)).toEqual([
      'doco.erp_experience.equipo.set_photo_access',
      { user: 'jessica@example.test', allow: 1 },
    ])
    expect(said(root).textContent).toContain(
      'Jessica Cajera can add and change product photos now, without editing the products.',
    )
    expect(said(root).getAttribute('aria-live')).toBe('polite')
    // The first test pays the Equipo page's cold import (see equipoFacturacion).
  }, 20000)

  it('a refusal puts the switch back and says why', async () => {
    state.answer = Object.assign(
      new Error('Only the owner decides who takes product photos.'),
      { messages: ['Only the owner decides who takes product photos.'] },
    )
    const root = await mount()
    toggle(root).click()
    await settle()
    expect(toggle(root).getAttribute('aria-checked')).toBe('false')
    expect(said(root).getAttribute('role')).toBe('alert')
    expect(said(root).textContent).toContain(
      'Only the owner decides who takes product photos.',
    )
  })

  it('someone who already edits products has it on and locked', async () => {
    state.person.fotos = {
      on: true,
      can_change: false,
      reason: 'Jessica Cajera already edits products, photos included.',
    }
    const root = await mount()
    const button = toggle(root)
    expect(button.disabled).toBe(true)
    button.click()
    await settle()
    expect(state.calls.some(([m]) => m.endsWith('set_photo_access'))).toBe(
      false,
    )
  })

  it('without the owner’s switch the section is not there', async () => {
    state.person.fotos = null
    const root = await mount()
    expect(root.querySelector('[data-testid="equipo-fotos"]')).toBeNull()
  })
})
