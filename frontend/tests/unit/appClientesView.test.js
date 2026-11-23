// «App de tus clientes» (components/appClientes/view.js): what the owner reads
// of the cell's state — the groups and their rows, why a switch is off and
// where it is fixed, the params in words, the preview, the figures — and what
// each tap sends.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CTX,
  MASTER,
  arcoProblem,
  arcoRule,
  changeFor,
  customerLink,
  doorView,
  fixLink,
  kpiBlock,
  kpiTiles,
  legalDirty,
  legalDraft,
  legalFields,
  legalPayload,
  legalProblem,
  masterView,
  ONLINE_COUPONS_ROUTE,
  onlineCouponsNote,
  pagesTakenLine,
  paramChanges,
  paramDraft,
  paramProblem,
  paramValueText,
  paramsChange,
  paramsLine,
  previewTabs,
  previewView,
  profileLabel,
  profileScopes,
  sectionGroups,
  tapOutcome,
} from '@/components/appClientes/view'

// The page's words with their context, so a test sees which string it got.
const seen = []
beforeEach(() => {
  seen.length = 0
  globalThis.__ = (text, args, context) => {
    seen.push([text, context])
    return String(text).replace(/\{(\d+)\}/g, (m, i) => args?.[i] ?? m)
  }
})

const section = (key, extra = {}) => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  help: `Ayuda de ${key}`,
  on: false,
  available: true,
  blocked: null,
  params: [],
  ...extra,
})

const RECARGAS_PARAMS = [
  {
    key: 'modo',
    label: 'Modo',
    type: 'select',
    value: 'info',
    options: [
      { value: 'info', label: 'Solo ver' },
      { value: 'buy', label: 'Comprar en la app' },
    ],
  },
  {
    key: 'metodos',
    label: 'Cómo pagan',
    type: 'multiselect',
    value: ['spei'],
    options: [
      { value: 'spei', label: 'SPEI' },
      { value: 'card', label: 'Tarjeta' },
    ],
  },
  { key: 'max_monto', label: 'Máximo', type: 'money', value: 500, min: 10 },
  { key: 'max_diario_num', label: 'Al día', type: 'int', value: 3, max: 20 },
]

const STATE = () => ({
  profile: 'Tienda Centro',
  profiles: [{ name: 'Tienda Centro', label: 'Centro' }],
  can_change: true,
  login: { channels: ['email', 'whatsapp'], ok: true, fix: null },
  enabled: true,
  sections: [
    section('avisos'),
    section('puntos', { on: true }),
    section('cupones', {
      on: true,
      params: [
        { key: 'online', label: 'En línea', type: 'bool', value: false },
      ],
    }),
    section('recargas', {
      available: false,
      on: true,
      blocked: {
        text: 'Necesita las recargas conectadas.',
        fix: { label: 'Ver recargas', route: '/crm/cuenta?tab=tienda' },
      },
      params: RECARGAS_PARAMS,
    }),
    section('reparaciones', { on: false }),
    section('citas', { on: true }),
  ],
  tabs: ['inicio', 'promos', 'actividad', 'mas'],
  store_url: 'https://tienda.example.com/',
  kpis: {
    accounts: 1250,
    active_30d: 300,
    cards: null,
    coupons_used_30d: 0,
    rewards_30d: undefined,
    debt_paid_online_30d: 1520.5,
  },
})

describe('the sections in the owner’s groups', () => {
  it('Lealtad, Dinero, Servicio, Contacto in order; a part no group names goes last', () => {
    const groups = sectionGroups(STATE())
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.key)])).toEqual([
      ['Loyalty', ['puntos', 'cupones']],
      ['Service', ['reparaciones', 'recargas']],
      ['Contact', ['avisos']],
      ['More', ['citas']],
    ])
    expect(seen.some(([, context]) => context === CTX)).toBe(true)
  })

  it('never shows the master key as a row', () => {
    const state = STATE()
    state.sections.push(section(MASTER, { on: true }))
    const keys = sectionGroups(state).flatMap((g) => g.rows.map((r) => r.key))
    expect(keys).not.toContain(MASTER)
  })

  it('a part the shop cannot offer is off, disabled, says why and where to fix it', () => {
    const recargas = sectionGroups(STATE())
      .flatMap((g) => g.rows)
      .find((row) => row.key === 'recargas')
    expect(recargas).toMatchObject({
      on: false,
      disabled: true,
      editable: false,
      paramsLine: '',
      blocked: {
        text: 'Necesita las recargas conectadas.',
        fix: { label: 'Ver recargas', to: '/cuenta?tab=tienda' },
      },
    })
  })

  it('an unavailable part without the cell’s words still says something', () => {
    const state = STATE()
    state.sections = [section('premios', { available: false })]
    const [row] = sectionGroups(state)[0].rows
    expect(row.blocked.text).toBe('This shop cannot offer it yet.')
    expect(row.blocked.fix).toBeNull()
  })

  it('a tap on its way shows before the server answers', () => {
    const rows = sectionGroups(STATE(), { reparaciones: true, puntos: false })
      .flatMap((g) => g.rows)
      .filter((row) => ['reparaciones', 'puntos'].includes(row.key))
    expect(rows.map((row) => [row.key, row.on])).toEqual([
      ['puntos', false],
      ['reparaciones', true],
    ])
  })

  it('read-only: every switch is disabled, the rules still open', () => {
    const state = STATE()
    state.can_change = false
    const rows = sectionGroups(state).flatMap((g) => g.rows)
    expect(rows.every((row) => row.disabled)).toBe(true)
    expect(rows.find((row) => row.key === 'cupones').editable).toBe(true)
  })
})

