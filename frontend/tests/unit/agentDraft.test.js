import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import AgentActionSummary from '@/components/doco/inbox/AgentActionSummary.vue'
import {
  agentReason,
  holdDone,
  holdLines,
  isHold,
  linkLine,
} from '@/components/doco/inbox/agentDraft'

const hold = {
  source: 'customer_hold:apartado',
  action: {
    kind: 'apartado',
    item: 'BLU G53',
    option: 'Negro 128GB',
    qty: 1,
    price: '$3,499.00',
    customer_name: 'Ana',
    pickup_when: 'mañana',
  },
}
function mount(row) {
  const root = document.createElement('div')
  createApp({ render: () => h(AgentActionSummary, { row }) }).mount(root)
  return root
}

const link = {
  source: 'customer_agent',
  trigger: 'agent:payment_link',
  action: {
    kind: 'payment_link',
    amount: '$500.00',
    folio: 'RO-00731',
    invoice: 'SINV-1',
  },
}

describe('agent drafts in Por aprobar', () => {
  it('says why the reply waits', () => {
    expect(agentReason('agent:ungrounded:$700')).toContain('$700')
    expect(agentReason('agent:promise')).toBe(
      'Asistente: promete algo al cliente',
    )
    expect(agentReason('agent:borrador')).toBe('Asistente para clientes')
    expect(agentReason('agent:payment_link')).toBe(
      'Asistente: lleva un enlace de pago',
    )
    expect(agentReason('agent:hold')).toBe('Asistente: el cliente pide apartar')
  })

  it('reads a hold as what, its price and for whom', () => {
    expect(isHold(hold)).toBe(true)
    expect(isHold(link)).toBe(false)
    expect(holdLines(hold.action)).toEqual({
      what: '1 × BLU G53 (Negro 128GB)',
      price: '$3,499.00',
      who: 'Para Ana, pasa mañana',
    })
    expect(holdLines({ ...hold.action, pickup_when: '' }).who).toBe('Para Ana')
  })

  it('says that approving a reply also sends the payment link', () => {
    expect(linkLine(link.action)).toBe(
      'Se agrega el enlace de pago por $500.00 (RO-00731)',
    )
    expect(linkLine(hold.action)).toBe('')
  })

  it('tells the manager the folio, and when the customer did not hear it', () => {
    expect(holdDone({ order: 'SO-1', notified: true })).toEqual({
      ok: true,
      text: 'Apartado SO-1',
    })
    const failed = holdDone({ order: 'SO-1', notified: false })
    expect(failed.ok).toBe(false)
    expect(failed.text).toContain('escríbele por el chat')
  })

  it('shows the hold above the text and the link line on a reply', () => {
    const card = mount(hold)
    expect(
      card.querySelector('[data-testid="hold-summary"]').textContent,
    ).toContain('1 × BLU G53 (Negro 128GB)')
    expect(card.textContent).toContain('Para Ana, pasa mañana')
    const reply = mount(link)
    expect(
      reply.querySelector('[data-testid="link-summary"]').textContent,
    ).toContain('$500.00')
    const plain = mount({ source: 'customer_agent', action: null })
    expect(plain.innerHTML).not.toContain('hold-summary')
  })
})
