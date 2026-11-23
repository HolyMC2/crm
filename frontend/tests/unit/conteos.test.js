// «Conteos del día» (crm /inventario/conteos): the owner's page over
// scanner_kit's api.conteo.plan_dia. Off it is the proposal with «Encender»;
// on it is each person's day and the same controls. Every tap saves, the
// answer is the whole page, and a refusal puts the control back with the
// server's reason. The page is read in es-MX, from the catalog the shop gets.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePo } from './helpers/spanishCopy.js'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (original) => ({
  ...(await original()),
  call: (...args) => state.call(...args),
}))

import Conteos from '@/pages/Conteos.vue'
import {
  conteosDoor,
  conteosDoorNow,
  forgetConteosDoor,
  noteConteosDoor,
} from '@/components/inventario/conteosDoor'
import {
  createWriter,
  cycleWords,
  decideRows,
  groupChoices,
  personLine,
  progressMarks,
  stepTo,
  toggleDay,
  turnOnArgs,
  typedNumber,
  wire,
} from '@/components/inventario/conteos'
import { documentosPlaces } from '@/documentos/palette'
import { addDays } from '@/components/ui/dateField'

const here = dirname(fileURLToPath(import.meta.url))
const poText = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = parsePo(poText)
const spanish = (message, replace, context) => {
  const text =
    catalog.get(`${context || ''}\u0004${message}`) ||
    catalog.get(`\u0004${message}`) ||
    message
  return text.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}
const english = globalThis.__
beforeAll(() => {
  globalThis.__ = spanish
  window.__ = spanish
})
afterAll(() => {
  globalThis.__ = english
  window.__ = english
})

const API = 'scanner_kit.api.conteo.plan_dia'

const person = (user, name, over = {}) => ({
  user,
  name,
  counts: true,
  proposed: false,
  minutes: 15,
  own_minutes: false,
  quota: null,
  own_quota: false,
  quotas: {},
  warehouses: ['Centro - D'],
  everywhere: false,
  groups_only: [],
  groups_excluded: [],
  paused_until: null,
  today: 'none',
  works_today: true,
  blocked: null,
  size: null,
  ...over,
})
const settings = (over = {}) => ({
  minutes: 15,
  rules: ['negative', 'differences', 'top_sold', 'top_value', 'oldest'],
  differences: 'review',
  cap: null,
  no_cap: true,
  currency: 'MXN',
  skip_weekdays: [5, 6],
  shows_days: true,
  unit: 'minutes',
  products: 30,
  order: 'flagged_first',
  weekend_only: false,
  blind: false,
  proof: 'off',
  high_value: 0,
  sample: false,
  group_rules: [],
  ...over,
})
const GROUPS = [
  { name: 'Pintura', level: 1, parent: null },
  { name: 'Plomería', level: 1, parent: null },
  { name: 'Herramienta', level: 1, parent: null },
  { name: 'Taladros', level: 2, parent: 'Herramienta' },
  { name: 'Eléctrico', level: 1, parent: null },
]
const store = (name, label, over = {}) => ({
  name,
  label,
  products: 1200,
  off: false,
  count: { blind: false, proof: 'off', high_value: 0, own: [], fixed: [] },
  ...over,
})
/** The page off: the proposal for a shop that never chose. */
const off = (over = {}) => ({
  on: false,
  can_edit: true,
  sees_money: true,
  settings: settings(),
  people: [
    person('karla@x.mx', 'Karla Ruiz', {
      proposed: true,
      size: { minutes: 15, products: 12 },
    }),
    person('beto@x.mx', 'Beto Lara', {
      proposed: true,
      size: { minutes: 15, products: 13 },
    }),
    person('dani@x.mx', 'Dani Sol', {
      proposed: true,
      works_today: false,
      size: { minutes: 15, products: 11 },
    }),
    person('lupita@x.mx', 'Lupita Paz', {
      counts: false,
      proposed: true,
      works_today: null,
    }),
  ],
  kpis: {
    coverage_pct: null,
    accuracy_pct: null,
    cycle_months: 3.2,
    cycle_from: 'plan',
    unassigned_products: 0,
  },
  to_decide: 0,
  decide: { ops: 0, revision: 0 },
  groups: GROUPS,
  warehouses: [store('Centro - D', 'Centro')],
  ...over,
})
/** The page on: each person's day. */
const on = (over = {}) => ({
  ...off(),
  on: true,
  people: [
    person('karla@x.mx', 'Karla Ruiz', {
      today: { done: 12, total: 12, ok: 10, diff: 1, skipped: 1 },
      size: { minutes: 15, products: 12 },
    }),
    person('beto@x.mx', 'Beto Lara', {
      today: { done: 5, total: 13, ok: 5, diff: 0, skipped: 0 },
      size: { minutes: 15, products: 13 },
    }),
    person('dani@x.mx', 'Dani Sol', { today: 'rests', works_today: false }),
    person('lupita@x.mx', 'Lupita Paz', {
      counts: false,
      works_today: null,
    }),
  ],
  kpis: {
    coverage_pct: 38.2,
    accuracy_pct: 94,
    cycle_months: 3.2,
    cycle_from: 'counts',
    unassigned_products: 0,
  },
  to_decide: 2,
  decide: { ops: 2, revision: 0 },
  ...over,
})

/** The server as the page meets it: `home` is what it answers now, `refuse` a method's refusal. */
const server = { home: null, refuse: {}, after: {} }
const refused = (sentence, exc_type = 'ValidationError') =>
  Object.assign(new Error(`${API}.save ${exc_type}`), {
    exc_type,
    messages: [sentence],
  })
