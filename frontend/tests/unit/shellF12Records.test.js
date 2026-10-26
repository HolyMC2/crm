// Record pages on a phone (shell wave F, F12): Equipo persona's cards stay
// inside the screen and the name is never cut to «Br…», Garantía's primary
// says what it does without a document id and shows dates as «25 oct», and
// the app bar's back arrow is the only «back» on a phone.
// happy-dom has no layout engine: these pin the rendered DOM that the phase A
// probe (shell-program/evidence/F12/probe-records.mjs) measures on the lab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  route: null,
  mobile: null,
  person: null,
  claim: null,
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({ name: '', params: {}, query: {}, fullPath: '/' })
  const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  return { useRoute: () => state.route, useRouter: () => router }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.mobile = ref(true)
  return { isMobile: state.mobile }
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
    equipoApi: async () => state.person,
  }
})
vi.mock('@/composables/useGarantias', async (importOriginal) => {
  const { ref } = await import('vue')
  return {
    ...(await importOriginal()),
    garantiasBoot: ref({ enabled: true }),
    loadGarantiasBoot: async () => {},
    garantiasApi: async () => state.claim,
  }
})
vi.mock('@/composables/useEncuestas', async (importOriginal) => ({
  ...(await importOriginal()),
  loadEncuestasBoot: () => new Promise(() => {}),
}))
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
vi.mock('@/components/garantias/AssignDialog.vue', () => stub)
vi.mock('@/components/garantias/NoticeDialog.vue', () => stub)
vi.mock('@/components/garantias/SourceDialog.vue', () => stub)
vi.mock('@/components/compras/ComprasPicker.vue', () => stub)
vi.mock('@/components/pendientes/RecordPendientes.vue', () => stub)

let app
let host
async function mount(component, props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(host)
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r))
  await nextTick()
  return host
}
const buttons = (root) => [...root.querySelectorAll('button')]
const byText = (root, text) =>
  buttons(root).find((b) => b.textContent.trim().includes(text))

beforeEach(async () => {
  await import('vue-router')
  await import('@/composables/breakpoint')
  state.mobile.value = true
  state.route.query = {}
  state.person = {
    full_name: 'Brandon Leonel Ramírez Castañeda',
    designation: 'Tecnico de celulares',
    company: 'Grupo Doco',
    hr: true,
    vacation: null,
    week: [
      {
        date: '2026-10-26',
        label: 'lun 26 oct',
        status: 'turno',
        shift_type: 'Mañana',
        hours: '9:00–18:00',
      },
    ],
    requests: [],
  }
  state.claim = {
    name: 'SER-WRN-2026-00001',
    state: 'Nueva',
    kind: 'Garantía',
    customer_name: 'General',
    item_name: 'Bocina Auricular para IPhone XS',
    company: 'Grupo Doco',
    complaint_date: '2026-10-25',
    complaint: 'La bocina dejó de sonar.',
    can_write: true,
    assignees: [],
    timeline: [],
    repair: { hidden: true },
    transitions: [],
    against: {
      doctype: 'Sales Invoice',
      name: 'ACC-SINV-2026-03512',
      readable: true,
      date: '2026-10-13',
      status: 'Return',
    },
    remedies: {
      refund: {
        available: true,
        returns: [
          {
            doctype: 'Sales Invoice',
            name: 'ACC-SINV-2026-03513',
            total: -349,
            currency: 'MXN',
          },
        ],
      },
    },
  }
})
afterEach(() => {
  vi.useRealTimers()
  app?.unmount()
  host?.remove()
})

describe('Equipo persona on a phone (F12-1, F12-2)', () => {
  const page = () => import('@/pages/EquipoPersona.vue')

  it('lays the cards in one column no wider than the screen', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const grid = root.querySelector('section h2').closest('.grid')
    // grid-cols-1 is repeat(1, minmax(0, 1fr)): the track never grows to a
    // card's widest unwrapped line.
    expect(grid.classList).toContain('grid-cols-1')
  })

  it('wraps a week row instead of cutting the shift hours', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const hours = [...root.querySelectorAll('li span')].find((s) =>
      s.textContent.includes('9:00–18:00'),
    )
    expect(hours.textContent.trim()).toBe('Mañana · 9:00–18:00')
    expect(hours.className).not.toMatch(/\btruncate\b|whitespace-nowrap/)
    expect(hours.closest('li').classList).toContain('flex-wrap')
  })

  it('shows the whole name on up to two lines, never «Br…»', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const name = root.querySelector('h1')
    expect(name.textContent.trim()).toBe('Brandon Leonel Ramírez Castañeda')
    expect(name.className).not.toMatch(/\btruncate\b/)
    expect(name.classList).toContain('line-clamp-2')
  })

  it('moves «Access and puesto» below the name on a phone', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const access = byText(root, 'Access and puesto')
    expect(access).toBeTruthy()
    // Its own row of the wrapping header, so the name keeps the full width.
    expect(access.closest('header > *').classList).toContain('basis-full')
  })
})

describe('Garantía record (F12-3, F12-4)', () => {
  const page = () => import('@/pages/Garantia.vue')

  it('the primary says «Link return»; the return folio is secondary text', async () => {
    const root = await mount((await page()).default, {
      name: 'SER-WRN-2026-00001',
    })
    const link = byText(root, 'Link return')
    expect(link.textContent.trim()).toBe('Link return')
    expect(link.textContent).not.toContain('ACC-SINV')
    const detail = [...root.querySelectorAll('p')].find((p) =>
      p.textContent.includes('ACC-SINV-2026-03513'),
    )
    expect(detail?.textContent).toContain('Return ACC-SINV-2026-03513')
  })

  it('shows the complaint and purchase dates as «25 oct», never ISO', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T12:00:00'))
    const root = await mount((await page()).default, {
      name: 'SER-WRN-2026-00001',
    })
    const text = root.textContent
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).toContain('Grupo Doco · 25 oct')
    expect(text).toContain('13 oct')
  })
})

describe('one back on a phone: the app bar arrow (F12 P2)', () => {
  const pages = {
    EquipoPersona: [
      () => import('@/pages/EquipoPersona.vue'),
      { employee: 'HR-EMP-00007' },
      'Back to Equipo',
    ],
    Garantia: [
      () => import('@/pages/Garantia.vue'),
      { name: 'SER-WRN-2026-00001' },
      'Back to Garantías',
    ],
    Encuesta: [
      () => import('@/pages/Encuesta.vue'),
      { name: 'QA-FB-12273' },
      'Back to Encuestas',
    ],
  }
  for (const [name, [page, props, back]] of Object.entries(pages)) {
    it(`${name}: no «${back}» link on a phone, kept on a computer`, async () => {
      const component = (await page()).default
      expect(byText(await mount(component, props), back)).toBeUndefined()
      app.unmount()
      host.remove()
      state.mobile.value = false
      expect(byText(await mount(component, props), back)).toBeTruthy()
    })
  }

  it('Garantía opened from another app keeps its way back on a phone', async () => {
    state.route.query = {
      return_to: '/taller/orders/RO-0001',
      return_label: 'Taller',
    }
    const root = await mount((await import('@/pages/Garantia.vue')).default, {
      name: 'SER-WRN-2026-00001',
    })
    expect(byText(root, 'Back to Taller')).toBeTruthy()
  })
})
