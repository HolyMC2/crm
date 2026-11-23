import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: vi.fn(async () => ({ rows: [] })),
}))
import { call } from 'frappe-ui'
import Fidelidad from '@/pages/Fidelidad.vue'
import RewardSheet from '@/components/fidelidad/premios/RewardSheet.vue'
import ChallengeSheet from '@/components/fidelidad/retos/ChallengeSheet.vue'
import {
  afterAction,
  awardedLine,
  blankChallenge,
  challengeDraft,
  challengeLine,
  challengeMissing,
  challengePayload,
  challengePreview,
  endChips,
  redeemedLine,
  rewardDraft,
  rewardLine,
  rewardMissing,
  rewardPayload,
  rewardPreview,
  STATES,
  stateChip,
  whenLine,
} from '@/components/fidelidad/premios/view'

// Fidelidad › «Premios» and «Retos»: the rows say what each costs or asks,
// until when and its state; the sheets send exactly what the owner chose,
// with a request id for a new one; pause, resume, end and show or hide are
// one tap each; a sales user reads them but cannot change them.
const API = 'doco.fidelidad.api'
const PREMIOS = 'doco.fidelidad.premios_api'
const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
  vi.restoreAllMocks()
})
const originalWidth = window.innerWidth
function resize(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}
afterEach(() => resize(originalWidth))
function room(width) {
  class Observer {
    constructor(report) {
      this.report = report
    }
    observe() {
      setTimeout(() =>
        this.report([
          {
            borderBoxSize: [{ inlineSize: width, blockSize: 800 }],
            contentRect: { width, height: 800 },
          },
        ]),
      )
    }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = Observer
  cleanups.push(() => delete window.ResizeObserver)
}
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ')

const CAPS = {
  register: true,
  create_offer: true,
  edit_offer: true,
  issue_coupon: true,
  adjust_points: true,
  edit_groups: true,
  denied: { create_offer: null, issue_coupon: null, adjust_points: null },
}
// one running promotion, so the promotions list (not its empty state) shows
const promo = {
  name: 'Mes Patrio',
  title: 'Mes Patrio',
  state: 'live',
  ending_soon: false,
  ends_in: 10,
  target: { kind: 'item_group', name: 'Fundas', label: 'Fundas' },
  discount: { kind: 'percent', value: 10 },
  min_amount: null,
  valid_from: '2026-10-01',
  valid_upto: '2026-12-09',
  coupon_based: false,
  auto: true,
  coupons: { issued: 0, used: 0 },
}
const board = () => ({
  company: 'Grupo Doco',
  currency: 'MXN',
  offers: [promo],
  counts: { live: 1, scheduled: 0, paused: 0, ended: 0, ending_soon: 0 },
  program: {
    state: 'active',
    members: 3,
    collection_factor: 10,
    conversion_factor: 0.1,
    expiry_days: 365,
  },
  capabilities: CAPS,
})
const reward = (extra = {}) => ({
  name: 'r1',
  title: 'Funda transparente',
  item: 'FUNDA-01',
  item_name: 'Funda transparente iPhone',
  image: null,
  points_cost: 500,
  max_per_customer: 1,
  valid_from: null,
  valid_upto: '2026-11-30',
  enabled: true,
  show_to_customers: true,
  description: '',
  stock_note: '',
  state: 'live',
  ends_in: 8,
  ending_soon: false,
  redeemed: { reserved: 2, used: 5 },
  ...extra,
})
const challenge = (extra = {}) => ({
  name: 'c1',
  title: 'Tu tercera compra',
  kind: 'purchases',
  target: 3,
  min_ticket: null,
  item_group: null,
  valid_from: '2026-11-01',
  valid_upto: null,
  reward_kind: 'coupon',
  reward_offer: 'Cafe gratis',
  reward_offer_title: 'Café gratis',
  reward_points: null,
  reward_text: '',
  coupon_valid_days: 30,
  enabled: false,
  show_to_customers: true,
  description: '',
  state: 'paused',
  ends_in: null,
  ending_soon: false,
  awarded: 4,
  ...extra,
})
const premiosBoard = (extra = {}) => ({
  company: 'Grupo Doco',
  currency: 'MXN',
  ready: true,
  register: true,
  program: { active: true, conversion_factor: 0.1 },
  can_edit: true,
  denied: null,
  rewards: [reward()],
  challenges: [challenge()],
  offers: [{ name: 'Cafe gratis', title: 'Café gratis', valid_upto: null }],
  ...extra,
})

function answer(map) {
  call.mockImplementation(async (method, args) => {
    const key = method.replace(`${API}.`, '').replace(`${PREMIOS}.`, '')
    const value = map[key]
    if (value instanceof Error) throw value
    return typeof value === 'function' ? value(args) : value
  })
}

async function mountApp(component, props = {}, path = '/ventas/fidelidad') {
  const page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/ventas/fidelidad', name: 'Fidelidad', component: page },
      { path: '/productos/precios', name: 'Precios', component: page },
      { path: '/negocio/app-clientes', name: 'AppClientes', component: page },
    ],
  })
  await router.push(path)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(component, props)
  app.config.globalProperties.__ = globalThis.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, router, app }
}

