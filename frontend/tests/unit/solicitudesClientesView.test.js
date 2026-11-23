// «Solicitudes de clientes»: the view model over the cell's queue
// (doco.docoutils.storefront_support_staff). Chips with «Todas» first, the
// rows' words and chips, the sheet's facts, links and buttons, what a step
// sends and the toast after it.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ALL,
  actionButtons,
  citasLink,
  detailFacts,
  detailSubtitle,
  documentLink,
  doorLine,
  dueChip,
  emptyText,
  guideText,
  hasMessage,
  itemRow,
  itemRows,
  MODES,
  modeChoice,
  modeLabel,
  queueChips,
  reachLinks,
  stateChip,
  stepPayload,
  stepProblem,
  stepToast,
  tellsCustomer,
  whenText,
} from '@/components/solicitudesClientes/view'

const NOW = new Date(2026, 10, 23, 12, 0) // Mon 23 Nov 2026, local

beforeEach(() => {
  globalThis.__ = (value, args) =>
    String(value).replace(/\{(\d+)\}/g, (m, i) => args?.[i] ?? m)
})

const item = (extra = {}) => ({
  id: 'rr:abc123',
  queue: 'devoluciones',
  kind: 'devolucion',
  reason: 'defectuoso',
  who: 'Ana López',
  date: '2026-11-21T10:00:00',
  due: null,
  overdue: false,
  state: 'open',
  ref: { doctype: 'Sales Order', name: 'SAL-ORD-0001' },
  amount: 1250,
  currency: 'MXN',
  ...extra,
})

describe('the queue chips', () => {
  it('«Todas» leads, then each queue the cell sent, with what waits', () => {
    const chips = queueChips([
      { key: 'devoluciones', count: 2, overdue: 0 },
      { key: 'todas', count: 5, overdue: 1 },
      { key: 'datos', count: 3, overdue: 1 },
      { key: 'sorteos', count: 9, overdue: 0 },
    ])
    expect(chips.map((chip) => [chip.value, chip.label, chip.count])).toEqual([
      ['', 'All', 5],
      ['devoluciones', 'Returns', 2],
      ['datos', 'Personal data', 3],
    ])
    expect(chips[0].title).toBe('1 overdue')
    expect(chips[1].title).toBeUndefined()
    expect(ALL).toBe('todas')
  })

  it('nothing sent, no chips', () => {
    expect(queueChips(null)).toEqual([])
  })
})

