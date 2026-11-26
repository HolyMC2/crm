// «Avisos del asistente» (doco assistant/ronda/api.py): the owner switches the
// round on, picks areas, hour, quiet hours, the daily cap and the brain, and
// who receives; a manager sees only their own row. A tap saves at once and a
// refusal puts the screen back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

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
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    AppBar: { render: () => null },
    ListGroup: {
      setup:
        (_p, { slots }) =>
        () =>
          h('div', slots.default?.()),
    },
    Switch: {
      props: ['modelValue', 'label', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h('label', { ...attrs }, [
            h('span', p.label),
            h('button', {
              role: 'switch',
              'aria-checked': String(Boolean(p.modelValue)),
              disabled: p.disabled,
              onClick: () => emit('update:modelValue', !p.modelValue),
            }),
          ]),
    },
    Fab: {
      props: ['label'],
      setup:
        (p, { attrs }) =>
        () =>
          h('button', { 'data-fab': '', onClick: attrs.onClick }, p.label),
    },
  }
})

import AsistenteAvisos from '@/pages/AsistenteAvisos.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const OWNER = {
  dueno: true,
  negocio: {
    activo: true,
    areas: [
      { key: 'dinero', label: 'Dinero', on: true },
      { key: 'ventas', label: 'Ventas', on: true },
      { key: 'taller', label: 'Taller', on: false },
    ],
    hora: '08:30',
    silencio: '21:00-08:00',
    tope: 3,
    modelo: 'economico',
  },
  yo: {
    user: 'marco@example.com',
    nombre: 'Marco',
    rol: 'owner',
    activo: true,
    recibe: true,
    areas: [],
    hora: '',
    hora_negocio: '08:30',
    silencio: '',
    silencio_negocio: '21:00-08:00',
    canales: [
      { key: 'whatsapp', label: 'WhatsApp', linked: true, on: false },
      { key: 'telegram', label: 'Telegram', linked: false, on: false },
    ],
  },
  personas: [
    {
      user: 'ana@example.com',
      nombre: 'Ana López',
      rol: 'staff',
      activo: true,
      recibe: true,
      areas: [{ key: 'inventario', label: 'Inventario y compras', on: true }],
    },
  ],
  silenciados: [
    { name: 'HLZ-1', titulo: 'Cargo fuera de lo normal', area: 'Dinero' },
  ],
  horas: ['07:00', '08:30', '09:00'],
  topes: [1, 2, 3, 5],
}
const MANAGER = {
  ...OWNER,
  dueno: false,
  yo: {
    ...OWNER.yo,
    rol: 'staff',
    areas: [{ key: 'inventario', label: 'Inventario y compras', on: true }],
  },
  personas: [],
  silenciados: [],
}

let app
let host
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(page = OWNER) {
  state.call.mockResolvedValueOnce(JSON.parse(JSON.stringify(page)))
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(AsistenteAvisos) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(host)
  await flush()
}
const $ = (sel) => host.querySelector(sel)

afterEach(() => {
  app?.unmount()
  host?.parentNode?.removeChild(host)
  state.call.mockReset()
  state.toast.mockReset()
  state.error.mockReset()
})

describe('Avisos del asistente', () => {
  it('the owner sees the switch, the areas, the hour and who receives', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith(
      'doco.docoutils.assistant.ronda.api.pagina',
    )
    expect($('[data-avisos-estado]').textContent).toContain('8:30')
    expect(
      $('[data-avisos-activo] [role="switch"]').getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      $('[data-testid="avisos-area-dinero"]').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      $('[data-testid="avisos-area-taller"]').getAttribute('aria-pressed'),
    ).toBe('false')
    expect($('[data-avisos-persona="ana@example.com"]').textContent).toContain(
      'Ana López',
    )
    expect($('[data-avisos-silenciados]').textContent).toContain(
      'Cargo fuera de lo normal',
    )
    // a channel that is not linked says so and cannot be picked
    expect($('[data-testid="avisos-canal-telegram"]').disabled).toBe(true)
  })

  it('a tap saves at once and a refusal puts it back', async () => {
    await mount()
    state.call.mockResolvedValueOnce({
      ...OWNER,
      negocio: { ...OWNER.negocio, hora: '07:00' },
    })
    $('[data-testid="avisos-hora-07:00"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'doco.docoutils.assistant.ronda.api.guardar_negocio',
      {
        cambios: { hora: '07:00' },
      },
    )
    expect(
      $('[data-testid="avisos-hora-07:00"]').getAttribute('aria-pressed'),
    ).toBe('true')
    state.call.mockRejectedValueOnce(new Error('no'))
    $('[data-testid="avisos-area-taller"]').click()
    await flush()
    expect(state.error).toHaveBeenCalled()
    expect(
      $('[data-testid="avisos-area-taller"]').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('the owner turns the business off with one tap', async () => {
    await mount()
    state.call.mockResolvedValueOnce({
      ...OWNER,
      negocio: { ...OWNER.negocio, activo: false },
    })
    $('[data-avisos-activo] [role="switch"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'doco.docoutils.assistant.ronda.api.guardar_negocio',
      {
        cambios: { activo: 0 },
      },
    )
    expect($('[data-avisos-estado]').textContent).toContain('Off')
  })

  it('a manager sees only their own row', async () => {
    await mount(MANAGER)
    expect($('[data-avisos-negocio]')).toBeNull()
    expect($('[data-avisos-personas]')).toBeNull()
    expect($('[data-testid="avisos-mis-areas-inventario"]')).not.toBeNull()
    state.call.mockResolvedValueOnce(MANAGER)
    $('[data-testid="avisos-canal-whatsapp"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'doco.docoutils.assistant.ronda.api.guardar_persona',
      {
        cambios: { canales: ['whatsapp'] },
      },
    )
  })

  it('«Mándamelo ahora» asks for the brief', async () => {
    await mount()
    state.call.mockResolvedValueOnce({ ok: true, message: 'En camino' })
    $('[data-fab]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'doco.docoutils.assistant.ronda.api.probar',
    )
    expect(state.toast).toHaveBeenCalledWith('En camino')
  })
})
