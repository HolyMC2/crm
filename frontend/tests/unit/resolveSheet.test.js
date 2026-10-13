// «Resolver» sheet (Atención a clientes): what it sends back and what it does when the
// server refuses because the customer wrote while the sheet was open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
let ids = 0
vi.mock('@/composables/useCompras', () => ({ requestId: () => `req-${++ids}` }))
const inbox = { resolvePreview: vi.fn(), resolveConversation: vi.fn() }
vi.mock('@/composables/inbox', () => ({
  resolvePreview: (...a) => inbox.resolvePreview(...a),
  resolveConversation: (...a) => inbox.resolveConversation(...a),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    FeatherIcon: { render: () => h('span') },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup: (props, { emit, attrs }) => () =>
        h(
          'button',
          {
            'data-testid': attrs['data-testid'],
            disabled: props.disabled,
            onClick: () => emit('click'),
          },
          props.label,
        ),
    },
    Dialog: {
      props: ['modelValue', 'options'],
      setup: (props, { slots }) => () =>
        props.modelValue
          ? h('div', { role: 'dialog' }, [
              slots['body-content']?.(),
              slots.actions?.(),
            ])
          : null,
    },
  }
})

import ResolveSheet from '@/components/doco/inbox/ResolveSheet.vue'

const flush = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
beforeEach(() => {
  push.mockReset()
  inbox.resolvePreview.mockReset()
  inbox.resolveConversation.mockReset()
})

async function mount(events) {
  // Closed first, as in the header: opening is what loads the preview.
  const open = ref(false)
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({
    render: () =>
      h(ResolveSheet, {
        modelValue: open.value,
        'onUpdate:modelValue': (value) => (open.value = value),
        doctype: 'CRM Deal',
        name: 'D-1',
        next: 'queue',
        onResolved: (out) => events.push(['resolved', out]),
        onShowMessage: () => events.push(['show-message']),
        onReply: () => events.push(['reply']),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  open.value = true
  await flush()
  return { el, open }
}

const testid = (el, id) => el.querySelector(`[data-testid="${id}"]`)

describe('Resolver sheet', () => {
  it('sends back the newest message it judged with «Resolver y siguiente»', async () => {
    inbox.resolvePreview.mockResolvedValue({
      ask: true,
      notice: { code: 'ask', message: 'We will ask', actions: [] },
      seen: '2026-10-13 10:50:00.123456',
    })
    inbox.resolveConversation.mockResolvedValue({
      ok: true,
      cleared: true,
      asked: true,
    })
    const events = []
    const { el, open } = await mount(events)
    testid(el, 'resolve-confirm').click()
    await flush()
    expect(inbox.resolveConversation).toHaveBeenCalledWith('CRM Deal', 'D-1', {
      ask: true,
      requestId: expect.any(String),
      seen: '2026-10-13 10:50:00.123456',
    })
    expect(events).toEqual([['resolved', { ok: true, cleared: true, asked: true }]])
    expect(open.value).toBe(false)
  })

  it('stays open on a refusal, never moves on, and leads to the new message', async () => {
    inbox.resolvePreview.mockResolvedValue({
      ask: true,
      notice: { code: 'ask', message: 'We will ask', actions: [] },
      seen: '2026-10-13 10:50:00',
    })
    inbox.resolveConversation.mockResolvedValue({
      ok: false,
      cleared: false,
      asked: false,
      notice: {
        code: 'new_message',
        message: 'The customer wrote again while you were resolving.',
        actions: [
          { label: 'See the new message', kind: 'call', target: 'show_message' },
        ],
      },
      seen: '2026-10-13 10:55:00',
    })
    const events = []
    const { el, open } = await mount(events)
    testid(el, 'resolve-confirm').click()
    await flush()
    // Nothing resolved: no «Siguiente», the sheet says why and offers the message.
    expect(events).toEqual([])
    expect(open.value).toBe(true)
    expect(testid(el, 'resolve-notice').textContent).toContain(
      'wrote again while you were resolving',
    )
    expect(testid(el, 'resolve-confirm')).toBeNull()
    testid(el, 'resolve-action-show_message').click()
    await flush()
    expect(events).toEqual([['show-message']])
    expect(open.value).toBe(false)
  })
})