function serve() {
  state.call.mockImplementation(async (method, args) => {
    const name = method.slice(API.length + 1)
    if (server.refuse[name]) throw server.refuse[name]
    if (name === 'access') return { can_open: true, on: !!server.home?.on }
    if (server.after[name]) server.home = server.after[name](server.home, args)
    return name === 'set_person'
      ? {
          ...server.home,
          person: server.home.people.find((p) => p.user === args.user),
        }
      : server.home
  })
}
const calls = (name) =>
  state.call.mock.calls
    .filter(([method]) => method === `${API}.${name}`)
    .map(([, args]) => args)

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
}
// A stepper sends taps close together as one change.
const settle = async () => {
  await new Promise((done) => setTimeout(done, 400))
  await flush()
}
const setWidth = (value) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value,
  })
  window.dispatchEvent(new Event('resize'))
}

let app
let root
let width
async function open(home, { phone = false } = {}) {
  server.home = home
  setWidth(phone ? 400 : 1280)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/inventario', name: 'Inventario', component: stub },
      { path: '/inventario/conteos', component: Conteos },
    ],
  })
  router.push('/inventario/conteos')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.config.globalProperties.__ = spanish
  app.use(router)
  app.mount(root)
  await flush()
}
const one = (selector) => root.querySelector(selector)
const all = (selector) => [...root.querySelectorAll(selector)]
const row = (user) => one(`[data-persona="${user}"]`)
const chip = (testid) => one(`[data-testid="${testid}"]`)
const pressed = (testid) => chip(testid).getAttribute('aria-pressed')
const segment = (section, label) =>
  all(`${section} [role="radio"]`).find(
    (button) => button.textContent.trim() === label,
  )
const type = async (input, text) => {
  input.value = text
  input.dispatchEvent(new Event('change'))
  await flush()
}

beforeEach(() => {
  width = window.innerWidth
  window.installed_apps = ['frappe', 'crm', 'scanner_kit']
  state.call.mockReset()
  server.refuse = {}
  server.after = {}
  forgetConteosDoor()
  serve()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
  setWidth(width)
  delete window.installed_apps
})