describe('premios view words', () => {
  it('rows say the cost, the product, until when, and what happened', () => {
    expect(rewardLine(reward())).toMatch(
      /500 points · Funda transparente iPhone · Until 30 nov/,
    )
    expect(redeemedLine(reward())).toBe('2 waiting at the register · 5 taken')
    expect(redeemedLine(reward({ redeemed: { reserved: 0, used: 0 } }))).toBe(
      '',
    )
    expect(challengeLine(challenge())).toBe(
      '3 purchases · Café gratis · Paused',
    )
    expect(
      challengeLine(
        challenge({
          kind: 'spend',
          target: 2000,
          reward_kind: 'points',
          reward_points: 50,
          state: 'live',
        }),
      ),
    ).toBe('$2,000 · +50 points · No end date')
    expect(awardedLine(challenge())).toBe('4 customers completed it')
    expect(stateChip(reward({ ending_soon: true }))).toEqual({
      label: 'Ends soon',
      tone: 'warning',
    })
    expect(stateChip(challenge()).label).toBe('Paused')
    expect(whenLine(reward({ state: 'ended' }))).toMatch(/^Ended /)
  })

  it('a reward sends exactly what the owner chose', () => {
    const draft = {
      ...rewardDraft(null),
      item: { name: 'F1', title: 'Funda' },
      points_cost: 250,
    }
    expect(rewardMissing({ ...draft, item: null })).toBe(
      'Choose the product they take.',
    )
    expect(rewardMissing({ ...draft, points_cost: 2.5 })).toMatch(
      /whole number/,
    )
    expect(rewardMissing(draft)).toBe('')
    expect(rewardPayload(draft, 'Grupo Doco')).toEqual({
      company: 'Grupo Doco',
      title: 'Funda',
      item: 'F1',
      points_cost: 250,
      max_per_customer: 0,
      valid_upto: null,
      enabled: true,
      show_to_customers: true,
      description: '',
      stock_note: '',
    })
    // an edit names the row and never moves it to another company
    const edit = rewardPayload(rewardDraft(reward()), 'Otra')
    expect(edit.name).toBe('r1')
    expect(edit.company).toBeUndefined()
    expect(rewardPreview(draft, 'MXN', 0.1)).toBe(
      'Your customers see: Funda for 250 points (worth $25).',
    )
  })

  it('a challenge sends its goal and reward', () => {
    const draft = { ...blankChallenge(new Date(2026, 10, 22)), title: 'Sellos' }
    expect(draft.valid_from).toBe('2026-11-22')
    expect(challengeMissing({ ...draft, title: '' })).toMatch(/name/)
    expect(challengeMissing(draft)).toBe(
      'Choose the coupon promotion they get.',
    )
    expect(
      challengeMissing({ ...draft, target: 2.5, reward_offer: 'X' }),
    ).toMatch(/whole number/)
    const ready = { ...draft, reward_offer: 'Cafe gratis' }
    expect(challengeMissing(ready)).toBe('')
    expect(challengePayload(ready, 'Grupo Doco')).toMatchObject({
      company: 'Grupo Doco',
      title: 'Sellos',
      kind: 'purchases',
      target: 3,
      reward_kind: 'coupon',
      reward_offer: 'Cafe gratis',
      reward_points: 0,
      valid_from: '2026-11-22',
      valid_upto: null,
    })
    const points = challengePayload({
      ...ready,
      reward_kind: 'points',
      reward_points: 100,
    })
    expect(points.reward_offer).toBeNull()
    expect(points.reward_points).toBe(100)
    expect(challengePreview(ready, 'MXN', premiosBoard().offers)).toBe(
      'Your customers see: Sellos. Goal: 3 purchases. Reward: Café gratis.',
    )
    expect(challengeDraft(challenge()).reward_kind).toBe('coupon')
  })

  it('end chips start with «no end» and the actions show before the server answers', () => {
    const chips = endChips(new Date(2026, 10, 22))
    expect(chips[0]).toEqual({ value: '', label: 'No end' })
    expect(chips[1].value).toBe('2026-11-30')
    expect(afterAction(reward(), 'pause').state).toBe('paused')
    expect(afterAction(reward(), 'hide').show_to_customers).toBe(false)
  })
})

