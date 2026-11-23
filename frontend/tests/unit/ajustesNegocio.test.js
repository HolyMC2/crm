// «Ajustes del negocio» (crm.api.business_settings): the apps' own rows by
// area, every other switch folded and searchable, a tap that saves and a
// refusal that puts the switch back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  call: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: {
      success: (...args) => state.toast(...args),
      error: (...args) => state.error(...args),
    },
    Button: { props: ['label'], setup: (p) => () => h('button', p.label) },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(false) }
})
vi.mock('@/components/ui', () => ({ AppBar: { render: () => null } }))
const shell = vi.hoisted(() => ({ apply: vi.fn(), load: vi.fn() }))
vi.mock('@/utils/shellAppearance', () => ({
  applyShellAppearance: (...args) => shell.apply(...args),
}))
vi.mock('@/composables/muelleShell', () => ({
  loadShell: (...args) => shell.load(...args),
}))

import AjustesNegocio from '@/pages/AjustesNegocio.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const PAGE = {
  areas: [
    { key: 'ventas', label: 'Ventas y prospectos' },
    { key: 'inventario', label: 'Inventario' },
    { key: 'otros', label: 'Otros' },
  ],
  curated: [
    {
      key: 'crm.prospectos',
      area: 'ventas',
      kind: 'screen',
      label: 'Cómo registras prospectos',
      help: 'Lo que pide el alta.',
      to: '/prospectos?ajustes=1',
    },
    {
      key: 'scanner.conteo_ui',
      area: 'inventario',
      kind: 'switch',
      label: 'Conteo del día en Escáner',
      on: 'Quien cuenta ve «Mi día».',
      off: 'El conteo se abre desde Hoy.',
      value: false,
      can_change: true,
    },
  ],
  advanced: [
    {
      key: 'Scanner Settings:enabled',
      doctype: 'Scanner Settings',
      doctype_label: 'Ajustes del Escáner',
      field: 'enabled',
      label: 'Escáner activo',
      help: 'Activa el Escáner.',
      value: true,
      can_change: true,
    },
    {
      key: 'Taller App Settings:x',
      doctype: 'Taller App Settings',
      doctype_label: 'Ajustes de Taller',
      field: 'x',
      label: 'Garantía con fotos',
      help: '',
      value: false,
      can_change: false,
    },
  ],
}