describe('Conteos del día, apagado', () => {
  it('shows the proposal and one «Encender», with no switch', async () => {
    await open(off())
    expect(calls('home')).toHaveLength(1)
    expect(row('karla@x.mx').textContent).toContain('15 min · 12 productos')
    expect(row('beto@x.mx').textContent).toContain('15 min · 13 productos')
    // Someone the proposal counts who does not work today.
    expect(row('dani@x.mx').textContent).toContain('Descansa')
    // Someone who does not count: the name and «+», nothing to open.
    expect(
      row('lupita@x.mx').querySelector('[data-persona-sumar]'),
    ).toBeTruthy()
    expect(row('lupita@x.mx').querySelector('[data-persona-abrir]')).toBeNull()
    expect(one('[data-conteos-vuelta]').textContent).toContain('≈ 3 meses')
    expect(one('[data-conteos-tamano] [data-paso-valor]').value).toBe('15')
    expect(pressed('regla-negative')).toBe('true')
    expect(all('[data-conteos-encender]')).toHaveLength(1)
    expect(one('[data-conteos-encender]').textContent.trim()).toBe('Encender')
    expect(one('[data-conteos-switch]')).toBeNull()
    // Nothing was counted yet: no figures, no queue.
    expect(one('[data-conteos-cifras]')).toBeNull()
    expect(one('[data-conteos-decidir]')).toBeNull()
    // Off, the list is always sized in minutes: no unit to choose.
    expect(all('[data-conteos-tamano] [role="radio"]')).toHaveLength(0)
  })

  it('«Encender» sends what the page shows and repaints from the answer', async () => {
    await open(off())
    server.after.save = () => on()
    one('[data-conteos-encender]').click()
    await flush()
    const [sent] = calls('save')
    expect(sent.on).toBe(1)
    // A shop that never chose has no minutes stored: the proposal is sent.
    expect(sent.minutes).toBe(15)
    expect(JSON.parse(sent.rules)).toHaveLength(5)
    expect(JSON.parse(sent.skip_weekdays)).toEqual([5, 6])
    expect(JSON.parse(sent.people)).toEqual([
      'karla@x.mx',
      'beto@x.mx',
      'dani@x.mx',
    ])
    expect(sent.differences).toBe('review')
    // The answer is the page: on, with its switch and no «Encender».
    expect(one('[data-conteos-encender]')).toBeNull()
    expect(one('[data-conteos-switch]').getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(one('[data-conteos-cifras]').textContent).toContain('38 %')
  })

  it('a refused «Encender» says the server’s reason and stays off', async () => {
    await open(
      off({ people: [person('lupita@x.mx', 'Lupita Paz', { counts: false })] }),
    )
    server.refuse.save = refused('Elige quién cuenta')
    one('[data-conteos-encender]').click()
    await flush()
    expect(one('[data-conteos-error]').textContent).toContain(
      'Elige quién cuenta',
    )
    expect(one('[data-conteos-encender]')).toBeTruthy()
    expect(one('[data-conteos-switch]')).toBeNull()
  })

  it('on a phone the switch is in the bar and «Encender» is the one button', async () => {
    await open(off(), { phone: true })
    expect(one('[data-appbar]')).toBeTruthy()
    expect(all('[data-conteos-encender]')).toHaveLength(1)
    server.after.save = () => on()
    one('[data-conteos-encender]').click()
    await flush()
    expect(one('[data-appbar] [data-conteos-switch]')).toBeTruthy()
    expect(one('[data-conteos-encender]')).toBeNull()
  })

  it('a change made while off saves on the tap, without switching on', async () => {
    await open(off())
    server.after.save = (home, args) => ({
      ...home,
      settings: { ...home.settings, rules: JSON.parse(args.rules) },
      kpis: { ...home.kpis, cycle_months: 4.1 },
    })
    chip('regla-top_value').click()
    await flush()
    const [sent] = calls('save')
    expect(sent.on).toBeUndefined()
    expect(JSON.parse(sent.rules)).toEqual([
      'negative',
      'differences',
      'top_sold',
      'oldest',
    ])
    expect(pressed('regla-top_value')).toBe('false')
    // The whole answer repaints: what the rules buy moved with them.
    expect(one('[data-conteos-vuelta]').textContent).toContain('≈ 4 meses')
  })
})

describe('Conteos del día, encendido', () => {
  it('shows the two figures and each person’s day', async () => {
    await open(on())
    const figures = one('[data-conteos-cifras]').textContent
    expect(figures).toContain('38 %')
    expect(figures).toContain('Contado en 30 días')
    expect(figures).toContain('94 %')
    expect(figures).toContain('Cuadra')
    const karla = row('karla@x.mx')
    expect(karla.querySelector('[data-persona-avance]').textContent).toBe(
      '12 de 12',
    )
    const marks = [...karla.querySelectorAll('[data-marca]')].map(
      (el) => el.dataset.marca,
    )
    expect(marks).toHaveLength(12)
    expect(marks.filter((m) => m === 'ok')).toHaveLength(10)
    expect(marks.slice(-2)).toEqual(['diff', 'skipped'])
    const beto = [...row('beto@x.mx').querySelectorAll('[data-marca]')].map(
      (el) => el.dataset.marca,
    )
    expect(beto.filter((m) => m === 'todo')).toHaveLength(8)
    expect(row('beto@x.mx').textContent).toContain('5 de 13')
    expect(row('dani@x.mx').textContent).toContain('Descansa')
    expect(
      row('lupita@x.mx').querySelector('[data-persona-sumar]'),
    ).toBeTruthy()
  })

  it('says a pause, a day with no list and why a store cannot be counted', async () => {
    await open(
      on({
        people: [
          person('a@x.mx', 'Ana Paz', {
            today: 'paused',
            paused_until: '2026-12-03',
          }),
          person('b@x.mx', 'Beto Lara', { today: 'none' }),
          person('c@x.mx', 'Caro Luz', {
            blocked: 'El conteo está apagado en Bodega - D',
          }),
        ],
      }),
    )
    expect(row('a@x.mx').textContent).toContain('Pausa hasta 3 dic')
    expect(row('b@x.mx').textContent).toContain('Sin lista hoy')
    expect(row('c@x.mx').textContent).toContain(
      'El conteo está apagado en Bodega - D',
    )
  })

  it('«N por decidir» shows only with rows and opens Escáner’s queue, with the way back', async () => {
    await open(on())
    const rows = all('[data-conteos-decidir]')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent.trim()).toBe('2 por decidir')
    const href = new URL(rows[0].getAttribute('href'), 'https://x.mx')
    expect(href.pathname).toBe('/scan/conteo/ops')
    expect(href.searchParams.get('return_to')).toBe('/crm/inventario/conteos')
    app.unmount()
    root.remove()
    await open(on({ to_decide: 0, decide: { ops: 0, revision: 0 } }))
    expect(one('[data-conteos-decidir]')).toBeNull()
  })

  it('two queues are two rows, each named', async () => {
    await open(on({ to_decide: 5, decide: { ops: 2, revision: 3 } }))
    const rows = all('[data-conteos-decidir]')
    expect(rows.map((el) => el.dataset.conteosDecidir)).toEqual([
      'ops',
      'revision',
    ])
    expect(rows[0].textContent).toContain('2 por decidir')
    expect(rows[0].textContent).toContain('Operación')
    expect(rows[1].textContent).toContain('3 por decidir')
    expect(rows[1].textContent).toContain('Revisión')
    expect(rows[1].getAttribute('href')).toContain('/scan/conteo/revision')
  })

  it('the switch in the bar turns the counts off', async () => {
    await open(on())
    server.after.save = () => off()
    one('[data-conteos-switch]').click()
    await flush()
    expect(calls('save')).toEqual([{ on: 0 }])
    expect(one('[data-conteos-switch]')).toBeNull()
    expect(one('[data-conteos-encender]')).toBeTruthy()
  })

  it('has no refresh button, no door to the Desk and no heading per block', async () => {
    await open(on())
    expect(
      one('[class*="lucide-refresh-ccw"], [aria-label*="ctualizar"]'),
    ).toBeNull()
    expect(all('a[href^="/app/"], a[href*="/desk"]')).toHaveLength(0)
    expect(all('main h2, main h3')).toHaveLength(0)
  })
})