describe('Fidelidad «Premios» on a phone', () => {
  beforeEach(() => resize(412))

  it('a «Premios» view lists rewards and challenges once they are read', async () => {
    answer({ get_board: board(), get_premios: premiosBoard() })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=premios',
    )
    const rows = el.querySelector('[data-testid=fidelidad-premios]')
    expect(text(rows)).toContain('Funda transparente')
    expect(text(rows)).toContain('2 waiting at the register')
    expect(text(el.querySelector('[data-testid=fidelidad-retos]'))).toContain(
      'Tu tercera compra',
    )
    expect(text(el)).toContain('Your customers’ app')
    expect(
      call.mock.calls.some(
        ([m, args]) =>
          m === `${PREMIOS}.get_premios` && args.company === 'Grupo Doco',
      ),
    ).toBe(true)
  })

  it('a coupon promotion made from a new challenge brings the challenge back with its answers and that promotion', async () => {
    const offer = { name: 'Diez', title: '10 % off', valid_upto: null }
    let offers = []
    answer({
      get_board: board(),
      get_premios: () => premiosBoard({ challenges: [], offers }),
      create_offer: () => {
        offers = [offer]
        return {
          name: 'Diez',
          title: '10 % off',
          state: 'live',
          coupon_based: true,
        }
      },
    })
    const { router } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=premios',
    )
    // the sheets are async chunks: wait for each to be on screen
    const shown = async (selector) => {
      for (let i = 0; i < 200 && !document.querySelector(selector); i++)
        await flush(1)
      return document.querySelector(selector)
    }
    document.querySelector('[data-testid=fidelidad-nuevo-reto]').click()
    const title = await shown('[data-testid=reto-titulo]')
    title.value = '3 compras en noviembre'
    title.dispatchEvent(new Event('input'))
    document.querySelector('[data-testid=reto-nueva-promo]').click()
    const promo = await shown('[data-testid=fidelidad-promo-sheet]')
    promo.querySelector('[data-testid=promo-target-ticket]').click()
    await flush(2)
    promo.querySelector('[data-testid=promo-hasta-none]').click()
    ;[...promo.querySelectorAll('[role=radio]')]
      .find((radio) => text(radio).includes('With a coupon'))
      .click()
    await flush(2)
    document.querySelector('[data-testid=promo-iniciar]').click()
    await flush(20)
    expect((await shown('[data-testid=reto-titulo]')).value).toBe(
      '3 compras en noviembre',
    )
    expect(
      document
        .querySelector('[data-testid=reto-promocion-Diez]')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    // it stays on «Premios», and no «Regalar cupón» opens over the challenge
    expect(router.currentRoute.value.query.vista).toBe('premios')
    expect(document.querySelector('[data-testid=fidelidad-cupon-sheet]')).toBe(
      null,
    )
  })

  it('without a points program there is no «New reward», and challenges still work', async () => {
    answer({
      get_board: board(),
      get_premios: premiosBoard({ program: { active: false }, rewards: [] }),
    })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=premios',
    )
    expect(el.querySelector('[data-testid=fidelidad-nuevo-premio]')).toBeNull()
    expect(text(el)).toContain('Rewards are paid with points')
    expect(
      el.querySelector('[data-testid=fidelidad-nuevo-reto]'),
    ).not.toBeNull()
  })

  it('a sales user reads them and is told who can change them', async () => {
    answer({
      get_board: board(),
      get_premios: premiosBoard({
        can_edit: false,
        denied: 'A sales manager can change rewards and challenges.',
      }),
    })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=premios',
    )
    expect(el.querySelector('[data-testid=fidelidad-nuevo-premio]')).toBeNull()
    expect(text(el)).toContain(
      'A sales manager can change rewards and challenges.',
    )
  })

  it('a site without the doctypes shows no «Premios» view', async () => {
    answer({
      get_board: board(),
      get_premios: { ready: false, rewards: [], challenges: [] },
    })
    const { el } = await mountApp(Fidelidad)
    expect(text(el.querySelector('[data-ui-segmented]'))).not.toContain(
      'Rewards',
    )
  })
})