describe('the master switch', () => {
  it('on: its sentence and how customers sign in', () => {
    const view = masterView(STATE())
    expect(view.on).toBe(true)
    expect(view.disabled).toBe(false)
    expect(view.sentence).toBe(
      'Your customers sign in on your online store and see what you turn on below. They get their code by email or WhatsApp.',
    )
    expect(view.reason).toBe('')
  })

  it('no login channel: off and disabled, with why and the fix', () => {
    const state = STATE()
    state.enabled = false
    state.login = {
      channels: [],
      ok: false,
      fix: { label: 'Conectar WhatsApp', route: '/crm/negocio' },
    }
    const view = masterView(state)
    expect(view).toMatchObject({
      on: false,
      disabled: true,
      fix: { label: 'Conectar WhatsApp', to: '/negocio' },
    })
    expect(view.reason).toBe(
      'Your customers sign in with a code by email or WhatsApp. Connect one so they can.',
    )
  })

  it('the login broke while on: it can still be turned off, and says so', () => {
    const state = STATE()
    state.login = { channels: [], ok: false, fix: null }
    const view = masterView(state)
    expect(view.disabled).toBe(false)
    expect(view.reason).toMatch(/cannot sign in right now/)
  })

  it('read-only owner: disabled', () => {
    const state = STATE()
    state.can_change = false
    expect(masterView(state).disabled).toBe(true)
  })
})

describe('fix links', () => {
  it('a /crm route opens in the shell, a Desk path or https as a page', () => {
    expect(
      fixLink({ label: 'Fidelidad', route: '/crm/ventas/fidelidad' }),
    ).toEqual({ label: 'Fidelidad', to: '/ventas/fidelidad' })
    expect(fixLink({ label: 'Taller', route: '/ventas/fidelidad' })).toEqual({
      label: 'Taller',
      to: '/ventas/fidelidad',
    })
    expect(fixLink({ label: 'Desk', route: '/app/saldo-settings' })).toEqual({
      label: 'Desk',
      href: '/app/saldo-settings',
    })
    expect(
      fixLink({ label: 'Ayuda', route: 'https://muelle.example/ayuda' }),
    ).toEqual({ label: 'Ayuda', href: 'https://muelle.example/ayuda' })
  })

  it('no words, no route, or a foreign scheme: no link', () => {
    expect(fixLink(null)).toBeNull()
    expect(fixLink({ label: '', route: '/crm/x' })).toBeNull()
    expect(fixLink({ label: 'x', route: '' })).toBeNull()
    expect(fixLink({ label: 'x', route: '//evil.example' })).toBeNull()
    expect(fixLink({ label: 'x', route: 'javascript:alert(1)' })).toBeNull()
  })
})

