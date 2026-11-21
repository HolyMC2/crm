// «Tienda» on a person in Equipo: on a tenant with shops the owner sees which
// shop the person works in and at what level, in words, or «Sin tienda: no ve
// existencias ni precios». The pencil (or «+») opens the sheet: the only shop
// comes picked, the level reads «Vende y cobra» / «Encarga la tienda», and
// «Quitar de la tienda» takes them out in two taps. Saving posts
// set_shop_access and the row shows the view the server sends back, its
// message beside it; a refusal stays in the sheet with «Volver a intentar».
// A doco without `tiendas` in get_person shows no row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePo } from './helpers/spanishCopy.js'

const state = vi.hoisted(() => ({
  person: null,
  calls: [],
  answer: null,
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ name: '', params: {}, query: {}, fullPath: '/' })
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    // BottomSheet's history hook (sheetHistory.js) registers a guard.
    beforeEach: vi.fn(() => () => {}),
    currentRoute: { value: { fullPath: '/' } },
  }
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
      if (method.endsWith('set_shop_access')) {
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

import {
  shopChanged,
  shopGrants,
  shopLevelChoices,
  shopLevelFor,
  shopLevelLabel,
  shopPreselect,
  shopRegions,
} from '@/composables/useEquipo'

const here = dirname(fileURLToPath(import.meta.url))
const catalog = parsePo(
  readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8'),
)
const spanish = (msgid, context = '') => catalog.get(`${context}\u0004${msgid}`)

const SET = 'doco.erp_experience.equipo.set_shop_access'
const CENTRO = { name: 'DOCO-CENTRO', label: 'Doco Centro' }
const NORTE = { name: 'DOCO-NORTE', label: 'Doco Norte' }
const grant = (shop, extra = {}) => ({
  shop: shop.name,
  shop_label: shop.label,
  level: 'User',
  is_default: false,
  enabled: true,
  ...extra,
})
const tiendas = (extra = {}) => ({
  can_change: true,
  reason: null,
  shops: [CENTRO],
  grants: [],
  ...extra,
})

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
const row = (root) => root.querySelector('[data-testid="equipo-tienda"]')
const words = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? ''
// One shop line of the row: its name, whether it is the default, its level.
const shopLines = (root) =>
  [...row(root).querySelectorAll('li[data-tienda]')].map((li) =>
    [
      words(li.querySelector('[data-tienda-nombre]')),
      li.querySelector('[data-testid="equipo-tienda-principal"]')
        ? words(li.querySelector('[data-testid="equipo-tienda-principal"]'))
        : null,
      words(li.querySelector('[data-tienda-nivel]')),
    ].filter(Boolean),
  )
const sheet = () => document.querySelector('[data-testid="tienda-hoja"]')
async function openSheet(root) {
  root.querySelector('[data-testid="equipo-tienda-cambiar"]').click()
  await vi.waitFor(() => expect(sheet()).not.toBeNull())
  await settle()
  return sheet()
}
const inSheet = (selector) => sheet().querySelector(selector)
const saveButton = () =>
  document.querySelector('[data-testid="tienda-guardar"]')
const shopCalls = () => state.calls.filter(([m]) => m === SET)

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
    tiendas: tiendas(),
  }
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
})

describe('the shop helpers', () => {
  it('reads each level in the owner’s words', () => {
    expect(shopLevelLabel('User')).toBe('Sells and charges')
    expect(shopLevelLabel('Shop Manager')).toBe('Runs the shop')
    expect(shopLevelLabel('Region Manager')).toBe('Runs the region')
    expect(spanish('Sells and charges', 'Equipo')).toBe('Vende y cobra')
    expect(spanish('Runs the shop', 'Equipo')).toBe('Encarga la tienda')
    expect(spanish('Runs the region', 'Equipo')).toBe('Encarga la región')
    expect(spanish('No shop: does not see stock or prices')).toBe(
      'Sin tienda: no ve existencias ni precios',
    )
    expect(spanish('Remove from the shop', 'Equipo')).toBe(
      'Quitar de la tienda',
    )
    expect(spanish('Try again', 'Equipo')).toBe('Volver a intentar')
  })

  it('lists the shops that are on, the default first, and picks the only shop', () => {
    const view = tiendas({
      shops: [CENTRO, NORTE],
      grants: [
        grant(CENTRO, { enabled: false }),
        grant(NORTE, { is_default: true }),
      ],
    })
    expect(shopGrants(view).map((g) => g.shop)).toEqual(['DOCO-NORTE'])
    expect(shopPreselect(view)).toBe('DOCO-NORTE')
    expect(shopPreselect(tiendas())).toBe('DOCO-CENTRO')
    expect(shopPreselect(tiendas({ shops: [CENTRO, NORTE] }))).toBe('')
    // A level made elsewhere stays offered beside the two handed out here.
    expect(shopLevelChoices('Region Manager')).toEqual([
      'User',
      'Shop Manager',
      'Region Manager',
    ])
    expect(shopLevelChoices('User')).toEqual(['User', 'Shop Manager'])
    const on = tiendas({ grants: [grant(CENTRO)] })
    expect(shopChanged(on, 'DOCO-CENTRO', 'User')).toBe(false)
    expect(shopChanged(on, 'DOCO-CENTRO', 'Shop Manager')).toBe(true)
  })

  it('never preselects a closed shop nor offers a region level on a grant that is off', () => {
    const CERRADA = { name: 'DOCO-VIEJA', label: 'Doco Vieja' }
    const view = tiendas({
      shops: [CENTRO],
      grants: [
        grant(CERRADA, { is_default: true }),
        grant(NORTE, { enabled: false, level: 'Region Manager' }),
      ],
    })
    expect(shopPreselect(view)).toBe('DOCO-CENTRO')
    expect(shopLevelFor(view, 'DOCO-NORTE')).toBe('User')
    expect(
      shopLevelFor(
        tiendas({ grants: [grant(NORTE, { level: 'Region Manager' })] }),
        'DOCO-NORTE',
      ),
    ).toBe('Region Manager')
    expect(
      shopRegions(
        tiendas({
          regions: [
            {
              territory: 'Sur',
              label: 'Sur',
              level: 'Region Manager',
              enabled: true,
            },
            {
              territory: 'Norte',
              label: 'Norte',
              level: 'Region Manager',
              enabled: false,
            },
          ],
        }),
      ).map((r) => r.label),
    ).toEqual(['Sur'])
    expect(spanish('Runs the region {0}')).toBe('Encarga la región {0}')
  })
})

