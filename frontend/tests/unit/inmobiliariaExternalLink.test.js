import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label'],
      setup: (props) => () => h('button', props.label),
    },
  }
})

import { externalLinkOf } from '@/composables/useInmobiliaria'
import FichaView from '@/components/inmobiliaria/FichaView.vue'

const PORTAL_SAT = 'https://sppld.sat.gob.mx/'
// The aviso's action as inmobiliaria.api.fichas_admin builds it.
const portal = (overrides = {}) => ({
  id: 'portal',
  etiqueta: 'Abrir el portal del SAT',
  tipo: 'default',
  habilitada: true,
  url: PORTAL_SAT,
  external: true,
  ...overrides,
})

describe('Inmobiliaria actions that lead out of the app: the SAT portal opens in a new tab', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    app = root = null
  })
  async function mountFicha(ficha) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:rest(.*)*', component: { render: () => null } }],
    })
    await router.push('/inmobiliaria/aviso/AV-1')
    await router.isReady()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(FichaView, { ficha }) })
    app.config.globalProperties.__ = (text) => text
    app.use(router)
    app.mount(root)
  }

  it('an external https action is a link out: its address, a new tab, no opener and no referrer', () => {
    expect(externalLinkOf(portal())).toEqual({
      href: PORTAL_SAT,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('an https address the app does not mark external is not a link out', () => {
    for (const external of [undefined, false, 1, 'true'])
      expect(externalLinkOf(portal({ external }))).toEqual({})
  })

  it('marked external, only an https address leads out: http, //host, javascript: and /crm/ paths do not', () => {
    for (const url of [
      'http://sppld.sat.gob.mx/',
      '//sppld.sat.gob.mx/',
      'javascript:alert(1)',
      '/crm/inmobiliaria/aviso/AV-1',
      undefined,
    ])
      expect(externalLinkOf(portal({ url }))).toEqual({})
  })

  it('a missing action is no link out', () => {
    expect(externalLinkOf()).toEqual({})
    expect(externalLinkOf(null)).toEqual({})
    expect(externalLinkOf({})).toEqual({})
  })

  it('on the aviso screen «Abrir el portal del SAT» is an anchor to the portal in a new tab; blocked, in-app and unmarked actions keep theirs', async () => {
    await mountFicha({
      tipo_label: 'Aviso PLD',
      titulo: 'Aviso AV-1',
      doctype: 'Aviso PLD',
      name: 'AV-1',
      secciones: [],
      acciones: [
        // The same rule holds for the filled «siguiente paso».
        portal({ id: 'portal-primario', tipo: 'primary' }),
        portal(),
        portal({
          id: 'portal-bloqueado',
          habilitada: false,
          motivo: 'El aviso todavía no tiene su archivo.',
          solucion: 'Prepara el archivo del aviso.',
        }),
        {
          id: 'cobranza',
          etiqueta: 'Ver la cobranza',
          tipo: 'default',
          habilitada: true,
          url: '/crm/cobranza/CXC-1',
        },
        {
          id: 'otra',
          etiqueta: 'Otra página',
          tipo: 'default',
          habilitada: true,
          url: 'https://example.test/',
        },
      ],
    })
    for (const link of [
      root.querySelector('[data-testid="inmo-siguiente-paso"]'),
      root.querySelector('[data-accion="portal"]'),
    ]) {
      expect(link.tagName).toBe('A')
      expect(link.getAttribute('href')).toBe(PORTAL_SAT)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
    // Blocked, it stays a button that says why.
    const bloqueado = root.querySelector('[data-accion="portal-bloqueado"]')
    expect(bloqueado.tagName).toBe('BUTTON')
    expect(bloqueado.hasAttribute('href')).toBe(false)
    // A page of the app goes through the router, in this tab, with the way back.
    const cobranza = root.querySelector('[data-accion="cobranza"]')
    expect(cobranza.getAttribute('href')).toMatch(
      /^\/cobranza\/CXC-1\?return_to=/,
    )
    expect(cobranza.hasAttribute('target')).toBe(false)
    // An address the app does not mark external does not lead out.
    const otra = root.querySelector('[data-accion="otra"]')
    expect(otra.hasAttribute('href')).toBe(false)
    expect(otra.hasAttribute('target')).toBe(false)
  })
})