describe('Fidelidad views with cards and rewards both on', () => {
  beforeEach(() => resize(412))

  it('five views are one row of chips, not a clipped track, and a chip switches the view', async () => {
    answer({
      get_board: { ...board(), capabilities: { ...CAPS, cards: true } },
      get_premios: premiosBoard(),
    })
    const { el, router } = await mountApp(Fidelidad)
    expect(el.querySelector('[data-ui-segmented]')).toBeNull()
    const row = el.querySelector('[data-testid=fidelidad-vistas]')
    const labels = [...row.querySelectorAll('button[data-chip]')].map(text)
    expect(labels).toEqual([
      'Promotions',
      'Points',
      'Groups',
      'Cards',
      'Rewards',
    ])
    row.querySelector('button[data-chip=premios]').click()
    await flush()
    expect(router.currentRoute.value.query.vista).toBe('premios')
    expect(el.querySelector('[data-testid=fidelidad-premios]')).not.toBeNull()
  })

  it('four views keep the Segmented track', async () => {
    answer({ get_board: board(), get_premios: premiosBoard() })
    const { el } = await mountApp(Fidelidad)
    expect(
      el.querySelectorAll('[data-ui-segmented] [role=radio]'),
    ).toHaveLength(4)
    expect(el.querySelector('[data-testid=fidelidad-vistas]')).toBeNull()
  })
})

describe('Fidelidad «Premios» on desktop', () => {
  beforeEach(() => resize(1400))

  it('the board gets «Rewards» and «Challenges» sections', async () => {
    room(1200)
    answer({
      get_board: board(),
      get_members: [],
      get_groups: { groups: [], price_lists: [] },
      get_premios: premiosBoard(),
    })
    const { el } = await mountApp(Fidelidad)
    expect(el.querySelector('#hoy-fidelidad-premios')).not.toBeNull()
    expect(el.querySelector('#hoy-fidelidad-retos')).not.toBeNull()
    expect(text(el.querySelector('[data-testid=fidelidad-retos]'))).toContain(
      '4 customers completed it',
    )
  })
})

