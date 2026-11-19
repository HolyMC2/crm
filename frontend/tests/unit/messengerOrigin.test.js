// Messenger: who sent each reply, Meta's reply window, ticks and the «Sin asignar» chip.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import {
  orphanChip,
  originLabel,
  replyWindow,
  statusTick,
  windowNotice,
} from '../../src/utils/messengerOrigin.js'

const api = vi.hoisted(() => ({ calls: [], origins: {} }))
vi.mock('frappe-ui', () => ({
  Dropdown: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.(),
  }),
  call: async (url, args) => {
    api.calls.push([url, args])
    return api.origins
  },
}))
vi.mock('@/composables/useArchivos', () => ({ archivosHref: () => '#' }))
vi.mock('@/composables/muelleShell', () => ({ shellBoot: { value: {} } }))
vi.mock('@/vendor/muelle-shell/contracts', () => ({
  moduleEnabled: () => false,
}))
vi.mock('@/composables/useConversationArchivos', () => ({
  useConversationArchivos: () => ({
    saved: {},
    isBusy: () => false,
    refreshSaved() {},
    save() {},
    linkTo() {},
  }),
  whatsappSaveArgs: () => ({}),
  isWhatsappInboxMessage: () => false,
  collectFileUrls: () => [],
}))

const at = (s) => new Date(s.replace(' ', 'T')).getTime()
const NOW = at('2026-11-19 09:24:00')

describe('who sent a Messenger reply', () => {
  it('names the teammate, the bot, Meta and Meta’s automation', () => {
    const out = (extra) => originLabel({ direction: 'out', ...extra })
    expect(out({ sent_via: 'crm', sent_by: 'Tere López' }).text).toBe(
      'Tere López',
    )
    expect(out({ sent_via: 'bot' }).text).toBe('Bot')
    expect(out({ sent_via: 'meta' }).text).toBe('Desde Meta')
    const auto = out({ sent_via: 'meta_auto' })
    expect(auto.text).toBe('Automático de Meta')
    expect(auto.auto).toBe(true)
    expect(auto.title).toContain('sigue esperando')
  })

  it('labels nothing for the customer, our pending bubble or an older server', () => {
    expect(originLabel({ direction: 'in', sent_via: null })).toBeNull()
    expect(
      originLabel({ direction: 'out', sent_via: 'crm', _optimistic: true }),
    ).toBeNull()
    expect(originLabel({ direction: 'out' })).toBeNull()
  })

  it('ticks sent, delivered and read', () => {
    const tick = (status) => statusTick({ direction: 'out', status })
    expect(tick('sent').text).toBe('✓')
    expect(tick('delivered')).toMatchObject({ text: '✓✓', read: false })
    expect(tick('read')).toMatchObject({ text: '✓✓', read: true })
    expect(tick('failed').text).toBe('!')
    expect(statusTick({ direction: 'in', status: 'read' })).toBeNull()
  })
})

describe('Meta’s reply window', () => {
  const chat = [
    { direction: 'in', timestamp: '2026-11-18 15:36:36' },
    { direction: 'out', timestamp: '2026-11-18 15:36:39' },
    { direction: 'in', timestamp: '2026-11-18 15:36:49' },
  ]

  it('runs 24 h from the customer’s last message, then 7 days with the tag', () => {
    const win = replyWindow(chat, NOW)
    expect(win.state).toBe('open')
    expect(win.closesAt).toBe(at('2026-11-19 15:36:49'))
    expect(replyWindow(chat, at('2026-11-20 09:00:00')).state).toBe(
      'human_agent',
    )
    expect(replyWindow(chat, at('2026-11-26 09:00:00')).state).toBe('closed')
    expect(
      replyWindow([{ direction: 'out', timestamp: '2026-11-18' }]).state,
    ).toBe('none')
  })

  it('says how long is left, and what Meta allows after', () => {
    const open = windowNotice(replyWindow(chat, NOW), NOW)
    expect(open.text).toContain('quedan 6 h')
    expect(open.tone).toBe('gray')
    const soon = at('2026-11-19 13:00:00')
    expect(windowNotice(replyWindow(chat, soon), soon).tone).toBe('amber')
    const later = at('2026-11-21 09:00:00')
    expect(windowNotice(replyWindow(chat, later), later).text).toContain(
      'Agente humano',
    )
    const gone = at('2026-11-27 09:00:00')
    expect(windowNotice(replyWindow(chat, gone), gone)).toMatchObject({
      tone: 'red',
    })
  })
})

