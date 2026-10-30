// Record pages on a phone (shell wave F, F12): Equipo persona's cards stay
// inside the screen and the name is never cut to «Br…», Garantía's primary
// says what it does without a document id and shows dates the way the rest
// of the shell does («dom 25 de oct»), and the app bar's back arrow is the
// only «back» (the record pattern: the name owns the bar on every width).
// happy-dom has no layout engine: these pin the rendered DOM that the phase A
// probe (shell-program/evidence/F12/probe-records.mjs) measures on the lab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { formatDay } from '@/utils/contactos'

const state = vi.hoisted(() => ({
  route: null,
  mobile: null,
  person: null,
  claim: null,
  answer: null,
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({ name: '', params: {}, query: {}, fullPath: '/' })
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    beforeEach: vi.fn(),
  }
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
vi.mock('@/composables/useEncuestas', async (importOriginal) => {
  const { ref } = await import('vue')
  return {
    ...(await importOriginal()),
    encuestasBoot: ref({ enabled: true }),
    loadEncuestasBoot: async () => {},
    encuestasApi: async () => state.answer,
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
const describedBy = (button) =>
  document.getElementById(button.getAttribute('aria-describedby'))
const appBarBack = (root) => root.querySelector('[data-appbar-back]')
const LONG_NAME = 'Refacciones Ficticias del Norte SA de C.V. Sucursal Centro'

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
  state.answer = {
    name: 'QA-FB-12273',
    score: 9,
    scale: 10,
    bucket: 'promoter',
    kind: 'sale',
    follow_up_status: 'Open',
    customer_name: 'General',
    sale: 'ACC-SINV-2026-03512',
    company: 'Grupo Doco',
    creation: '2026-10-25 15:51:00',
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

  it('lays the sections in one column no wider than the screen', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const grid = root.querySelector('section h2').closest('.grid')
    // No column template below lg: one implicit track the width of the
    // screen; the desk's main track is minmax(0, 1fr), never a line's width.
    expect([...grid.classList].filter((c) => /^grid-cols/.test(c))).toEqual([])
    expect(grid.className).toContain('lg:grid-cols-[minmax(0,1fr)_22rem]')
  })

  it('wraps a week row instead of cutting the shift hours', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const hours = [...root.querySelectorAll('li span')].find(
      (s) => s.textContent.includes('9:00–18:00') && !s.querySelector('span'),
    )
    expect(hours.textContent.trim()).toBe('Mañana · 9:00–18:00')
    expect(hours.className).not.toMatch(/\btruncate\b|whitespace-nowrap/)
    expect(hours.closest('li').classList).toContain('flex-wrap')
  })

  it('shows the whole name on up to two lines, never «Br…»', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const name = root.querySelector('[data-appbar-title]')
    expect(name.textContent.trim()).toBe('Brandon Leonel Ramírez Castañeda')
    expect(name.className).not.toMatch(/\btruncate\b/)
    expect(name.classList).toContain('line-clamp-2')
  })

  it('offers «Access and puesto» among the hero steps, not beside the name', async () => {
    const root = await mount((await page()).default, {
      employee: 'HR-EMP-00007',
    })
    const access = byText(root, 'Access and puesto')
    expect(access).toBeTruthy()
    // The name keeps the bar's full width; the step wraps with the others.
    expect(access.closest('[data-testid="equipo-next"]')).toBeTruthy()
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
    const detail = describedBy(link)
    expect(detail?.textContent).toContain('Return ACC-SINV-2026-03513')
    // A refund reads as the amount given back, as the server's timeline does.
    const amount = detail.textContent.split(' · ').at(-1)
    expect(amount).toContain('349.00')
    expect(amount).not.toContain('-')
  })

  it('ties each «Link return» to its own return', async () => {
    state.claim.remedies.refund.returns.push({
      doctype: 'Sales Invoice',
      name: 'ACC-SINV-2026-03520',
      total: -120,
      currency: 'MXN',
    })
    const root = await mount((await page()).default, {
      name: 'SER-WRN-2026-00001',
    })
    const links = buttons(root).filter(
      (b) => b.textContent.trim() === 'Link return',
    )
    expect(links.map((b) => describedBy(b)?.textContent.trim())).toEqual([
      expect.stringContaining('ACC-SINV-2026-03513'),
      expect.stringContaining('ACC-SINV-2026-03520'),
    ])
  })

  it('the primary says «Open repair order»; the order id is secondary text', async () => {
    state.claim.repair = { open: 'MAT-RO-2026-00042' }
    const root = await mount((await page()).default, {
      name: 'SER-WRN-2026-00001',
    })
    const open = byText(root, 'Open repair order')
    expect(open.textContent.trim()).toBe('Open repair order')
    expect(describedBy(open)?.textContent.trim()).toBe(
      'Repair order MAT-RO-2026-00042',
    )
  })

  it('shows the complaint and purchase dates as the shell does, never ISO', async () => {
    const lang = window.lang
    window.lang = 'es-MX'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T12:00:00'))
    try {
      const root = await mount((await page()).default, {
        name: 'SER-WRN-2026-00001',
      })
      const text = root.textContent
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(text).toContain(`Grupo Doco · ${formatDay('2026-10-25')}`)
      expect(text).toContain(formatDay('2026-10-13'))
    } finally {
      window.lang = lang
    }
  })
})

describe('customer name on a record (F12 fix round)', () => {
  const pages = {
    Garantia: [
      () => import('@/pages/Garantia.vue'),
      { name: 'SER-WRN-2026-00001' },
      () => (state.claim.customer_name = LONG_NAME),
    ],
    Encuesta: [
      () => import('@/pages/Encuesta.vue'),
      { name: 'QA-FB-12273' },
      () => (state.answer.customer_name = LONG_NAME),
    ],
  }
  for (const [name, [page, props, longName]] of Object.entries(pages)) {
    it(`${name}: a long name wraps to two lines instead of «Refacciones…»`, async () => {
      longName()
      const root = await mount((await page()).default, props)
      const h1 =
        root.querySelector('[data-appbar-title]') || root.querySelector('h1')
      expect(h1.textContent.trim()).toBe(LONG_NAME)
      expect(h1.className).not.toMatch(/\btruncate\b/)
      expect(h1.classList).toContain('line-clamp-2')
      expect(h1.classList).toContain('break-words')
    })
  }
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
    it(`${name}: «${back}» is the bar's arrow on a phone and a computer`, async () => {
      const component = (await page()).default
      for (const mobile of [true, false]) {
        state.mobile.value = mobile
        const root = await mount(component, props)
        expect(byText(root, back)).toBeUndefined()
        expect(appBarBack(root)?.getAttribute('aria-label')).toBe(back)
        app.unmount()
        host.remove()
      }
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

  it('Encuesta opened from another app keeps its way back on a phone', async () => {
    state.route.query = {
      return_to: '/taller/orders/RO-0001',
      return_label: 'Taller',
    }
    const root = await mount((await import('@/pages/Encuesta.vue')).default, {
      name: 'QA-FB-12273',
    })
    expect(appBarBack(root)?.getAttribute('aria-label')).toBe('Back to Taller')
  })
})