describe('a row', () => {
  it('says who, what, why and when, with the money and the state', () => {
    const row = itemRow(item(), NOW)
    expect(row).toEqual({
      id: 'rr:abc123',
      who: 'Ana López',
      line: 'Return, defective, 21 nov',
      icon: 'lucide-undo-2',
      amount: '$1,250.00',
      due: null,
      state: { label: 'New', tone: 'info' },
    })
  })

  it('a privacy request shows its legal day, red once past', () => {
    const late = itemRow(
      item({
        queue: 'datos',
        kind: 'acceso',
        reason: null,
        due: '2026-11-20',
        amount: null,
      }),
      NOW,
    )
    expect(late.line).toBe('Wants to see their data, 21 nov')
    expect(late.due).toEqual({ label: 'Overdue since 20 nov', tone: 'danger' })
    expect(late.state).toBeNull()
    expect(late.amount).toBe('')
    expect(dueChip(item({ queue: 'datos', due: '2026-11-23' }), NOW)).toEqual({
      label: 'Due today',
      tone: 'warning',
    })
    expect(dueChip(item({ queue: 'datos', due: '2026-11-25' }), NOW).tone).toBe(
      'warning',
    )
    expect(dueChip(item({ queue: 'datos', due: '2026-12-21' }), NOW)).toEqual({
      label: 'Due 21 dic',
      tone: 'neutral',
    })
  })

  it('a return shows its scheduled pickup or visit', () => {
    expect(
      dueChip(item({ due: '2026-11-25', state: 'in_progress' }), NOW),
    ).toEqual({
      label: 'Scheduled 25 nov',
      tone: 'neutral',
    })
    expect(
      dueChip(item({ due: '2026-11-23', state: 'in_progress' }), NOW).label,
    ).toBe('Scheduled today')
    expect(
      dueChip(item({ due: '2026-11-20', state: 'in_progress' }), NOW).tone,
    ).toBe('danger')
  })

  it('the chip names what was scheduled: pickup, visit or hand-over at the shop', () => {
    const at = (mode, due = '2026-11-25') =>
      dueChip(
        item({
          due,
          state: 'in_progress',
          scheduled: { mode, when: `${due}T10:30` },
        }),
        NOW,
      )
    expect(at('recoleccion').label).toBe('Pickup 25 nov')
    expect(at('visita').label).toBe('Visit 25 nov')
    expect(at('entrega_en_tienda').label).toBe('At the shop 25 nov')
    expect(at('entrega_en_tienda', '2026-11-23')).toEqual({
      label: 'At the shop today',
      tone: 'warning',
    })
    expect(at('recoleccion', '2026-11-20').tone).toBe('danger')
    expect(
      itemRow(
        item({
          due: '2026-11-25',
          state: 'in_progress',
          scheduled: { mode: 'visita', when: '2026-11-25T10:30' },
        }),
        NOW,
      ).due.label,
    ).toBe('Visit 25 nov')
  })

  it('three ways to schedule, as the cell takes them', () => {
    expect(MODES).toEqual(['recoleccion', 'visita', 'entrega_en_tienda'])
    expect(MODES.map(modeChoice)).toEqual([
      'We pick it up',
      'They bring it',
      'They collect it at the shop',
    ])
    expect(MODES.map(modeLabel)).toEqual([
      'Pickup',
      'Visit to the shop',
      'Hand-over at the shop',
    ])
    expect(
      stepProblem('programar', {
        mode: 'entrega_en_tienda',
        when: '2026-11-26 17:00',
      }),
    ).toBe('')
    expect(
      stepPayload('rr:1', 'programar', {
        mode: 'entrega_en_tienda',
        when: '2026-11-26 17:00',
        reason: ' Trae tu ticket ',
      }),
    ).toEqual({
      id: 'rr:1',
      action: 'programar',
      mode: 'entrega_en_tienda',
      when: '2026-11-26T17:00',
      reason: 'Trae tu ticket',
    })
  })

  it('a closed request has no due chip, only its state', () => {
    const row = itemRow(
      item({ queue: 'datos', due: '2026-11-20', state: 'closed' }),
      NOW,
    )
    expect(row.due).toBeNull()
    expect(row.state).toEqual({ label: 'Closed', tone: 'neutral' })
  })

  it('money that waits for a person says what is wrong', () => {
    const row = itemRow(
      item({
        id: 'dp:SFDP-1',
        queue: 'pagos',
        kind: 'pago',
        reason: 'unbooked',
        amount: 900,
        currency: 'USD',
      }),
      NOW,
    )
    expect(row.line).toBe('Online payment, charged but not recorded, 21 nov')
    expect(row.icon).toBe('lucide-hand-coins')
    expect(row.amount).toBe('USD 900.00')
  })

  it('a queue keeps its own rows; «Todas» keeps every row', () => {
    const items = [item(), item({ id: 'ld:1', queue: 'datos', kind: 'acceso' })]
    expect(itemRows(items, '', NOW).map((row) => row.id)).toEqual([
      'rr:abc123',
      'ld:1',
    ])
    expect(itemRows(items, 'datos', NOW).map((row) => row.id)).toEqual(['ld:1'])
  })

  it('every state has its words', () => {
    expect(stateChip('in_progress')).toEqual({
      label: 'In progress',
      tone: 'neutral',
    })
    expect(stateChip('resolved')).toEqual({
      label: 'Resolved',
      tone: 'success',
    })
    expect(stateChip('rejected').label).toBe('Rejected')
    expect(stateChip('nope')).toBeNull()
  })

  it('an empty list says why', () => {
    expect(emptyText('', false).title).toBe('Nothing waiting')
    expect(emptyText('datos', false).title).toBe(
      'Nothing waiting in Personal data',
    )
    expect(emptyText('', true).title).toBe('Nothing closed in the last 60 days')
  })
})

