// Equipo (/crm/equipo) for the owner's first hour: «Invitar a alguien» for every
// puesto where there is no «Agregar técnico», and Hoy's «Agregar técnico»
// (?alta=tecnico) opens the alta at once and comes back to Hoy when it closes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ boot: null, api: vi.fn(), phone: null }))
vi.mock('@/composables/breakpoint', async (importOriginal) => {
  const { ref } = await import('vue')
  state.phone = ref(false)
  return { ...(await importOriginal()), isMobile: state.phone }
})
vi.mock('@/composables/useEquipo', async (importOriginal) => {
  const { ref } = await import('vue')
  state.boot = ref(null)
  return {
    ...(await importOriginal()),
    equipoBoot: state.boot,
    loadEquipoBoot: async () => state.boot.value,
    equipoApi: (...args) => state.api(...args),
  }
})
vi.mock('@/components/shell/ModuleLayout.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      setup:
        (_, { slots }) =>
        () =>
          h('main', slots.default?.()),
    },
  }
})
vi.mock('@/components/primeros/InvitarSheet.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: {
      props: ['open'],
      setup: (props) => () =>
        props.open ? h('section', { 'data-testid': 'invitar-hoja' }) : null,
    },
  }
})

import { RouterView } from 'vue-router'
import Equipo from '@/pages/Equipo.vue'

let app, root, router
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(path, capabilities) {
  state.boot.value = { enabled: true, capabilities }
  const page = { render: () => h('p', 'page') }
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/equipo', name: 'Equipo', component: Equipo },
      { path: '/hoy', name: 'Hoy', component: page },
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
  app.mount(root)
  await flush()
}

const alta = { opts: null }
beforeEach(() => {
  window.__ = (text) => text
  state.api.mockReset()
  state.api.mockResolvedValue({ rows: [], counts: {} })
  alta.opts = null
  window.muelleEquipo = { openAlta: (opts) => (alta.opts = opts) }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  delete window.muelleEquipo
  state.phone.value = false
})

describe('inviting from Equipo', () => {
  it('without «Agregar técnico», the phone’s one FAB invites', async () => {
    state.phone.value = true
    await mount('/equipo', { read: true, hire: false, invite: true })
    expect(root.querySelector('[data-testid="equipo-invitar"]')).toBeNull()
    const fab = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Invite someone'),
    )
    fab.click()
    await flush()
    expect(root.querySelector('[data-testid="invitar-hoja"]')).not.toBeNull()
  })

  it('beside «Agregar técnico», the invitation is a header button', async () => {
    await mount('/equipo', { read: true, hire: true, invite: true })
    root.querySelector('[data-testid="equipo-invitar"]').click()
    await flush()
    expect(root.querySelector('[data-testid="invitar-hoja"]')).not.toBeNull()
  })

  it('someone who may not invite sees no invitation', async () => {
    await mount('/equipo', { read: true, hire: false, invite: false })
    expect(root.querySelector('[data-testid="equipo-invitar"]')).toBeNull()
  })
})

describe('Hoy’s «Agregar técnico»', () => {
  const FROM_HOY =
    '/equipo?alta=tecnico&return_to=%2Fcrm%2Fhoy&return_label=Hoy'

  it('opens the alta at once and, once added, goes back to Hoy saying so', async () => {
    await mount(FROM_HOY, { read: true, hire: true, invite: true })
    expect(alta.opts).not.toBeNull()
    expect(router.currentRoute.value.query).toEqual({}) // a reload does not reopen it
    alta.opts.onDone({})
    expect(router.currentRoute.value.path).toBe('/equipo') // the receipt and its link first
    alta.opts.onClose()
    await flush()
    expect(router.currentRoute.value.path).toBe('/hoy')
    expect(router.currentRoute.value.query).toEqual({ done: 'tecnico' })
  })

  it('closed without adding, it still goes back to Hoy, with nothing to report', async () => {
    await mount(FROM_HOY, { read: true, hire: true })
    alta.opts.onClose()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe('/hoy')
  })

  it('a site without technicians opens nothing', async () => {
    await mount(FROM_HOY, { read: true, hire: false, invite: true })
    expect(alta.opts).toBeNull()
  })
})