describe('Tienda on a person', () => {
  it('a doco that sends no tiendas shows no row', async () => {
    delete state.person.tiendas
    const root = await mount()
    expect(row(root)).toBeNull()
    app.unmount()
    host.remove()
    state.person.tiendas = null
    const again = await mount()
    expect(row(again)).toBeNull()
    // The first test pays the Equipo page's cold import (see equipoFacturacion).
  }, 20000)

  it('without a shop it says they see no stock or prices', async () => {
    const root = await mount()
    expect(words(row(root).querySelector('h2'))).toBe('Shop')
    expect(
      words(root.querySelector('[data-testid="equipo-tienda-actual"]')),
    ).toBe('No shop: does not see stock or prices')
    const button = root.querySelector('[data-testid="equipo-tienda-cambiar"]')
    expect(button.getAttribute('aria-label')).toBe('Add to a shop')
  })

  it('shows each shop they are in with its level in words, the default marked', async () => {
    state.person.tiendas = tiendas({
      shops: [CENTRO, NORTE],
      grants: [
        grant(CENTRO),
        grant(NORTE, { level: 'Shop Manager', is_default: true }),
        grant({ name: 'DOCO-SUR', label: 'Doco Sur' }, { enabled: false }),
      ],
    })
    const root = await mount()
    expect(shopLines(root)).toEqual([
      ['Doco Norte', 'Main', 'Runs the shop'],
      ['Doco Centro', 'Sells and charges'],
    ])
    expect(row(root).textContent).not.toContain('Doco Sur')
    expect(
      root
        .querySelector('[data-testid="equipo-tienda-cambiar"]')
        .getAttribute('aria-label'),
    ).toBe('Change shop')
  })

  it('choosing a shop and a level posts them and shows the view sent back', async () => {
    state.person.tiendas = tiendas({ shops: [CENTRO, NORTE] })
    state.answer = {
      message: 'Jessica Cajera now runs Doco Norte.',
      tiendas: tiendas({
        shops: [CENTRO, NORTE],
        grants: [grant(NORTE, { level: 'Shop Manager', is_default: true })],
      }),
    }
    const root = await mount()
    await openSheet(root)
    // Two shops and none of theirs: nothing is picked and nothing saves yet.
    expect(sheet().querySelectorAll('[aria-checked="true"]')).toHaveLength(0)
    expect(saveButton().disabled).toBe(true)

    inSheet('[data-tienda="DOCO-NORTE"]').click()
    await nextTick()
    expect(
      inSheet('[data-tienda="DOCO-NORTE"]').getAttribute('aria-checked'),
    ).toBe('true')
    // «Vende y cobra» comes first; the owner picks «Encarga la tienda».
    expect(inSheet('[data-nivel="User"]').getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(words(inSheet('[data-nivel="Shop Manager"]'))).toContain(
      'Runs the shop',
    )
    inSheet('[data-nivel="Shop Manager"]').click()
    await nextTick()
    saveButton().click()
    await settle()

    expect(shopCalls()).toEqual([
      [
        SET,
        {
          user: 'jessica@example.test',
          shop: 'DOCO-NORTE',
          level: 'Shop Manager',
          enabled: 1,
        },
      ],
    ])
    expect(shopLines(root)).toEqual([['Doco Norte', 'Main', 'Runs the shop']])
    const said = root.querySelector('[data-testid="equipo-tienda-dicho"]')
    expect(words(said)).toBe('Jessica Cajera now runs Doco Norte.')
    expect(said.getAttribute('aria-live')).toBe('polite')
    await vi.waitFor(() => expect(sheet()).toBeNull())
  })

  it('the only shop comes picked with «Vende y cobra»', async () => {
    state.answer = {
      message: 'Jessica Cajera now sells at Doco Centro.',
      tiendas: tiendas({ grants: [grant(CENTRO, { is_default: true })] }),
    }
    const root = await mount()
    await openSheet(root)
    expect(
      inSheet('[data-tienda="DOCO-CENTRO"]').getAttribute('aria-checked'),
    ).toBe('true')
    expect(inSheet('[data-nivel="User"]').getAttribute('aria-checked')).toBe(
      'true',
    )
    // Nobody there yet: no «Quitar de la tienda».
    expect(document.querySelector('[data-testid="tienda-quitar"]')).toBeNull()
    expect(saveButton().disabled).toBe(false)
    saveButton().click()
    await settle()
    expect(shopCalls().at(-1)).toEqual([
      SET,
      {
        user: 'jessica@example.test',
        shop: 'DOCO-CENTRO',
        level: 'User',
        enabled: 1,
      },
    ])
    expect(shopLines(root)).toEqual([
      ['Doco Centro', 'Main', 'Sells and charges'],
    ])
  })

  it('«Quitar de la tienda» asks in place, then takes them out', async () => {
    state.person.tiendas = tiendas({
      grants: [grant(CENTRO, { level: 'Shop Manager', is_default: true })],
    })
    state.answer = {
      message: 'Jessica Cajera no longer works at Doco Centro.',
      tiendas: tiendas({
        grants: [
          grant(CENTRO, {
            level: 'Shop Manager',
            is_default: true,
            enabled: false,
          }),
        ],
      }),
    }
    const root = await mount()
    await openSheet(root)
    expect(
      inSheet('[data-nivel="Shop Manager"]').getAttribute('aria-checked'),
    ).toBe('true')
    document.querySelector('[data-testid="tienda-quitar"]').click()
    await nextTick()
    // The first tap only asks.
    expect(shopCalls()).toHaveLength(0)
    expect(sheet().textContent).toContain(
      'They stop seeing the stock and prices of Doco Centro.',
    )
    document.querySelector('[data-testid="tienda-quitar-si"]').click()
    await settle()
    expect(shopCalls()).toEqual([
      [
        SET,
        {
          user: 'jessica@example.test',
          shop: 'DOCO-CENTRO',
          level: 'Shop Manager',
          enabled: 0,
        },
      ],
    ])
    expect(
      words(root.querySelector('[data-testid="equipo-tienda-actual"]')),
    ).toBe('No shop: does not see stock or prices')
    expect(
      words(root.querySelector('[data-testid="equipo-tienda-dicho"]')),
    ).toBe('Jessica Cajera no longer works at Doco Centro.')
  })

  it('a refusal stays in the sheet and the button reads «Volver a intentar»', async () => {
    state.answer = Object.assign(
      new Error('Only the owner decides who works at a shop.'),
      { messages: ['Only the owner decides who works at a shop.'] },
    )
    const root = await mount()
    await openSheet(root)
    saveButton().click()
    await settle()
    expect(sheet()).not.toBeNull()
    expect(
      words(document.querySelector('[data-testid="tienda-problema"]')),
    ).toBe('Only the owner decides who works at a shop.')
    expect(words(saveButton())).toBe('Try again')
    // The page's row did not change.
    expect(
      words(root.querySelector('[data-testid="equipo-tienda-actual"]')),
    ).toBe('No shop: does not see stock or prices')
  })

  it('when the owner cannot change it, the row says why and opens nothing', async () => {
    state.person.tiendas = tiendas({
      can_change: false,
      reason: 'Jessica Cajera runs every shop as the owner.',
    })
    const root = await mount()
    expect(
      root.querySelector('[data-testid="equipo-tienda-cambiar"]'),
    ).toBeNull()
    expect(words(row(root))).toContain(
      'Jessica Cajera runs every shop as the owner.',
    )
    // The reason is the row's text: no «Sin tienda» beside «sees every shop».
    expect(words(row(root))).not.toContain(
      'No shop: does not see stock or prices',
    )
  })

  it('a region manager reads «Encarga la región», not «Sin tienda»', async () => {
    state.person.tiendas = tiendas({
      regions: [
        {
          territory: 'Sur',
          label: 'Sur',
          level: 'Region Manager',
          enabled: true,
        },
      ],
    })
    const root = await mount()
    expect(words(row(root))).toContain('Runs the region Sur')
    expect(words(row(root))).not.toContain(
      'No shop: does not see stock or prices',
    )
  })
})