describe('A person, in place', () => {
  it('opens in its row and saves the minutes after the taps settle', async () => {
    await open(on())
    const dani = row('dani@x.mx')
    expect(dani.querySelector('[data-persona-ajustes]')).toBeNull()
    dani.querySelector('[data-persona-abrir]').click()
    await flush()
    expect(dani.querySelector('[data-persona-ajustes]')).toBeTruthy()
    expect(dani.querySelector('[data-persona-cuenta]')).toBeTruthy()
    server.after.set_person = (home, args) => ({
      ...home,
      people: home.people.map((p) =>
        p.user === args.user
          ? { ...p, minutes: args.minutes, own_minutes: true }
          : p,
      ),
    })
    const less = dani.querySelector('[data-persona-tamano] [data-paso-menos]')
    less.click()
    less.click()
    await settle()
    // Two taps, one change: 15 → 10 → 5.
    expect(calls('set_person')).toEqual([{ user: 'dani@x.mx', minutes: 5 }])
    expect(
      dani.querySelector('[data-persona-tamano] [data-paso-valor]').value,
    ).toBe('5')
  })

  it('the shop’s own minutes mean «as the shop»', async () => {
    await open(
      on({
        people: [
          person('dani@x.mx', 'Dani Sol', { minutes: 10, own_minutes: true }),
        ],
      }),
    )
    row('dani@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    row('dani@x.mx')
      .querySelector('[data-persona-tamano] [data-paso-mas]')
      .click()
    await settle()
    expect(calls('set_person')).toEqual([{ user: 'dani@x.mx', minutes: 0 }])
  })

  it('a number typed is taken whole, inside the bounds', async () => {
    await open(on())
    row('beto@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    await type(
      row('beto@x.mx').querySelector('[data-persona-tamano] [data-paso-valor]'),
      '12',
    )
    expect(calls('set_person')).toEqual([{ user: 'beto@x.mx', minutes: 12 }])
  })

  it('saves the groups: «Todo» first, a chosen group, and «Todo» again', async () => {
    await open(on())
    const beto = row('beto@x.mx')
    beto.querySelector('[data-persona-abrir]').click()
    await flush()
    const chips = [...beto.querySelectorAll('[data-testid^="solo-"]')].map(
      (el) => el.textContent.trim(),
    )
    // The first level of the shop's groups; a deeper one only once chosen.
    expect(chips).toEqual([
      'Todo',
      'Pintura',
      'Plomería',
      'Herramienta',
      'Eléctrico',
    ])
    expect(pressed('solo-')).toBe('true')
    server.after.set_person = (home, args) => ({
      ...home,
      people: home.people.map((p) =>
        p.user === args.user && args.groups
          ? { ...p, groups_only: JSON.parse(args.groups) }
          : p,
      ),
    })
    chip('solo-Pintura').click()
    await flush()
    expect(JSON.parse(calls('set_person')[0].groups)).toEqual(['Pintura'])
    expect(pressed('solo-Pintura')).toBe('true')
    expect(pressed('solo-')).toBe('false')
    chip('solo-').click()
    await flush()
    expect(JSON.parse(calls('set_person')[1].groups)).toEqual([])
    expect(pressed('solo-')).toBe('true')
  })

  it('a group they never count is a struck chip a tap clears, and one can be left out', async () => {
    await open(
      on({
        people: [
          person('beto@x.mx', 'Beto Lara', {
            groups_only: ['Taladros'],
            groups_excluded: ['Eléctrico'],
          }),
        ],
      }),
    )
    const beto = row('beto@x.mx')
    beto.querySelector('[data-persona-abrir]').click()
    await flush()
    // A deeper group already chosen is on the row, to be seen and undone.
    expect(pressed('solo-Taladros')).toBe('true')
    const struck = beto.querySelector('[data-nunca="Eléctrico"]')
    expect(struck.className).toContain('line-through')
    expect(struck.getAttribute('aria-label')).toBe('Volver a contar Eléctrico')
    // What is left out is not offered as the only thing to count.
    expect(chip('solo-Eléctrico')).toBeNull()
    server.after.set_person = (home, args) => ({
      ...home,
      people: home.people.map((p) => ({
        ...p,
        groups_excluded: JSON.parse(args.excluded),
      })),
    })
    struck.click()
    await flush()
    expect(calls('set_person')[0]).toEqual({
      user: 'beto@x.mx',
      excluded: '[]',
    })
    expect(beto.querySelector('[data-nunca="Eléctrico"]')).toBeNull()
    beto.querySelector('[data-nunca-sumar]').click()
    await flush()
    chip('nunca-Pintura').click()
    await flush()
    expect(JSON.parse(calls('set_person')[1].excluded)).toEqual(['Pintura'])
    expect(calls('set_person')[1].groups).toBeUndefined()
    expect(beto.querySelector('[data-nunca="Pintura"]')).toBeTruthy()
  })

  it('saves a pause and ends it', async () => {
    await open(on())
    const beto = row('beto@x.mx')
    beto.querySelector('[data-persona-abrir]').click()
    await flush()
    expect(beto.querySelector('[data-persona-pausa]').textContent).toContain(
      'Sin pausa',
    )
    beto.querySelector('[data-persona-pausa-abrir]').click()
    await flush()
    server.after.set_person = (home, args) => ({
      ...home,
      people: home.people.map((p) =>
        p.user === args.user
          ? { ...p, paused_until: args.paused_until || null }
          : p,
      ),
    })
    const week = [...beto.querySelectorAll('[data-ui-date-field] button')].find(
      (button) => button.textContent.trim() === 'En una semana',
    )
    week.click()
    await flush()
    expect(calls('set_person')[0]).toEqual({
      user: 'beto@x.mx',
      paused_until: addDays(7),
    })
    expect(
      beto.querySelector('[data-persona-pausa]').textContent,
    ).not.toContain('Sin pausa')
    beto.querySelector('[data-persona-pausa-abrir]').click()
    await flush()
    const remove = [
      ...beto.querySelectorAll('[data-ui-date-field] button'),
    ].find((button) => button.textContent.trim() === 'Quitar')
    remove.click()
    await flush()
    // An empty date ends the pause; it is sent, not left out.
    expect(calls('set_person')[1]).toEqual({
      user: 'beto@x.mx',
      paused_until: '',
    })
  })

  it('«+» puts someone to count, and their switch takes them off', async () => {
    await open(on())
    server.after.set_person = (home, args) => ({
      ...home,
      people: home.people.map((p) =>
        p.user === args.user ? { ...p, counts: !!args.counts } : p,
      ),
    })
    row('lupita@x.mx').querySelector('[data-persona-sumar]').click()
    await flush()
    expect(calls('set_person')[0]).toEqual({ user: 'lupita@x.mx', counts: 1 })
    expect(
      row('lupita@x.mx').querySelector('[data-persona-abrir]'),
    ).toBeTruthy()
    row('lupita@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    row('lupita@x.mx').querySelector('[data-persona-cuenta]').click()
    await flush()
    expect(calls('set_person')[1]).toEqual({ user: 'lupita@x.mx', counts: 0 })
    expect(
      row('lupita@x.mx').querySelector('[data-persona-sumar]'),
    ).toBeTruthy()
  })

  it('store chips show only with more than one store; someone with every store is asked where', async () => {
    await open(on())
    row('beto@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    expect(one('[data-persona-almacenes]')).toBeNull()
    app.unmount()
    root.remove()
    await open(
      on({
        people: [
          person('beto@x.mx', 'Beto Lara'),
          person('lupita@x.mx', 'Lupita Paz', {
            counts: false,
            warehouses: [],
            everywhere: true,
          }),
        ],
        warehouses: [
          store('Centro - D', 'Centro'),
          store('Norte - D', 'Norte'),
          store('Bodega - D', 'Bodega', { off: true }),
        ],
      }),
    )
    row('lupita@x.mx').querySelector('[data-persona-sumar]').click()
    await flush()
    // Nothing is sent until the page knows where.
    expect(calls('set_person')).toEqual([])
    const where = row('lupita@x.mx').querySelector('[data-persona-donde]')
    expect(where.textContent).toContain('¿Dónde cuenta Lupita Paz?')
    // A store with counting off is not offered.
    expect(where.textContent).not.toContain('Bodega')
    const norte = [...where.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Norte',
    )
    norte.click()
    await flush()
    expect(calls('set_person')[0]).toEqual({
      user: 'lupita@x.mx',
      counts: 1,
      warehouses: '["Norte - D"]',
    })
    row('beto@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    const stores = row('beto@x.mx').querySelector('[data-persona-almacenes]')
    expect(stores.textContent).toContain('Centro')
    const add = [...stores.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Norte',
    )
    add.click()
    await flush()
    expect(JSON.parse(calls('set_person')[1].warehouses)).toEqual([
      'Centro - D',
      'Norte - D',
    ])
  })

  it('a refusal puts the control back and says the server’s reason on it', async () => {
    await open(on())
    const beto = row('beto@x.mx')
    beto.querySelector('[data-persona-abrir]').click()
    await flush()
    server.refuse.set_person = refused('Los minutos van de 5 a 60.')
    beto.querySelector('[data-persona-tamano] [data-paso-mas]').click()
    await nextTick()
    // The tap shows at once.
    expect(
      beto.querySelector('[data-persona-tamano] [data-paso-valor]').value,
    ).toBe('20')
    await settle()
    expect(
      beto.querySelector('[data-persona-tamano] [data-paso-valor]').value,
    ).toBe('15')
    expect(beto.querySelector('[role="alert"]').textContent).toContain(
      'Los minutos van de 5 a 60.',
    )
    // «+» refused: the person stays off, with why, on their own row.
    server.refuse.set_person = refused('Lupita Paz no usa Escáner.')
    row('lupita@x.mx').querySelector('[data-persona-sumar]').click()
    await flush()
    expect(
      row('lupita@x.mx').querySelector('[data-persona-sumar]'),
    ).toBeTruthy()
    expect(
      row('lupita@x.mx').querySelector('[data-persona-error]').textContent,
    ).toContain('Lupita Paz no usa Escáner.')
  })
})

describe('The plan, in place', () => {
  it('the size saves in minutes and shows what it buys', async () => {
    await open(on())
    server.after.save = (home, args) => ({
      ...home,
      settings: { ...home.settings, minutes: args.minutes },
      kpis: { ...home.kpis, cycle_months: 2.4 },
    })
    one('[data-conteos-tamano] [data-paso-mas]').click()
    await settle()
    expect(calls('save')).toEqual([{ minutes: 20 }])
    expect(one('[data-conteos-vuelta]').textContent).toContain('≈ 2 meses')
  })

  it('stock on nobody’s list is said in place of the figure', async () => {
    await open(
      on({
        kpis: {
          coverage_pct: 10,
          accuracy_pct: null,
          cycle_months: null,
          cycle_from: null,
          unassigned_products: 312,
        },
      }),
    )
    expect(one('[data-conteos-vuelta]')).toBeNull()
    const said = one('[data-conteos-sin-nadie]').textContent
    expect(said).toContain('Sin quien los cuente')
    expect(said).toContain('312 productos')
    // Nothing measured yet reads as a dash, never as 0 %.
    expect(one('[data-conteos-cifras]').textContent).toContain('—')
  })

  it('sized in products: the quota, one order of four, and the weekend as one', async () => {
    await open(
      on({
        settings: settings({
          minutes: 0,
          unit: 'products',
          products: 30,
          weekend_only: true,
        }),
        people: [
          person('beto@x.mx', 'Beto Lara', {
            minutes: 0,
            quota: 30,
            warehouses: ['Centro - D', 'Norte - D'],
            quotas: { 'Centro - D': 20 },
          }),
        ],
        warehouses: [
          store('Centro - D', 'Centro'),
          store('Norte - D', 'Norte'),
        ],
      }),
    )
    expect(
      segment('[data-conteos-tamano]', 'Productos').getAttribute(
        'aria-checked',
      ),
    ).toBe('true')
    expect(one('[data-conteos-tamano] [data-paso-valor]').value).toBe('30')
    one('[data-conteos-tamano] [data-paso-menos]').click()
    await settle()
    expect(calls('save')[0]).toEqual({ products: 25 })
    // One of four leads: a tap picks it, a second tap on it changes nothing.
    expect(all('[data-testid^="orden-"]')).toHaveLength(4)
    chip('orden-flagged_first').click()
    chip('orden-high_value').click()
    await flush()
    expect(calls('save').slice(1)).toEqual([{ order: 'high_value' }])
    // Sábado rests, so domingo goes with it.
    chip('dia-5').click()
    await flush()
    expect(JSON.parse(calls('save')[2].skip_weekdays)).toEqual([])
    // Their own number, and how many of it from each store.
    row('beto@x.mx').querySelector('[data-persona-abrir]').click()
    await flush()
    const steppers = row('beto@x.mx').querySelectorAll('[data-paso-valor]')
    expect([...steppers].map((input) => input.value)).toEqual(['30', '20', ''])
    expect(steppers[2].getAttribute('placeholder')).toBe('Parejo')
    await type(steppers[2], '8')
    expect(calls('set_person')[0]).toEqual({
      user: 'beto@x.mx',
      quotas: '{"Norte - D":8}',
    })
    // «Minutos» moves the shop to lists sized in minutes, at the proposal.
    segment('[data-conteos-tamano]', 'Minutos').click()
    await flush()
    expect(calls('save')[3]).toEqual({ minutes: 15 })
  })

  it('a rest day refused goes back with the reason', async () => {
    await open(on())
    expect(pressed('dia-0')).toBe('true')
    expect(pressed('dia-5')).toBe('false')
    server.refuse.save = refused('Alguien tiene que contar algún día.')
    chip('dia-0').click()
    await flush()
    expect(JSON.parse(calls('save')[0].skip_weekdays)).toEqual([0, 5, 6])
    expect(pressed('dia-0')).toBe('true')
    expect(one('[data-conteos-dias] [role="alert"]').textContent).toContain(
      'Alguien tiene que contar algún día.',
    )
  })

  it('the day chips show only while the shop’s days decide for someone', async () => {
    await open(on({ settings: settings({ shows_days: false }) }))
    expect(one('[data-conteos-dias]')).toBeNull()
  })

  it('«Recuenta otra persona» asks for its ceiling first and saves both together', async () => {
    await open(on())
    expect(
      segment('[data-conteos-diferencias]', 'Lo reviso yo').getAttribute(
        'aria-checked',
      ),
    ).toBe('true')
    expect(one('[data-conteos-tope]')).toBeNull()
    segment('[data-conteos-diferencias]', 'Recuenta otra persona').click()
    await flush()
    // Nothing is saved without a ceiling: Muelle never adjusts without one.
    expect(calls('save')).toEqual([])
    const cap = one('[data-conteos-tope] input')
    expect(cap).toBeTruthy()
    server.after.save = (home, args) => ({
      ...home,
      settings: {
        ...home.settings,
        differences: args.differences,
        cap: args.cap,
        no_cap: false,
      },
    })
    await type(cap, '1000')
    expect(calls('save')).toEqual([{ differences: 'recount', cap: 1000 }])
    expect(
      segment(
        '[data-conteos-diferencias]',
        'Recuenta otra persona',
      ).getAttribute('aria-checked'),
    ).toBe('true')
    expect(one('[data-conteos-tope] input').value).toBe('1,000')
  })

  it('the guard of «Recuenta otra persona» puts it back with the server’s reason', async () => {
    await open(on({ settings: settings({ cap: 500, no_cap: false }) }))
    server.refuse.save = refused(
      'Hace falta otra persona que cuente en Centro - D',
    )
    segment('[data-conteos-diferencias]', 'Recuenta otra persona').click()
    await flush()
    expect(calls('save')).toEqual([{ differences: 'recount' }])
    expect(
      segment('[data-conteos-diferencias]', 'Lo reviso yo').getAttribute(
        'aria-checked',
      ),
    ).toBe('true')
    expect(one('[data-conteos-diferencias-error]').textContent).toContain(
      'Hace falta otra persona que cuente en Centro - D',
    )
  })

  it('a ceiling left empty leaves the choice as it was', async () => {
    await open(on())
    segment('[data-conteos-diferencias]', 'Recuenta otra persona').click()
    await flush()
    one('[data-conteos-tope] input').dispatchEvent(new Event('blur'))
    await flush()
    expect(calls('save')).toEqual([])
    expect(one('[data-conteos-tope]')).toBeNull()
    expect(
      segment('[data-conteos-diferencias]', 'Lo reviso yo').getAttribute(
        'aria-checked',
      ),
    ).toBe('true')
  })

  it('how it is counted: blind, the sample, the photo and the high value', async () => {
    await open(on())
    one('[data-como-ciegas]').click()
    one('[data-como-muestra]').click()
    chip('foto-hv_only').click()
    await type(one('[data-como-alto] input'), '2,500')
    expect(calls('save')).toEqual([
      { blind: 1 },
      { sample: 1 },
      { proof: 'hv_only' },
      { high_value: 2500 },
    ])
  })

  it('a store counts its own way, or as the shop again', async () => {
    await open(
      on({
        warehouses: [
          store('Centro - D', 'Centro'),
          store('Norte - D', 'Norte', {
            count: {
              blind: true,
              proof: 'off',
              high_value: 0,
              own: ['blind'],
              fixed: ['proof'],
            },
          }),
        ],
      }),
    )
    expect(one('[data-como-almacen-ajustes]')).toBeNull()
    one('[data-como-almacen="Norte - D"]').click()
    await flush()
    const panel = one('[data-como-almacen-ajustes]')
    expect(pressed('almacen-blind-yes')).toBe('true')
    // What the tenant's own settings decide is read, not offered.
    expect(panel.querySelector('[data-testid^="almacen-proof-"]')).toBeNull()
    expect(panel.textContent).toContain('Nunca')
    chip('almacen-blind-').click()
    await flush()
    expect(calls('set_warehouse')[0]).toEqual({
      warehouse: 'Norte - D',
      inherit: '["blind"]',
    })
    chip('almacen-blind-no').click()
    await flush()
    expect(calls('set_warehouse')[1]).toEqual({
      warehouse: 'Norte - D',
      blind: 0,
    })
  })

  it('a product group of the shop takes one of three treatments, or none', async () => {
    await open(
      on({
        settings: settings({
          group_rules: [
            { group: 'Pintura', treatment: 'often', spot_check: 0 },
          ],
        }),
      }),
    )
    const chips = all('[data-grupo]')
    // What the shop decided leads, with its treatment on the chip.
    expect(chips[0].dataset.grupo).toBe('Pintura')
    expect(chips[0].textContent).toContain('Más seguido')
    one('[data-grupo="Plomería"]').click()
    await flush()
    server.after.set_group = (home, args) => ({
      ...home,
      settings: {
        ...home.settings,
        group_rules: [
          ...home.settings.group_rules.filter((r) => r.group !== args.group),
          ...(args.treatment
            ? [{ group: args.group, treatment: args.treatment, spot_check: 0 }]
            : []),
        ],
      },
    })
    chip('trato-never').click()
    await flush()
    expect(calls('set_group')[0]).toEqual({
      group: 'Plomería',
      treatment: 'never',
    })
    expect(one('[data-grupo="Plomería"]').textContent).toContain('No se cuenta')
    // A second tap on the chosen one is the rotation again.
    chip('trato-never').click()
    await flush()
    expect(calls('set_group')[1]).toEqual({ group: 'Plomería', treatment: '' })
  })
})

describe('Who sees what', () => {
  it('kept from the shop’s money: no ceiling, no high value, differences read-only', async () => {
    await open(
      on({
        sees_money: false,
        settings: settings({
          differences: 'recount',
          cap: null,
          no_cap: null,
          currency: null,
          high_value: null,
        }),
      }),
    )
    const block = one('[data-conteos-diferencias]')
    expect(
      block.querySelector('[data-conteos-diferencias-fijo]').textContent.trim(),
    ).toBe('Recuenta otra persona')
    expect(block.querySelector('[role="radio"]')).toBeNull()
    expect(one('[data-conteos-tope]')).toBeNull()
    expect(one('[data-como-alto]')).toBeNull()
    expect(all('[data-conteo-monto]')).toHaveLength(0)
    expect(root.textContent).not.toContain('$')
    // «Encender» from them never sends the differences.
    expect(turnOnArgs(off({ sees_money: false }))).not.toHaveProperty(
      'differences',
    )
  })

  it('who does not run every store reads the plan and still sets their people', async () => {
    await open(on({ can_edit: false }))
    expect(one('[data-conteos-candado]').textContent).toContain(
      'Lo cambia quien lleva todos los almacenes',
    )
    expect(one('[data-conteos-plan]').hasAttribute('inert')).toBe(true)
    expect(one('[data-conteos-switch]').disabled).toBe(true)
    expect(row('beto@x.mx').querySelector('[data-persona-abrir]')).toBeTruthy()
    app.unmount()
    root.remove()
    await open(off({ can_edit: false }))
    expect(one('[data-conteos-encender]')).toBeNull()
  })

  it('a refused page says the server’s reason; a failed read offers to try again', async () => {
    server.refuse.home = refused(
      'Solo quien administra el conteo de un almacén puede hacer esto.',
      'PermissionError',
    )
    await open(off())
    expect(root.textContent).toContain('No puedes abrir los conteos del día')
    expect(root.textContent).toContain(
      'Solo quien administra el conteo de un almacén puede hacer esto.',
    )
    expect(one('[data-conteos-personas]')).toBeNull()
    app.unmount()
    root.remove()
    server.refuse.home = Object.assign(new TypeError('Failed to fetch'), {
      messages: [],
    })
    await open(off())
    const failure = one('[data-conteos-falla]')
    expect(failure.textContent).toContain('No se pudieron abrir los conteos.')
    server.refuse = {}
    failure.querySelector('button').click()
    await flush()
    expect(one('[data-conteos-personas]')).toBeTruthy()
  })
})

describe('The door', () => {
  const boot = {
    modules: {
      inventario: { enabled: true, capabilities: { doctypes: [] } },
    },
  }
  const place = () =>
    documentosPlaces(boot).find((item) => item.id === 'inventario.conteos')

  it('the palette lists the page only for who may open it', async () => {
    state.call.mockImplementation(async () => ({ can_open: false, on: false }))
    expect(place()).toBeUndefined()
    await flush()
    expect(place()).toBeUndefined()
    forgetConteosDoor()
    state.call.mockImplementation(async () => ({ can_open: true, on: false }))
    // Asked once; the next keystroke has the answer.
    expect(place()).toBeUndefined()
    await flush()
    expect(place()).toMatchObject({
      title: 'Inventario › Conteos del día',
      href: '/inventario/conteos',
    })
    expect(
      state.call.mock.calls.filter(([method]) => method === `${API}.access`),
    ).toHaveLength(2)
  })

  it('a refusal is a shut door, and a site without Escáner is never asked', async () => {
    state.call.mockImplementation(async () => {
      throw new Error('refused')
    })
    expect(await conteosDoor()).toEqual({ can_open: false, on: false })
    expect(conteosDoorNow().can_open).toBe(false)
    forgetConteosDoor()
    state.call.mockReset()
    window.installed_apps = ['frappe', 'crm']
    expect(await conteosDoor()).toEqual({ can_open: false, on: false })
    expect(place()).toBeUndefined()
    expect(state.call).not.toHaveBeenCalled()
  })

  it('the page tells the door what it read', async () => {
    await open(on())
    expect(conteosDoorNow()).toEqual({ can_open: true, on: true })
    noteConteosDoor({ can_open: true, on: false })
    expect(conteosDoorNow().on).toBe(false)
  })

  it('the route is declared before the document lists of Inventario', async () => {
    const { default: router } = await import('@/router')
    const resolved = router.resolve('/inventario/conteos')
    expect(resolved.name).toBe('InventarioConteos')
    expect(resolved.meta.listParent).toBe('Inventario')
  })
})

describe('The rules of the page', () => {
  it('what the minutes buy, in words', () => {
    expect(cycleWords(null)).toBe('')
    expect(cycleWords(0)).toBe('Menos de una semana')
    expect(cycleWords(0.25)).toBe('≈ 1 semana')
    expect(cycleWords(0.5)).toBe('≈ 2 semanas')
    expect(cycleWords(1)).toBe('≈ 1 mes')
    expect(cycleWords(3.2)).toBe('≈ 3 meses')
    expect(cycleWords(7.6)).toBe('≈ 8 meses')
    expect(cycleWords(30)).toBe('≈ 2.5 años')
  })

  it('a long list still reads as a bar, and every state keeps a mark', () => {
    expect(progressMarks('rests')).toEqual([])
    expect(progressMarks({ total: 0 })).toEqual([])
    const marks = progressMarks({
      done: 61,
      total: 120,
      ok: 58,
      diff: 2,
      skipped: 1,
    })
    expect(marks).toHaveLength(24)
    expect(marks.filter((m) => m === 'diff')).toHaveLength(1)
    expect(marks.filter((m) => m === 'skipped')).toHaveLength(1)
    expect(marks.indexOf('todo')).toBeGreaterThan(marks.lastIndexOf('ok'))
  })

  it('a stepper goes to the next round stop, inside its bounds', () => {
    const minutes = { min: 5, max: 60, step: 5 }
    expect(stepTo(15, 1, minutes)).toBe(20)
    expect(stepTo(12, 1, minutes)).toBe(15)
    expect(stepTo(12, -1, minutes)).toBe(10)
    expect(stepTo(5, -1, minutes)).toBe(5)
    expect(stepTo(60, 1, minutes)).toBe(60)
    expect(stepTo(1, 1, { min: 1, max: 200, step: 5 })).toBe(5)
    expect(typedNumber('', minutes)).toBeNull()
    expect(typedNumber('90', minutes)).toBe(60)
    expect(typedNumber('1', minutes)).toBe(5)
  })

  it('a day chip toggles one day, and the weekend as one when sized in products', () => {
    expect(toggleDay([5, 6], 0)).toEqual([0, 5, 6])
    expect(toggleDay([5, 6], 6)).toEqual([5])
    expect(toggleDay([5, 6], 6, { weekendOnly: true })).toEqual([])
    expect(toggleDay([], 5, { weekendOnly: true })).toEqual([5, 6])
  })

  it('lists and objects travel as JSON, a switch as 1 or 0, and nothing unsent', () => {
    expect(
      wire({
        on: true,
        blind: false,
        rules: [],
        quotas: { a: 1 },
        cap: undefined,
        paused_until: '',
      }),
    ).toEqual({
      on: 1,
      blind: 0,
      rules: '[]',
      quotas: '{"a":1}',
      paused_until: '',
    })
  })

  it('the groups a row offers: the first level, and whatever was already chosen', () => {
    expect(groupChoices(GROUPS)).toEqual([
      'Pintura',
      'Plomería',
      'Herramienta',
      'Eléctrico',
    ])
    expect(groupChoices(GROUPS, ['Taladros', 'Ya no existe'])).toEqual([
      'Pintura',
      'Plomería',
      'Herramienta',
      'Taladros',
      'Eléctrico',
      'Ya no existe',
    ])
  })

  it('a person’s line: off they read the list they would get', () => {
    const karla = person('k', 'Karla', { size: { minutes: 15, products: 1 } })
    expect(personLine(karla, { on: false }).text).toBe('15 min · 1 producto')
    expect(personLine({ ...karla, counts: false }, { on: true }).kind).toBe(
      'off',
    )
    expect(decideRows({ ops: 0, revision: 0 })).toEqual([])
  })

  it('the newest answer is the page; an older refusal never undoes a newer tap', async () => {
    const page = ref({ n: 0 })
    const errors = reactive({})
    const busy = ref(0)
    const writer = createWriter({ page, errors, busy })
    writer.settle({ n: 0 })
    let failFirst
    const first = writer.write(
      'a',
      (p) => (p.n = 1),
      () => new Promise((_, reject) => (failFirst = reject)),
    )
    const second = writer.write(
      'b',
      (p) => (p.n = 2),
      async () => ({ n: 2 }),
    )
    expect(page.value.n).toBe(2)
    expect(busy.value).toBe(2)
    // The calls go one after another: the first is on its way, the second waits.
    await Promise.resolve()
    failFirst(refused('No se pudo'))
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(errors.a).toBe('No se pudo')
    expect(page.value).toEqual({ n: 2 })
    expect(busy.value).toBe(0)
    // A refusal with nothing newer goes back to what the server last said.
    expect(
      await writer.write(
        'c',
        (p) => (p.n = 9),
        async () => {
          throw refused('Tampoco')
        },
      ),
    ).toBe(false)
    expect(page.value).toEqual({ n: 2 })
    expect(errors.c).toBe('Tampoco')
  })
})

describe('Conteos speaks Spanish', () => {
  it('has a Conteos entry for every string it shows', () => {
    const FILES = [
      'pages/Conteos.vue',
      'components/inventario/ConteoPersona.vue',
      'components/inventario/ConteoComo.vue',
      'components/inventario/ConteoGrupos.vue',
      'components/inventario/ConteoPaso.vue',
      'components/inventario/ConteoMonto.vue',
      'components/inventario/conteos.js',
    ]
    const strings = new Set()
    for (const file of FILES) {
      const source = readFileSync(resolve(here, '../../src', file), 'utf8')
      for (const m of source.matchAll(
        /(?<![\w$.])(?:__|tr)\(\s*'((?:[^'\\]|\\.)*)'/g,
      ))
        strings.add(m[1].replace(/\\'/g, "'"))
    }
    expect(strings.size).toBeGreaterThan(80)
    const missing = [...strings].filter(
      (msgid) => !catalog.get(`Conteos\u0004${msgid}`),
    )
    expect(missing).toEqual([])
    // And no entry is left behind by a string the page stopped saying.
    const stale = [...catalog.keys()]
      .filter((key) => key.startsWith('Conteos\u0004'))
      .map((key) => key.split('\u0004')[1])
      .filter((msgid) => !strings.has(msgid))
    expect(stale).toEqual([])
  })
})