describe('the preview', () => {
  it('the parts customers see, the tabs and the link to their account', () => {
    const view = previewView(STATE())
    expect(view.on).toBe(true)
    expect(view.chip).toEqual({ label: 'On', tone: 'success' })
    expect(view.shown.map((one) => one.key)).toEqual([
      'puntos',
      'cupones',
      'citas',
    ])
    expect(view.line).toBe('They see: Puntos, Cupones, Citas.')
    expect(view.tabs.map((tab) => [tab.key, tab.label])).toEqual([
      ['inicio', 'Home'],
      ['promos', 'Promos'],
      ['actividad', 'Activity'],
      ['mas', 'More'],
    ])
    expect(view.link).toBe('https://tienda.example.com/cuenta')
  })

  it('off: the store as always', () => {
    const state = STATE()
    state.enabled = false
    const view = previewView(state)
    expect(view.chip.label).toBe('Off')
    expect(view.line).toBe('Your customers see your store as always.')
  })

  it('on with nothing on yet', () => {
    const state = STATE()
    state.sections = [section('puntos')]
    expect(previewView(state).line).toBe(
      'Nothing turned on yet: they see their usual account.',
    )
  })

  it('tabs as the cell sends them: keys or {key, label}; none → the usual store', () => {
    expect(
      previewTabs([{ key: 'inicio', label: 'Inicio' }, 'tienda', 'tienda']),
    ).toEqual([
      { key: 'inicio', label: 'Inicio', icon: 'lucide-home' },
      { key: 'tienda', label: 'Shop', icon: 'lucide-store' },
    ])
    expect(previewTabs(undefined).map((tab) => tab.key)).toEqual([
      'inicio',
      'tienda',
      'mas',
    ])
  })

  it('the customer link: only an http(s) address', () => {
    expect(customerLink('https://a.example')).toBe('https://a.example/cuenta')
    expect(customerLink('ftp://a.example')).toBe('')
    expect(customerLink('')).toBe('')
    expect(customerLink(null)).toBe('')
  })
})

describe('the figures', () => {
  it('only what the cell counted; money in the shop’s currency', () => {
    expect(kpiTiles(STATE().kpis, 'MXN')).toEqual([
      { key: 'accounts', label: 'Customer accounts', value: '1,250' },
      { key: 'active_30d', label: 'Came in, last 30 days', value: '300' },
      {
        key: 'coupons_used_30d',
        label: 'Coupons used, last 30 days',
        value: '0',
      },
      {
        key: 'debt_paid_online_30d',
        label: 'Debts paid online, last 30 days',
        value: '$1,520.50',
      },
    ])
  })

  it('another currency shows its code', () => {
    const [tile] = kpiTiles({ debt_paid_online_30d: 10 }, 'USD')
    expect(tile.value).toBe('USD 10.00')
  })

  it('no figures at all: no tiles', () => {
    expect(kpiTiles(null)).toEqual([])
  })
})

describe('«Cómo va», after the parts', () => {
  it('while the app is on: the figures the cell counted', () => {
    const block = kpiBlock(STATE(), {}, 'MXN')
    expect(block.quiet).toBe('')
    expect(block.tiles.map((tile) => tile.key)).toEqual([
      'accounts',
      'active_30d',
      'coupons_used_30d',
      'debt_paid_online_30d',
    ])
  })

  it('while the app is off, or a tap turning it off is on its way: nothing', () => {
    expect(kpiBlock({ ...STATE(), enabled: false })).toBeNull()
    expect(kpiBlock(STATE(), { enabled: false })).toBeNull()
  })

  it('every figure still at zero: one short line instead of the zero tiles', () => {
    const zero = {
      ...STATE(),
      kpis: {
        accounts: 0,
        active_30d: 0,
        cards: 0,
        coupons_used_30d: 0,
        rewards_30d: null,
        debt_paid_online_30d: 0,
      },
    }
    expect(kpiBlock(zero, {}, 'MXN')).toEqual({
      quiet:
        'No activity yet: here you will see how many customers use the app.',
      tiles: [],
    })
    // one account is movement: the figures show
    zero.kpis.accounts = 1
    expect(kpiBlock(zero, {}, 'MXN').tiles).toHaveLength(5)
  })

  it('a cell that counted nothing: no block', () => {
    expect(kpiBlock({ ...STATE(), kpis: null })).toBeNull()
  })
})

describe('the params in words', () => {
  it('each type reads as the owner says it', () => {
    const [modo, metodos, max, diario] = RECARGAS_PARAMS
    expect(paramValueText(modo, 'buy')).toBe('Comprar en la app')
    expect(paramValueText(metodos, ['card', 'spei'])).toBe('Tarjeta, SPEI')
    expect(paramValueText(metodos, [])).toBe('None')
    expect(paramValueText(max, 500, 'MXN')).toBe('$500.00')
    expect(paramValueText(diario, 3)).toBe('3')
    expect(paramValueText({ type: 'bool' }, true)).toBe('Yes')
    expect(paramValueText({ type: 'bool' }, false)).toBe('No')
  })

  it('one line under the help', () => {
    expect(paramsLine(RECARGAS_PARAMS, 'MXN')).toBe(
      'Modo: Solo ver; Cómo pagan: SPEI; Máximo: $500.00; Al día: 3',
    )
  })

  it('the row of an available part carries its line and opens its rules', () => {
    const state = STATE()
    state.sections = [section('recargas', { params: RECARGAS_PARAMS })]
    const [row] = sectionGroups(state, {}, 'MXN')[0].rows
    expect(row.editable).toBe(true)
    expect(row.paramsLine).toMatch(/^Modo: Solo ver/)
  })
})

