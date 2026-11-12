// Hoy's «Primeros pasos» card: each row opens its step (one of Hoy's sheets in
// place, or a shell page with the way back) and «Ocultar» sits beside the row,
// never inside it. A link from elsewhere (?paso=negocio) opens the sheet once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { _openSheets, _resetSheetHistory } from '@/components/ui/sheetHistory'

const state = vi.hoisted(() => ({ call: vi.fn(), answer: null }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            { ...attrs, type: 'button', onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})
vi.mock('@/composables/useHoy', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHoy: async () => state.answer,
}))
// The sheets: only whether Hoy opens them.
for (const name of ['ProductoSheet', 'InvitarSheet', 'PrimerosPasosSheet'])
  vi.doMock(`@/components/primeros/${name}.vue`, async () => {
    const { h } = await import('vue')
    return {
      __esModule: true,
      default: {
        props: ['open'],
        setup: (props) => () =>
          props.open ? h('section', { 'data-hoja': name }) : null,
      },
    }
  })
// One sheet on the kit's real BottomSheet: its history entry and the router
// guard that closes open sheets on a navigation are what a link has to survive.
vi.doMock('@/components/primeros/NegocioSheet.vue', async () => {
  const { h } = await import('vue')
  const { default: BottomSheet } = await import(
    '@/components/ui/BottomSheet.vue'
  )
  return {
    __esModule: true,
    default: {
      props: ['open'],
      emits: ['close'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            BottomSheet,
            {
              open: props.open,
              title: 'Negocio',
              'onUpdate:open': (value) => !value && emit('close'),
            },
            () =>
              h('section', { 'data-hoja': 'NegocioSheet' }, [
                h(
                  'button',
                  {
                    type: 'button',
                    'data-cerrar': '',
                    onClick: () => emit('close'),
                  },
                  'Cancelar',
                ),
              ]),
          ),
    },
  }
})

const SOURCE = {
  key: 'abordo.primeros_pasos',
  label: 'Primeros pasos',
  detail: '1 de 5 listos',
  count: 3,
  url: '/crm/hoy?paso=todos',
  rows: [
    {
      name: 'negocio',
      title: 'Completa los datos de tu negocio',
      detail: 'Falta: logo.',
      url: '/crm/hoy?paso=negocio',
    },
    {
      name: 'precios',
      title: 'Ponle precio a lo que vendes',
      detail: '3 artículos sin precio.',
      url: '/crm/productos/precios?vista=sin-precio',
    },
    {
      name: 'primera_venta',
      title: 'Haz tu primera venta',
      detail: 'Primero da de alta lo que vendes.',
      url: null,
    },
  ],
  action: { label: 'Ocultar', method: 'abordo.primeros_pasos.hoy.hide' },
}

let app, root, router
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function until(check, tries = 300) {
  for (let i = 0; i < tries && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
  }
  return check()
}
async function mount(path = '/hoy') {
  const { default: Hoy } = await import('@/pages/Hoy.vue')
  const page = { render: () => h('p', 'page') }
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/hoy', name: 'Hoy', component: Hoy },
      { path: '/:rest(.*)*', component: page },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  window.__ = app.config.globalProperties.__
  app.mount(root)
  await until(() => root.querySelector('[data-ui-list-row]'))
}
const row = (title) =>
  [...root.querySelectorAll('[data-ui-list-row]')].find((el) =>
    el.textContent.includes(title),
  )

beforeEach(() => {
  state.answer = {
    today: '2026-11-11',
    continuar: { available: true, items: [], sources: [SOURCE] },
  }
  state.call.mockReset()
  state.call.mockResolvedValue({ ok: true, message: 'Ocultaste el paso.' })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  _resetSheetHistory()
})
// The sheet's content sits in the dialog's portal, outside the page's root.
const hojaShown = (name) => document.querySelector(`[data-hoja="${name}"]`)

describe('the Primeros pasos card on Hoy', () => {
  it('a step row is one tap: a sheet in place or a shell page with the way back', async () => {
    await mount()
    const negocio = row('Completa los datos de tu negocio')
    expect(negocio.tagName).toBe('BUTTON')
    negocio.click()
    expect(await until(() => hojaShown('NegocioSheet'))).toBeTruthy()
    expect(router.currentRoute.value.fullPath).toBe('/hoy') // opened in place
    const precios = row('Ponle precio a lo que vendes')
    expect(precios.tagName).toBe('A')
    expect(precios.getAttribute('href')).toContain(
      '/productos/precios?vista=sin-precio&return_to=%2Fcrm%2Fhoy',
    )
    // A step that waits on another is text, not a dead link.
    expect(row('Haz tu primera venta').tagName).toBe('DIV')
  })

  it('«Ocultar» sits beside the row and runs the provider’s action', async () => {
    await mount()
    const line = row('Completa los datos de tu negocio').parentElement
      .parentElement
    const hide = [...line.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Ocultar',
    )
    expect(hide.closest('[data-ui-list-row]')).toBeNull()
    hide.click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('abordo.primeros_pasos.hoy.hide', {
      name: 'negocio',
      value: '',
      modified: undefined,
    })
  })

  it('«Ver todo» opens the whole list on Hoy, never the Desk page', async () => {
    await mount()
    const all = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('See all'),
    )
    all.click()
    expect(
      await until(() => root.querySelector('[data-hoja="PrimerosPasosSheet"]')),
    ).toBeTruthy()
  })

  it('a link with ?paso= opens that sheet and leaves the URL clean', async () => {
    await mount('/hoy?paso=invitar&return_to=%2Fcrm%2Fhoy&return_label=Hoy')
    expect(
      await until(() => root.querySelector('[data-hoja="InvitarSheet"]')),
    ).toBeTruthy()
    expect(
      await until(() => router.currentRoute.value.fullPath === '/hoy'),
    ).toBe(true)
  })

  it('a ?paso= link opens a sheet that is already mounted and it stays open', async () => {
    await mount()
    row('Completa los datos de tu negocio').click()
    expect(await until(() => hojaShown('NegocioSheet'))).toBeTruthy()
    hojaShown('NegocioSheet').querySelector('[data-cerrar]').click()
    expect(await until(() => !hojaShown('NegocioSheet'))).toBe(true)
    await flush()

    // Still on Hoy, the assistant's «¿qué me falta?» link.
    router.push('/hoy?paso=negocio')
    expect(
      await until(() => router.currentRoute.value.fullPath === '/hoy'),
    ).toBe(true)
    await flush()
    expect(hojaShown('NegocioSheet')).toBeTruthy()
    expect(_openSheets()).toHaveLength(1)
  })
})