async function mountSheet(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(component, {
    open: true,
    currency: 'MXN',
    company: 'Grupo Doco',
    canEdit: true,
    ...props,
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}

describe('the reward sheet', () => {
  it('a new reward without its product says what is missing and sends nothing', async () => {
    answer({
      save_reward: (args) => ({
        ...reward(),
        name: 'r9',
        title: JSON.parse(args.data).title,
      }),
    })
    await mountSheet(RewardSheet, { reward: null, pointValue: 0.1 })
    const sheet = document.querySelector('[data-testid=premio-sheet]')
    expect(sheet).not.toBeNull()
    document.querySelector('[data-testid=premio-guardar]').click()
    await flush(2)
    expect(
      text(document.querySelector('[data-testid=premio-falta]')).trim(),
    ).toBe('Choose the product they take.')
    expect(call.mock.calls.some(([m]) => m.endsWith('.save_reward'))).toBe(
      false,
    )
  })

  it('an existing reward pauses in one tap and ends after asking once more in place', async () => {
    answer({
      change_reward: (args) => ({
        ...reward(),
        state: args.action === 'pause' ? 'paused' : 'live',
      }),
    })
    await mountSheet(RewardSheet, { reward: reward() })
    expect(
      text(document.querySelector('[data-testid=premio-sheet]')),
    ).toContain('2 waiting at the register')
    document.querySelector('[data-testid=premio-pausar]').click()
    await flush()
    expect(call.mock.calls.at(-1)).toEqual([
      `${PREMIOS}.change_reward`,
      { name: 'r1', action: 'pause' },
    ])
    expect(
      document.querySelector('[data-testid=premio-reanudar]'),
    ).not.toBeNull()
    const end = document.querySelector('[data-testid=premio-terminar]')
    end.click()
    await flush(2)
    expect(text(end).trim()).toBe('Yes, end it')
    expect(call.mock.calls.filter(([, a]) => a?.action === 'end')).toHaveLength(
      0,
    )
    end.click()
    await flush()
    expect(call.mock.calls.at(-1)).toEqual([
      `${PREMIOS}.change_reward`,
      { name: 'r1', action: 'end' },
    ])
  })

  it('a reader without rights sees it but has no Save', async () => {
    await mountSheet(RewardSheet, { reward: reward(), canEdit: false })
    expect(document.querySelector('[data-testid=premio-guardar]')).toBeNull()
    expect(
      text(document.querySelector('[data-testid=premio-sheet]')),
    ).toContain('A sales manager can change rewards.')
  })
})

describe('the challenge sheet', () => {
  it('sends the goal, the window and the coupon promotion with a request id', async () => {
    answer({
      save_challenge: (args) => ({
        ...challenge(),
        ...JSON.parse(args.data),
        name: 'c9',
      }),
    })
    await mountSheet(ChallengeSheet, {
      challenge: null,
      offers: premiosBoard().offers,
    })
    const title = document.querySelector('[data-testid=reto-titulo]')
    title.value = 'Sellos de café'
    title.dispatchEvent(new Event('input'))
    document.querySelector('[data-testid="reto-promocion-Cafe gratis"]').click()
    await flush(2)
    expect(
      text(document.querySelector('[data-testid=reto-preview]')),
    ).toContain('Reward: Café gratis')
    document.querySelector('[data-testid=reto-guardar]').click()
    await flush()
    const [method, args] = call.mock.calls.at(-1)
    expect(method).toBe(`${PREMIOS}.save_challenge`)
    expect(args.request_id).toBeTruthy()
    expect(JSON.parse(args.data)).toMatchObject({
      title: 'Sellos de café',
      kind: 'purchases',
      target: 3,
      reward_kind: 'coupon',
      reward_offer: 'Cafe gratis',
      company: 'Grupo Doco',
    })
  })

  it('without a coupon promotion it offers to create one', async () => {
    const onNew = vi.fn()
    await mountSheet(ChallengeSheet, {
      challenge: null,
      offers: [],
      'onNew-promo': onNew,
    })
    document.querySelector('[data-testid=reto-nueva-promo]').click()
    await flush(1)
    expect(onNew).toHaveBeenCalled()
  })
})

describe('one word for «running» across Fidelidad (es-MX)', () => {
  // A running reward or challenge read «Activo» while a running promotion
  // read «En curso», on the same screen. The rows say the same thing.
  const po = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../crm/locale/es.po',
    ),
    'utf8',
  )
  const entry = (ctx) =>
    po.match(
      new RegExp(`msgctxt "${ctx}"\\nmsgid "Running"\\nmsgstr "([^"]*)"`),
    )?.[1]

  it('rewards and challenges say what promotions say', () => {
    expect(STATES.live.label).toBe('Running')
    expect(entry('AppClientes')).toBeTruthy()
    expect(entry('AppClientes')).toBe(entry('Promotion state'))
  })
})