describe('«Sin asignar» Messenger chip', () => {
  const row = {
    last_channel: 'messenger',
    last_direction: 'in',
    waiting_since: '2026-11-18 15:36:36',
    reply_window: { last_incoming: '2026-11-18 15:36:49' },
  }

  it('says how long the customer waited and how much window is left', () => {
    expect(orphanChip(row, NOW)).toMatchObject({
      tone: 'gray',
      text: 'Esperando 17 h · quedan 6 h',
    })
    expect(
      orphanChip(row, at('2026-11-20 10:00:00')).text.startsWith(
        'Sin respuesta',
      ),
    ).toBe(true)
  })

  it('says where the answer came from', () => {
    const answered = { ...row, last_direction: 'out', waiting_since: null }
    expect(
      orphanChip({ ...answered, last_sent_via: 'meta' }, NOW),
    ).toMatchObject({ tone: 'green', text: 'Respondido · Meta' })
    expect(
      orphanChip(
        { ...answered, last_sent_via: 'crm', last_sent_by: 'Tere' },
        NOW,
      ).title,
    ).toBe('Respondió Tere')
  })

  it('gives WhatsApp rows WhatsApp’s rule: 24 h, then only a template', () => {
    const wa = { ...row, last_channel: 'whatsapp' }
    expect(orphanChip(wa, NOW).text).toBe('Esperando 17 h · quedan 6 h')
    const late = orphanChip(wa, at('2026-11-21 10:00:00'))
    expect(late.text.startsWith('Sin respuesta')).toBe(true)
    expect(late.title).toContain('plantilla')
    expect(
      orphanChip(
        {
          last_channel: 'whatsapp',
          last_direction: 'out',
          last_sent_via: 'phone',
        },
        NOW,
      ),
    ).toMatchObject({ text: 'Respondido · Celular' })
  })

  it('stays off rows from an older server', () => {
    expect(
      orphanChip({ last_channel: 'whatsapp', last_direction: 'in' }),
    ).toBeNull()
    expect(orphanChip({ last_channel: 'messenger' })).toBeNull()
    expect(
      orphanChip({ last_channel: 'email', last_direction: 'in' }),
    ).toBeNull()
  })
})

describe('WhatsApp’s reply window', () => {
  const chat = [{ direction: 'in', timestamp: '2026-11-18 15:36:49' }]
  it('has no human-agent days: past 24 h only a template goes out', () => {
    expect(replyWindow(chat, NOW, 'whatsapp').state).toBe('open')
    const late = at('2026-11-26 09:00:00')
    const win = replyWindow(chat, late, 'whatsapp')
    expect(win.state).toBe('template')
    expect(windowNotice(win, late).text).toContain('plantilla aprobada')
  })
})

describe('MessengerArea', () => {
  let app
  let el
  afterEach(() => {
    app?.unmount()
    el?.remove()
    api.calls = []
    api.origins = {}
    vi.useRealTimers()
  })

  async function render(props) {
    const { default: MessengerArea } = await import(
      '../../src/components/Activities/MessengerArea.vue'
    )
    el = document.createElement('div')
    document.body.appendChild(el)
    app = createApp({ render: () => h(MessengerArea, props) })
    app.mount(el)
    await nextTick()
    await nextTick()
    return el
  }

  const texts = (root, id) =>
    [...root.querySelectorAll(`[data-testid="${id}"]`)].map((n) =>
      n.textContent.trim(),
    )

  it('labels each reply, outlines Meta’s automatic one and shows the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const msg = (id, direction, timestamp, extra = {}) => ({
      id,
      channel: 'messenger',
      direction,
      timestamp,
      content: id,
      ...extra,
    })
    const root = await render({
      messages: [
        msg('buenas', 'in', '2026-11-18 15:36:36'),
        msg('Hola, gracias', 'out', '2026-11-18 15:36:39', {
          sent_via: 'meta_auto',
          status: 'sent',
        }),
        msg('fundas', 'in', '2026-11-18 15:36:49'),
        msg('Sí tenemos', 'out', '2026-11-19 09:00:00', {
          sent_via: 'crm',
          sent_by: 'Tere',
          status: 'read',
        }),
      ],
    })
    expect(texts(root, 'messenger-origin')).toEqual([
      'Automático de Meta ·',
      'Tere ·',
    ])
    expect(texts(root, 'messenger-tick')).toEqual(['✓', '✓✓'])
    expect(root.querySelector('.border-dashed').textContent).toContain(
      'Hola, gracias',
    )
    expect(texts(root, 'messenger-window')[0]).toContain('quedan 6 h')
  })

  it('asks who sent the replies of a Conversaciones history', async () => {
    api.origins = { 'MM-2': { sent_via: 'meta', sent_by: null, auto: false } }
    const root = await render({
      conversation: { provider: 'Messenger' },
      messages: [
        {
          id: 'MM-1',
          direction: 'in',
          content: 'hola',
          timestamp: '2026-11-18 15:36:36',
        },
        {
          id: 'MM-2',
          direction: 'out',
          content: 'Buen día',
          timestamp: '2026-11-18 15:40:00',
          status: 'sent',
        },
      ],
    })
    await nextTick()
    expect(api.calls).toEqual([
      ['doco_marketing.api.inbox.get_messenger_origins', { names: ['MM-2'] }],
    ])
    expect(texts(root, 'messenger-origin')).toEqual(['Desde Meta ·'])
  })

  it('leaves the window line to the composer when asked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const root = await render({
      window: false,
      messages: [
        {
          id: 'a',
          channel: 'messenger',
          direction: 'in',
          content: 'hola',
          timestamp: '2026-11-18 15:36:49',
        },
      ],
    })
    expect(texts(root, 'messenger-window')).toEqual([])
  })

  it('leaves WhatsApp and Webchat histories alone', async () => {
    const root = await render({
      conversation: { provider: 'Webchat' },
      messages: [
        {
          id: 'W-1',
          direction: 'in',
          content: 'hola',
          timestamp: '2026-11-18 15:36:36',
        },
        {
          id: 'W-2',
          direction: 'out',
          content: 'hola',
          timestamp: '2026-11-18 15:37:00',
        },
      ],
    })
    expect(api.calls).toEqual([])
    expect(texts(root, 'messenger-window')).toEqual([])
    expect(texts(root, 'messenger-origin')).toEqual([])
  })
})