describe('the sheet', () => {
  const detail = (extra = {}) => ({
    ...item(),
    words: 'La pantalla parpadea',
    contact: { email: 'ana@example.com', phone: '+52 55 1234 5678' },
    customer: { name: 'CUST-0001', label: 'Ana López' },
    documents: [],
    history: [],
    actions: ['aceptar', 'programar', 'rechazar', 'resolver'],
    citas: null,
    scheduled: null,
    notifies: true,
    ...extra,
  })

  it('links each document to its page in the shell or its own app', () => {
    expect(documentLink({ doctype: 'Sales Order', name: 'SO 1' })).toEqual({
      to: { path: '/documentos/pedidos/SO%201' },
    })
    expect(documentLink({ doctype: 'POS Invoice', name: 'T-1' })).toEqual({
      to: { path: '/documentos/tickets/T-1' },
    })
    expect(documentLink({ doctype: 'Repair Order', name: 'RO-00706' })).toEqual(
      {
        href: '/taller/orders/RO-00706',
      },
    )
    expect(documentLink({ doctype: 'Customer', name: 'CUST 1' })).toEqual({
      to: '/contactos/customer/CUST%201',
    })
    expect(
      documentLink({ doctype: 'Storefront Debt Payment', name: 'SFDP-1' }),
    ).toEqual({
      to: { path: '/documentos/tipo/Storefront%20Debt%20Payment/SFDP-1' },
    })
    expect(documentLink(null)).toBeNull()
  })

  it('the facts in reading order, the purchase and the customer as links', () => {
    const facts = detailFacts(
      detail({
        scheduled: { mode: 'recoleccion', when: '2026-11-25T10:30' },
        documents: [{ doctype: 'Sales Invoice', name: 'SINV-9' }],
      }),
      { now: NOW },
    )
    expect(facts.map((fact) => [fact.key, fact.label, fact.value])).toEqual([
      ['ref', 'Order', 'SAL-ORD-0001'],
      ['customer', 'Customer', 'Ana López'],
      ['amount', 'Amount', '$1,250.00'],
      ['reason', 'Why', 'Defective'],
      ['date', 'Asked', '21 nov 10:00'],
      ['scheduled', 'Pickup', '25 nov, 10:30'],
      ['doc:Sales Invoice:SINV-9', 'Invoice', 'SINV-9'],
    ])
    expect(facts[0].link).toEqual({
      to: { path: '/documentos/pedidos/SAL-ORD-0001' },
    })
    expect(facts[1].link).toEqual({ to: '/contactos/customer/CUST-0001' })
    expect(facts[2].link).toBeUndefined()
  })

  it('the schedule’s note is a fact of its own', () => {
    const facts = detailFacts(
      detail({
        scheduled: {
          mode: 'entrega_en_tienda',
          when: '2026-11-26T17:00',
          note: 'Trae tu ticket',
        },
      }),
      { now: NOW },
    )
    const byKey = Object.fromEntries(
      facts.map((fact) => [fact.key, [fact.label, fact.value]]),
    )
    expect(byKey.scheduled).toEqual([
      'Hand-over at the shop',
      whenText('2026-11-26T17:00', NOW),
    ])
    expect(byKey['scheduled-note']).toEqual(['Note', 'Trae tu ticket'])
    const none = detailFacts(
      detail({
        scheduled: { mode: 'visita', when: '2026-11-26T17:00', note: null },
      }),
      { now: NOW },
    )
    expect(none.some((fact) => fact.key === 'scheduled-note')).toBe(false)
  })

  it('the line under the name: what and why', () => {
    expect(detailSubtitle(detail())).toBe('Return, defective')
    expect(detailSubtitle(detail({ kind: 'acceso', reason: null }))).toBe(
      'Wants to see their data',
    )
    expect(detailSubtitle(null)).toBe('')
  })

  it('a day without an hour reads as the day alone', () => {
    expect(whenText('2026-11-25T00:00', NOW)).toBe('25 nov')
    expect(whenText('', NOW)).toBe('')
  })

  it('the ways to reach the person', () => {
    expect(
      reachLinks(detail().contact).map((link) => [link.key, link.href]),
    ).toEqual([
      ['llamar', 'tel:+525512345678'],
      ['whatsapp', 'https://wa.me/525512345678'],
      ['correo', 'mailto:ana@example.com'],
    ])
    expect(reachLinks({ email: 'no es correo', phone: '123' })).toEqual([])
    expect(reachLinks(null)).toEqual([])
  })

  it('one filled button: the next step, last', () => {
    expect(actionButtons(detail())).toEqual([
      { action: 'rechazar', label: 'Reject', primary: false },
      { action: 'programar', label: 'Schedule', primary: false },
      { action: 'resolver', label: 'Mark resolved', primary: false },
      { action: 'aceptar', label: 'Accept', primary: true },
    ])
    expect(
      actionButtons(
        detail({
          state: 'in_progress',
          actions: ['programar', 'rechazar', 'resolver'],
        }),
      ).at(-1),
    ).toEqual({ action: 'resolver', label: 'Mark resolved', primary: true })
    const closedAccount = actionButtons(
      detail({
        queue: 'bajas',
        kind: 'baja',
        actions: ['aceptar', 'resolver'],
      }),
    )
    expect(closedAccount).toEqual([
      { action: 'aceptar', label: 'Start', primary: false },
      { action: 'resolver', label: 'Mark resolved', primary: true },
    ])
    const unbooked = detail({
      queue: 'pagos',
      kind: 'pago',
      reason: 'unbooked',
      actions: ['resolver', 'reintentar'],
    })
    expect(actionButtons(unbooked).at(-1)).toEqual({
      action: 'reintentar',
      label: 'Retry',
      primary: true,
    })
    expect(
      actionButtons({ ...unbooked, reason: 'unknown' }).at(-1).action,
    ).toBe('resolver')
    expect(actionButtons(detail({ actions: [] }))).toEqual([])
  })

  it('the message box only where a step reaches the customer', () => {
    expect(hasMessage(detail())).toBe(true)
    expect(hasMessage(detail({ notifies: false }))).toBe(false)
    expect(
      hasMessage(
        detail({
          queue: 'pagos',
          kind: 'pago',
          actions: ['resolver', 'reintentar'],
        }),
      ),
    ).toBe(false)
    expect(tellsCustomer(detail({ queue: 'datos' }), 'programar')).toBe(false)
    expect(tellsCustomer(detail({ queue: 'datos' }), 'rechazar')).toBe(true)
  })

  it('a refusal says why; a schedule needs pickup or visit and the day', () => {
    expect(stepProblem('rechazar', { reason: ' ' })).toBe(
      'Write why: the customer reads it.',
    )
    expect(stepProblem('rechazar', { reason: 'Daño por agua' })).toBe('')
    expect(stepProblem('aceptar', { reason: '' })).toBe('')
    expect(stepProblem('aceptar', { reason: 'x'.repeat(241) })).toBe(
      'At most 240 characters.',
    )
    expect(stepProblem('programar', { mode: '', when: '' })).toBe(
      'Choose pickup or visit.',
    )
    expect(stepProblem('programar', { mode: 'visita', when: '' })).toBe(
      'Choose the day.',
    )
    expect(
      stepProblem('programar', { mode: 'visita', when: '2026-11-25 10:30:00' }),
    ).toBe('')
  })

  it('what a step sends', () => {
    expect(stepPayload('rr:1', 'aceptar', { reason: '  ' })).toEqual({
      id: 'rr:1',
      action: 'aceptar',
    })
    expect(
      stepPayload('rr:1', 'rechazar', { reason: ' Daño por agua ' }),
    ).toEqual({
      id: 'rr:1',
      action: 'rechazar',
      reason: 'Daño por agua',
    })
    expect(
      stepPayload('rr:1', 'programar', {
        reason: '',
        mode: 'recoleccion',
        when: '2026-11-25 10:30:00',
      }),
    ).toEqual({
      id: 'rr:1',
      action: 'programar',
      mode: 'recoleccion',
      when: '2026-11-25T10:30',
    })
  })

  it('the toast says the verb and whether the customer was told', () => {
    expect(stepToast('aceptar', true, detail())).toBe(
      'Accepted. The customer sees it in their app.',
    )
    expect(stepToast('rechazar', false, detail())).toBe(
      'Rejected. Tell the customer by WhatsApp or email.',
    )
    expect(
      stepToast('resolver', false, detail({ queue: 'pagos', kind: 'pago' })),
    ).toBe('Marked resolved.')
    expect(
      stepToast('aceptar', false, detail({ queue: 'bajas', kind: 'baja' })),
    ).toBe('Started.')
    expect(
      stepToast('reintentar', false, detail({ queue: 'pagos', kind: 'pago' })),
    ).toBe('Asked the gateway again.')
  })

  it('a guiding sentence for closed accounts and money', () => {
    expect(guideText(detail({ queue: 'bajas' }))).toContain(
      'invoices and fiscal records stay',
    )
    expect(guideText(detail({ queue: 'pagos', reason: 'review' }))).toContain(
      'Never refund it',
    )
    expect(guideText(detail())).toBe('')
  })

  it('the appointments link carries the customer’s contact', () => {
    expect(citasLink(null)).toBeNull()
    expect(citasLink({ contact: 'CONT-1', contact_label: 'Ana López' })).toBe(
      '/agenda?new_cita=1&contact=CONT-1&contact_label=Ana+L%C3%B3pez',
    )
    expect(citasLink({ contact: null, contact_label: 'Ana' })).toBe(
      '/agenda?new_cita=1',
    )
  })
})

describe('the door on /negocio/app-clientes', () => {
  it('says what waits', () => {
    expect(doorLine({ count: 0, urgent: false })).toBe('Nothing waiting')
    expect(doorLine({ count: 1, urgent: false })).toBe('1 waiting')
    expect(doorLine({ count: 4, urgent: true })).toBe('4 waiting')
    expect(doorLine(null)).toBe('Nothing waiting')
  })
})
