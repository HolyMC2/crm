// «Entregar turno» (crm.api.handover): the open work Hoy built, a note, one
// tap to hand over, and the owner's switch to stop asking for it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ call: vi.fn(), toast: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
    Button: {
      props: ['label', 'loading', 'variant'],
      emits: ['click'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h('button', { ...attrs, onClick: () => emit('click') }, p.label),
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, slots.default?.())
            : null,
    },
  }
})

import HandoverSheet from '@/components/hoy/HandoverSheet.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const PREPARE = {
  enabled: true,
  can_change: true,
  sections: [
    {
      key: 'taller_prometidos',
      title: 'Prometidos para hoy y sin terminar',
      count: 3,
      rows: [
        {
          title: 'iPhone 12 · Rosa Pérez',
          detail: 'Prometido hoy 17:00 · RO-00706',
          href: '/taller/orders/RO-00706',
        },
      ],
    },
  ],
  last: { name: 'n1', by_name: 'Tere', when: 'ayer a las 21:05' },
}

let app, root, events
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(prepare = PREPARE) {
  state.call.mockResolvedValueOnce(prepare)
  root = document.createElement('div')
  document.body.appendChild(root)
  events = { done: vi.fn(), close: vi.fn(), changed: vi.fn() }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { render: () => null } }],
  })
  app = createApp({
    render: () =>
      h(HandoverSheet, {
        open: true,
        onDone: events.done,
        onClose: events.close,
        onChanged: events.changed,
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(root)
  await flush()
}
const $ = (sel) => root.querySelector(sel)

afterEach(() => {
  app?.unmount()
  root?.remove()
  state.call.mockReset()
  state.toast.mockReset()
})

describe('Entregar turno', () => {
  it('shows what stays open, with the rest counted, and the last handover', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith('crm.api.handover.prepare')
    const section = $('[data-handover-section="taller_prometidos"]')
    expect(section.textContent).toContain('iPhone 12 · Rosa Pérez')
    expect(section.textContent).toContain('And 2 more')
    expect(section.querySelector('a').getAttribute('href')).toBe(
      '/taller/orders/RO-00706',
    )
    expect($('[data-handover-last]').textContent).toContain('Tere')
  })

  it('hands over with the note in one tap', async () => {
    await mount()
    const note = $('[data-handover-note]')
    note.value = 'El proveedor viene a las 11'
    note.dispatchEvent(new Event('input'))
    state.call.mockResolvedValueOnce({ message: 'Turno entregado.' })
    $('[data-handover-give]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith('crm.api.handover.hand_over', {
      note: 'El proveedor viene a las 11',
    })
    expect(state.toast).toHaveBeenCalledWith('Turno entregado.')
    expect(events.done).toHaveBeenCalled()
    expect(events.close).toHaveBeenCalled()
  })

  it('says so when nothing stays open', async () => {
    await mount({ ...PREPARE, sections: [] })
    expect($('[data-handover-clear]')).toBeTruthy()
    expect($('[data-handover-give]')).toBeTruthy()
  })

  it('lets the owner stop asking for it', async () => {
    await mount()
    state.call.mockResolvedValueOnce({ settings: { handover: false } })
    state.call.mockResolvedValueOnce({
      ...PREPARE,
      enabled: false,
      sections: [],
    })
    $('[data-handover-switch] [role="switch"], [data-handover-switch]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.handover.save_settings', {
      changes: { handover: false },
    })
    expect($('[data-handover-off]')).toBeTruthy()
    expect(events.changed).toHaveBeenCalled()
  })

  it('has no switch for someone who may not change it', async () => {
    await mount({ ...PREPARE, can_change: false })
    expect($('[data-handover-switch]')).toBeNull()
  })
})