describe('the rules sheet', () => {
  it('starts from the stored values; numbers as typed text', () => {
    expect(paramDraft(RECARGAS_PARAMS)).toEqual({
      modo: 'info',
      metodos: ['spei'],
      max_monto: '500',
      max_diario_num: '3',
    })
  })

  it('sends only what changed, typed as the cell stores it', () => {
    const draft = paramDraft(RECARGAS_PARAMS)
    expect(paramChanges(RECARGAS_PARAMS, draft)).toEqual({})
    draft.modo = 'buy'
    draft.metodos = ['card', 'spei']
    draft.max_monto = '750.5'
    expect(paramChanges(RECARGAS_PARAMS, draft)).toEqual({
      modo: 'buy',
      metodos: ['spei', 'card'],
      max_monto: 750.5,
    })
    expect(paramsChange('recargas', { modo: 'buy' })).toEqual({
      params: { recargas: { modo: 'buy' } },
    })
  })

  it('says what is wrong with a number', () => {
    const [, , max, diario] = RECARGAS_PARAMS
    expect(paramProblem(max, '')).toBe('Write a number.')
    expect(paramProblem(max, 'abc')).toBe('Write a number.')
    expect(paramProblem(max, '5', 'MXN')).toBe('At least $10.00.')
    expect(paramProblem(diario, '2.5')).toBe('Whole numbers only.')
    expect(paramProblem(diario, '21')).toBe('At most 20.')
    expect(paramProblem(diario, '20')).toBe('')
    expect(paramProblem(RECARGAS_PARAMS[0], 'x')).toBe('')
  })
})

describe('what a tap sends and what its answer says', () => {
  it('the master, a part', () => {
    expect(changeFor(MASTER, true)).toEqual({ enabled: true })
    expect(changeFor('puntos', false)).toEqual({ sections: { puntos: false } })
  })

  it('the server took it', () => {
    const answer = STATE()
    expect(
      tapOutcome(answer, { key: 'puntos', label: 'Puntos' }, true),
    ).toEqual({ ok: true, text: 'Your customers now see Puntos.' })
    expect(
      tapOutcome(answer, { key: 'reparaciones', label: 'Reparaciones' }, false),
    ).toEqual({ ok: true, text: 'Your customers no longer see Reparaciones.' })
    expect(tapOutcome(answer, { key: MASTER, label: 'App' }, true)).toEqual({
      ok: true,
      text: 'The app is on for your customers.',
    })
  })

  it('the server kept it off: the reason it gives', () => {
    const answer = STATE()
    expect(
      tapOutcome(answer, { key: 'recargas', label: 'Recargas' }, true),
    ).toEqual({ ok: false, text: 'Necesita las recargas conectadas.' })
    answer.enabled = false
    answer.login = { ok: false, channels: [] }
    expect(tapOutcome(answer, { key: MASTER, label: 'App' }, true).text).toBe(
      'Your customers sign in with a code by email or WhatsApp. Connect one so they can.',
    )
  })
})

