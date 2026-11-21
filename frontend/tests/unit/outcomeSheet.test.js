// «¿Qué pasó?» on a follow-up (crm.api.follow_up_outcomes): the ways to reach
// the person, one tap per outcome, and the second step for a time or a reason.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ call: vi.fn(), toast: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: (...args) => state.call(...args),
  toast: { success: (...args) => state.toast(...args), error: vi.fn() },
}))
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title, 'data-sub': p.subtitle }, [
                slots.default?.(),
              ])
            : null,
    },
  }
})

import OutcomeSheet from '@/components/hoy/OutcomeSheet.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const OPTIONS = {
  task: '41',
  modified: '2026-11-20 10:00:00',
  title: 'Dar seguimiento',
  kind: 'WhatsApp',
  open: true,
  attempts: 2,
  who: 'Rosa Pérez',
  detail: '',
  record: { doctype: 'CRM Deal', name: 'CRM-DEAL-1', label: 'Rosa Pérez' },
  reach: {
    phone: '+52 669 123 4567',
    call: 'tel:+526691234567',
    whatsapp: { kind: 'link', url: 'https://wa.me/526691234567?text=Hola' },
    message: 'Hola Rosa',
  },
  actions: [
    { key: 'answered', label: 'Contestó', ask: 'when' },
    { key: 'no_answer', label: 'No contestó', hint: 'Vuelve mañana.' },
    { key: 'lost', label: 'Ya no quiere', ask: 'reason' },
  ],
  whens: [
    { key: 'tomorrow', label: 'Mañana' },
    { key: 'none', label: 'Ya no sigue nada' },
  ],
  reasons: [{ value: 'Pricing', label: 'Precio' }],
  can_change: true,
}

let app, root, events
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(options = OPTIONS) {
  state.call.mockResolvedValueOnce(options)
  root = document.createElement('div')
  document.body.appendChild(root)
  events = { done: vi.fn(), close: vi.fn() }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { render: () => null } }],
  })
  app = createApp({
    render: () =>
      h(OutcomeSheet, {
        open: true,
        row: { doctype: 'CRM Task', name: 41, description: 'Dar seguimiento' },
        onDone: events.done,
        onClose: events.close,
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

describe('the follow-up outcome sheet', () => {
  it('offers WhatsApp with the text written, a call and the outcomes', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith(
      'crm.api.follow_up_outcomes.options',
      { task: '41' },
    )
    expect($('[data-outcome-whatsapp]').getAttribute('href')).toBe(
      OPTIONS.reach.whatsapp.url,
    )
    expect($('[data-outcome-call]').getAttribute('href')).toBe(
      'tel:+526691234567',
    )
    expect($('[data-outcome-message]').textContent).toContain('Hola Rosa')
    expect($('[data-outcome-attempts]').textContent).toContain('2')
    expect($('[data-sheet]').getAttribute('data-sub')).toBe('Rosa Pérez')
  })

  it('records an outcome that needs nothing else in one tap', async () => {
    await mount()
    state.call.mockResolvedValueOnce({ message: 'Anotado. Vuelve mañana.' })
    $('[data-outcome="no_answer"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.follow_up_outcomes.record',
      {
        task: '41',
        action: 'no_answer',
        modified: OPTIONS.modified,
        when: undefined,
        reason: undefined,
      },
    )
    expect(state.toast).toHaveBeenCalledWith('Anotado. Vuelve mañana.')
    expect(events.done).toHaveBeenCalled()
    expect(events.close).toHaveBeenCalled()
  })

  it('asks when the next follow-up is, then records it', async () => {
    await mount()
    $('[data-outcome="answered"]').click()
    await flush()
    expect($('[data-outcome-actions]')).toBeNull()
    expect($('[data-outcome-choice="none"]')).toBeTruthy()
    state.call.mockResolvedValueOnce({ message: 'Listo.' })
    $('[data-outcome-choice="tomorrow"]').click()
    await flush()
    expect(state.call.mock.calls.at(-1)[1]).toMatchObject({
      action: 'answered',
      when: 'tomorrow',
    })
  })

  it('asks why for «Ya no quiere»', async () => {
    await mount()
    $('[data-outcome="lost"]').click()
    await flush()
    state.call.mockResolvedValueOnce({ message: 'Anotado.' })
    $('[data-outcome-choice="Pricing"]').click()
    await flush()
    expect(state.call.mock.calls.at(-1)[1]).toMatchObject({
      action: 'lost',
      reason: 'Pricing',
    })
  })

  it('keeps the sheet open with the reason when the server refuses', async () => {
    await mount()
    state.call.mockRejectedValueOnce({
      messages: ['Alguien cambió este seguimiento hace un momento.'],
    })
    $('[data-outcome="no_answer"]').click()
    await flush()
    expect($('[data-outcome-problem]').textContent).toContain('Alguien cambió')
    expect(events.close).not.toHaveBeenCalled()
  })

  it('shows someone else’s follow-up without the outcomes', async () => {
    await mount({ ...OPTIONS, can_change: false })
    expect($('[data-outcome-actions]')).toBeNull()
    expect($('[data-outcome-readonly]')).toBeTruthy()
  })
})