let app
let host
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(query = null, page = PAGE) {
  state.call.mockResolvedValueOnce(JSON.parse(JSON.stringify(page)))
  host = document.createElement('div')
  document.body.appendChild(host)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { render: () => null } }],
  })
  if (query) await router.push({ path: '/negocio', query })
  app = createApp({ render: () => h(AjustesNegocio) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(host)
  await flush()
}
const $ = (sel) => host.querySelector(sel)
const $$ = (sel) => [...host.querySelectorAll(sel)]
const switchOf = (key) => $(`[data-negocio="${key}"] [role="switch"]`)
async function search(text) {
  const box = $('[data-negocio-buscar]')
  box.value = text
  box.dispatchEvent(new Event('input'))
  await flush()
}

afterEach(() => {
  app?.unmount()
  host?.parentNode?.removeChild(host)
  state.call.mockReset()
  state.toast.mockReset()
  state.error.mockReset()
})

describe('Ajustes del negocio', () => {
  it('shows the apps’ rows by area, with what each one does now', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith('crm.api.business_settings.page')
    expect($$('[data-negocio-area]').map((s) => s.dataset.negocioArea)).toEqual(
      ['ventas', 'inventario'],
    )
    expect($('[data-negocio="crm.prospectos"] a').getAttribute('href')).toBe(
      '/prospectos?ajustes=1',
    )
    expect($('[data-negocio="scanner.conteo_ui"]').textContent).toContain(
      'El conteo se abre desde Hoy.',
    )
    // Every other switch starts folded.
    expect($('[data-negocio="Scanner Settings:enabled"]')).toBeNull()
  })

  it('saves a tap and says it', async () => {
    await mount()
    state.call.mockResolvedValueOnce({ key: 'scanner.conteo_ui', value: true })
    switchOf('scanner.conteo_ui').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.business_settings.set_switch',
      { key: 'scanner.conteo_ui', value: 1 },
    )
    expect(switchOf('scanner.conteo_ui').getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(state.toast).toHaveBeenCalledWith(
      'Turned on: Conteo del día en Escáner',
    )
  })

  it('puts the switch back when the server refuses', async () => {
    await mount()
    state.call.mockRejectedValueOnce({ messages: ['No tienes permiso.'] })
    switchOf('scanner.conteo_ui').click()
    await flush()
    expect(switchOf('scanner.conteo_ui').getAttribute('aria-checked')).toBe(
      'false',
    )
    expect(state.error).toHaveBeenCalled()
  })

  it('finds any switch by its words, accents or not, and opens the rest', async () => {
    await mount()
    await search('escaner')
    expect($('[data-negocio="scanner.conteo_ui"]')).toBeTruthy()
    expect($('[data-negocio="Scanner Settings:enabled"]')).toBeTruthy()
    expect($('[data-negocio="crm.prospectos"]')).toBeNull()
    await search('garantía')
    const locked = switchOf('Taller App Settings:x')
    expect(
      locked.disabled || locked.getAttribute('aria-disabled') === 'true',
    ).toBe(true)
    await search('nada así')
    expect($('[data-negocio-vacio]')).toBeTruthy()
  })

  it('?ajuste= brings the row another page sends the owner to into focus', async () => {
    await mount({ ajuste: 'scanner.conteo_ui' })
    expect(document.activeElement).toBe(switchOf('scanner.conteo_ui'))
    app.unmount()
    host.remove()
    // a key the page does not list focuses nothing
    await mount({ ajuste: 'doco.online_coupons' })
    expect(document.activeElement).toBe(document.body)
    expect($('[data-fresh]')).toBeNull()
  })

  it('?ajuste= washes that row once, so the owner sees which switch it is', async () => {
    // the page's own waits still run; the wash's 2.4 s are skipped
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    try {
      await mount({ ajuste: 'scanner.conteo_ui' })
      // the shell's [data-fresh] wash, on that row only
      expect($$('[data-fresh]').map((el) => el.dataset.negocio)).toEqual([
        'scanner.conteo_ui',
      ])
      // then it fades and the row is plain again
      vi.advanceTimersByTime(2400)
      await nextTick()
      expect($('[data-fresh]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a plain visit washes no row', async () => {
    await mount()
    expect($('[data-fresh]')).toBeNull()
  })

  it('?ajuste= finds the first of a setting with one row per shop', async () => {
    PAGE.curated.push({
      key: 'doco.online_coupons:Tienda Norte',
      area: 'ventas',
      kind: 'switch',
      label: 'Cupones en la tienda en línea: Norte',
      on: 'Tus clientes pueden usar cupones al pagar en línea.',
      value: true,
      can_change: true,
    })
    try {
      await mount({ ajuste: 'doco.online_coupons' })
      expect(document.activeElement).toBe(
        switchOf('doco.online_coupons:Tienda Norte'),
      )
    } finally {
      PAGE.curated.pop()
    }
  })
})

// The shop's colour (doco appearance through the hook): six swatches and its own.
const COLOR = {
  key: 'doco.color',
  area: 'otros',
  kind: 'palette',
  label: 'Color del negocio',
  doctype: 'Doco Business Settings',
  save: 'doco.erp_experience.appearance.save',
  stored: { accent: '', tone: 'Neutral', density: 'Comfortable' },
  palette: { accent: '#171717' },
  can_change: true,
  swatches: [
    ['gris', 'Gris', '', '#171717', '#ededed'],
    ['azul', 'Azul', '#0070cc', '#0070cc', '#5aaef2'],
    ['verde', 'Verde', '#137949', '#137949', '#58c08e'],
    ['morado', 'Morado', '#6e399d', '#6e399d', '#b168e8'],
    ['rosa', 'Rosa', '#9c2671', '#9c2671', '#e359ab'],
    ['muelle', 'Muelle', '#0f7a8f', '#0f7a8f', '#5cb8ca'],
  ].map(([key, label, accent, light, dark]) => ({
    key,
    label,
    accent,
    light,
    dark,
  })),
}
const withColor = (over = {}) => ({
  ...PAGE,
  curated: [...PAGE.curated, { ...COLOR, ...over }],
})
const swatch = (key) => $(`[data-negocio-color] [data-color="${key}"]`)

describe('Ajustes del negocio › the shop’s colour', () => {
  afterEach(() => {
    shell.apply.mockReset()
    shell.load.mockReset()
  })

  it('shows six swatches and its own colour, Gris on while nothing is chosen', async () => {
    await mount(null, withColor())
    expect(
      $$('[data-negocio-color] [role="radio"]').map((b) => b.dataset.color),
    ).toEqual(['gris', 'azul', 'verde', 'morado', 'rosa', 'muelle'])
    expect(swatch('gris').getAttribute('aria-checked')).toBe('true')
    expect(swatch('propio')).not.toBeNull()
    expect($('[data-negocio-color]').querySelector('p')).toBeNull()
  })

  it('a tap saves once with the stored tone and density, and recolours the shell', async () => {
    await mount(null, withColor())
    state.call.mockResolvedValueOnce({
      accent: '#6e399d',
      accent_light: '#6e399d',
      accent_light_ink: '#ffffff',
      accent_dark: '#b168e8',
      accent_dark_ink: '#16222a',
      tone: 'neutral',
      density: 'comfortable',
      adjusted: false,
      surfaces: {},
    })
    swatch('morado').click()
    swatch('morado').click()
    await flush()
    const saves = state.call.mock.calls.filter(
      ([method]) => method === 'doco.erp_experience.appearance.save',
    )
    expect(saves).toEqual([
      [
        'doco.erp_experience.appearance.save',
        { accent: '#6e399d', tone: 'Neutral', density: 'Comfortable' },
      ],
    ])
    expect(shell.apply).toHaveBeenCalledWith(
      expect.objectContaining({ accent: '#6e399d', accent_dark: '#b168e8' }),
    )
    expect(shell.apply.mock.calls[0][0]).not.toHaveProperty('surfaces')
    expect(shell.load).toHaveBeenCalledWith({ refresh: true })
    expect(swatch('morado').getAttribute('aria-checked')).toBe('true')
  })

  it('who may not change it sees the colour and cannot tap it', async () => {
    await mount(null, withColor({ can_change: false }))
    expect(swatch('azul').disabled).toBe(true)
    swatch('azul').click()
    await flush()
    expect(state.call).toHaveBeenCalledTimes(1)
  })

  it('a refusal puts the swatch back and says why', async () => {
    await mount(null, withColor())
    state.call.mockRejectedValueOnce(
      Object.assign(new Error('save'), { messages: ['No tienes permiso'] }),
    )
    swatch('verde').click()
    await flush()
    expect(swatch('gris').getAttribute('aria-checked')).toBe('true')
    expect(state.error).toHaveBeenCalled()
    expect(shell.apply).not.toHaveBeenCalled()
  })
})