describe('the legal texts', () => {
  const TEXTS = {
    terms_text: '',
    returns_policy_text: 'Mis devoluciones',
    warranty_policy_text: '',
    privacy_notice: 'Aviso',
    return_window_days: 30,
    builtin: { terms: 'Términos sugeridos', returns: 'Dev', warranty: 'Gar' },
  }

  it('four fields, the suggested text from the cell; privacy has none', () => {
    expect(legalFields(TEXTS)).toEqual([
      {
        key: 'terms_text',
        label: 'Terms and conditions',
        suggested: 'Términos sugeridos',
      },
      { key: 'returns_policy_text', label: 'Returns', suggested: 'Dev' },
      { key: 'warranty_policy_text', label: 'Warranty', suggested: 'Gar' },
      { key: 'privacy_notice', label: 'Privacy notice', suggested: '' },
    ])
  })

  it('dirty only when something changed; sent whole with the days as a number', () => {
    const draft = legalDraft(TEXTS)
    expect(legalDirty(TEXTS, draft)).toBe(false)
    draft.terms_text = 'Términos sugeridos'
    draft.return_window_days = '15'
    expect(legalDirty(TEXTS, draft)).toBe(true)
    expect(legalPayload(draft)).toEqual({
      terms_text: 'Términos sugeridos',
      returns_policy_text: 'Mis devoluciones',
      warranty_policy_text: '',
      privacy_notice: 'Aviso',
      return_window_days: 15,
    })
  })

  it('the days to answer a privacy request: only where the cell offers them, within the law', () => {
    expect(arcoRule(TEXTS)).toBeNull()
    expect('arco_response_days' in legalDraft(TEXTS)).toBe(false)
    expect('arco_response_days' in legalPayload(legalDraft(TEXTS))).toBe(false)
    const withDays = {
      ...TEXTS,
      arco_response_days: 20,
      arco_days_default: 20,
      arco_days_max: 20,
    }
    expect(arcoRule(withDays)).toEqual({ default: 20, max: 20 })
    const draft = legalDraft(withDays)
    expect(draft.arco_response_days).toBe('20')
    expect(legalDirty(withDays, draft)).toBe(false)
    draft.arco_response_days = '15'
    expect(legalDirty(withDays, draft)).toBe(true)
    expect(arcoProblem(draft, withDays)).toBe('')
    expect(legalPayload(draft).arco_response_days).toBe(15)
    for (const bad of ['', '0', '21', '7.5', 'x']) {
      draft.arco_response_days = bad
      expect(arcoProblem(draft, withDays)).toBe(
        'Write the days as a whole number from 1 to 20.',
      )
    }
    // a country the table does not name: up to 90
    expect(
      arcoRule({ ...TEXTS, arco_response_days: 30, arco_days_default: 20 }),
    ).toEqual({ default: 20, max: 90 })
  })

  it('the days are a whole number from 0 to 365', () => {
    expect(legalProblem({ return_window_days: '30' })).toBe('')
    expect(legalProblem({ return_window_days: '0' })).toBe('')
    for (const bad of ['', '-1', '366', '7.5', 'x'])
      expect(legalProblem({ return_window_days: bad })).toBe(
        'Write the days as a whole number from 0 to 365.',
      )
  })
})

describe('the shop and the doors', () => {
  it('the picker only with several shops, by their labels', () => {
    expect(profileScopes(STATE())).toEqual([])
    const state = STATE()
    state.profiles.push({ name: 'Tienda Norte', label: 'Norte' })
    expect(profileScopes(state)).toEqual([
      { value: 'Tienda Centro', label: 'Centro' },
      { value: 'Tienda Norte', label: 'Norte' },
    ])
    expect(profileLabel(state)).toBe('Centro')
  })

  it('Fidelidad’s door: hidden without a shop, says what is on', () => {
    expect(doorView(null)).toBeNull()
    expect(doorView({ ...STATE(), profile: '' })).toBeNull()
    expect(doorView(STATE())).toEqual({ line: 'On: Puntos, Cupones, Citas' })
    expect(doorView({ ...STATE(), enabled: false })).toEqual({
      line: 'Off. Turn it on in a few taps.',
    })
  })
})

describe('owner pages the app covers', () => {
  it('names each address once, and says nothing when none', () => {
    expect(pagesTakenLine(null)).toBe('')
    expect(pagesTakenLine({ pages_taken: [] })).toBe('')
    const one = pagesTakenLine({
      pages_taken: [{ path: '/devoluciones', title: 'Cambios' }],
    })
    expect(one).toContain('/devoluciones')
    const two = pagesTakenLine({
      pages_taken: [
        { path: '/devoluciones' },
        { path: '/garantias' },
        { path: '/devoluciones' },
        { path: 7 },
      ],
    })
    expect(two).toContain('/devoluciones, /garantias')
    expect(two.split('/devoluciones').length).toBe(2)
  })
})

describe('whether the online store takes coupons at all', () => {
  it('says it above the Cupones rules, with the way to change it', () => {
    expect(onlineCouponsNote(null)).toBe(null)
    // an older cell does not say: no line
    expect(onlineCouponsNote({ profile: 'Tienda' })).toBe(null)
    const on = onlineCouponsNote({ online_coupons: true })
    expect(on.on).toBe(true)
    expect(on.text).toBe('Your online store takes coupons.')
    // on: «Also at online checkout» is the owner's to change
    expect(on.locks).toEqual([])
    const off = onlineCouponsNote({ online_coupons: false })
    expect(off.on).toBe(false)
    // off: that rule would do nothing, so it is locked and says why
    expect(off.locks).toEqual(['online'])
    expect(off.lockedHelp).toBe(
      'It can be turned on once your online store takes coupons.',
    )
    expect(off.text).toContain('it sells at list prices')
    expect(off.link).toEqual({
      label: 'Change it in Business settings',
      to: ONLINE_COUPONS_ROUTE,
    })
    expect(ONLINE_COUPONS_ROUTE).toBe('/negocio?ajuste=doco.online_coupons')
    expect(seen.every(([, context]) => context === CTX)).toBe(true)
  })
})
