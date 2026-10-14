// Cobranza power worklist, pure parts: the URL as the list's state, keyboard
// keys (never a reserved or global one), selection, follow-up chips, the
// payment's allocation and the reasons «Registrar pago» explains.
import { describe, expect, it } from 'vitest'
import {
  QUEUE_KEYS,
  RECORD_KEYS,
  addDays,
  allocatePayment,
  bulkSummary,
  customerHref,
  followupChip,
  followupPresets,
  invoiceAction,
  keyAction,
  listHref,
  listMemoryKey,
  moveFocus,
  normalizeAging,
  owedSplit,
  paymentProblem,
  queueQuery,
  queueShortcuts,
  queueState,
  rangeKeys,
  recordShortcuts,
  secondaryActions,
} from '@/composables/useCobranza'
import { KEYMAP, RESERVED_COMBOS } from '@/vendor/muelle-shell/contracts'

const key = (k, extra = {}) => ({ key: k, ...extra })

describe('Cobranza URL state', () => {
  it('reads every filter from the URL and drops what is unknown', () => {
    expect(
      queueState({
        segment: 'mios',
        q: 'ana',
        company: 'Tienda',
        edad: '31-60',
        cliente: 'CUST-1',
      }),
    ).toEqual({
      segment: 'mios',
      q: 'ana',
      company: 'Tienda',
      edad: '31-60',
      cliente: 'CUST-1',
    })
    expect(queueState({ segment: 'x', edad: '7-8', q: ['a'] })).toEqual({
      segment: 'vencidas',
      q: '',
      company: '',
      edad: '',
      cliente: '',
    })
    expect(normalizeAging('90+')).toBe('90+')
  })

  it('patches the query and leaves empty values out', () => {
    expect(
      queueQuery(
        { segment: 'todas', q: 'ana', cliente: 'C1' },
        { q: '', edad: '0-30' },
      ),
    ).toEqual({ segment: 'todas', cliente: 'C1', edad: '0-30' })
  })

  it('remembers scroll per list, never per focused customer', () => {
    const a = listMemoryKey({ segment: 'todas', edad: '31-60', cliente: 'A' })
    const b = listMemoryKey({ segment: 'todas', edad: '31-60', cliente: 'B' })
    expect(a).toBe(b)
    expect(a).not.toBe(listMemoryKey({ segment: 'todas', edad: '0-30' }))
  })

  it('builds the list and record paths a return goes back to', () => {
    expect(listHref({ segment: 'todas', cliente: 'Ana Pérez' })).toBe(
      '/cobranza?segment=todas&cliente=Ana%20P%C3%A9rez',
    )
    expect(listHref({})).toBe('/cobranza')
    expect(
      customerHref('Ana Pérez', { company: 'Tienda', list: '/cobranza?x=1' }),
    ).toBe(
      '/crm/cobranza/cliente/Ana%20P%C3%A9rez?company=Tienda&list=%2Fcobranza%3Fx%3D1',
    )
  })
})

describe('Cobranza keyboard', () => {
  it('moves the focus and extends a selection like a mail list', () => {
    const keys = ['a', 'b', 'c', 'd']
    expect(moveFocus(keys, '', 1)).toBe('a')
    expect(moveFocus(keys, 'a', 1)).toBe('b')
    expect(moveFocus(keys, 'd', 1)).toBe('d')
    expect(moveFocus(keys, 'a', -1)).toBe('a')
    expect(moveFocus([], 'a', 1)).toBe('')
    expect(rangeKeys(keys, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeKeys(keys, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeKeys(keys, 'zz', 'c')).toEqual(['c'])
  })

  it('maps the shared normalized combos to the page actions', () => {
    expect(keyAction(key('j'), QUEUE_KEYS)).toBe('next')
    expect(keyAction(key('ArrowDown'), QUEUE_KEYS)).toBe('next')
    expect(keyAction(key('Enter'), QUEUE_KEYS)).toBe('open')
    expect(keyAction(key('X', { shiftKey: true }), QUEUE_KEYS)).toBe('range')
    expect(keyAction(key('a', { ctrlKey: true }), QUEUE_KEYS)).toBe('all')
    expect(
      keyAction(key('a', { metaKey: true }), QUEUE_KEYS, { apple: true }),
    ).toBe('all')
    expect(keyAction(key('$', { shiftKey: true }), QUEUE_KEYS)).toBe('pay')
    expect(keyAction(key('/'), QUEUE_KEYS)).toBe('search')
    expect(keyAction(key('Escape'), QUEUE_KEYS)).toBe('escape')
    expect(keyAction(key('j', { isComposing: true }), QUEUE_KEYS)).toBeNull()
    expect(keyAction(key('g'), QUEUE_KEYS)).toBeNull()
    expect(keyAction(key('r', { altKey: true }), QUEUE_KEYS)).toBeNull()
    expect(keyAction(key('n'), RECORD_KEYS)).toBe('next_customer')
  })

  it('never claims a reserved combo or a global key with another meaning', () => {
    const globalKeys = new Set(
      KEYMAP.filter((s) => s.context === 'global').flatMap((s) => s.keys),
    )
    const listKeys = new Set(
      KEYMAP.filter((s) => s.context === 'list').flatMap((s) => s.keys),
    )
    const all = {
      remind: true,
      promise: true,
      call: true,
      pay: true,
      assign: true,
    }
    const own = [
      ...queueShortcuts(all),
      ...recordShortcuts(all).filter((s) => s.id !== 'cobranza.back'),
    ].flatMap((s) => s.keys)
    for (const combo of own) {
      expect(RESERVED_COMBOS).not.toContain(combo)
      expect(globalKeys.has(combo)).toBe(false)
      // The record's j/k are the list keys' meaning on its invoices.
      if (listKeys.has(combo))
        expect(['j', 'k', 'arrowdown', 'arrowup']).toContain(combo)
      expect(combo.startsWith('g')).toBe(false)
    }
    // The page's own keys are exactly the ones its handler answers.
    for (const shortcut of queueShortcuts(all))
      for (const combo of shortcut.keys) expect(QUEUE_KEYS[combo]).toBeTruthy()
    for (const shortcut of recordShortcuts(all))
      for (const combo of shortcut.keys) expect(RECORD_KEYS[combo]).toBeTruthy()
  })

  it('lists only the actions this worker may do', () => {
    expect(queueShortcuts({ call: true }).map((s) => s.id)).toEqual([
      'cobranza.call',
    ])
    expect(queueShortcuts({}).length).toBe(0)
  })
})

describe('Cobranza follow-up', () => {
  it('reads the collector and the day, red once it passed', () => {
    const today = '2026-10-16'
    expect(followupChip(null, today)).toBeNull()
    expect(
      followupChip({ mine: true, date: '2026-10-15', full_name: 'Yo' }, today)
        .theme,
    ).toBe('red')
    expect(followupChip({ mine: true, date: today }, today)).toEqual({
      label: 'Follow up today',
      theme: 'orange',
    })
    const other = followupChip(
      { mine: false, date: '2026-10-20', full_name: 'Ana' },
      today,
    )
    expect(other.theme).toBe('blue')
    expect(other.label).toMatch(/· Ana$/)
    expect(
      followupChip({ mine: false, date: null, full_name: 'Ana' }, today),
    ).toEqual({
      label: 'Collector: Ana',
      theme: 'gray',
    })
  })

  it('offers today, tomorrow, in 3 days and next Monday', () => {
    expect(followupPresets('2026-10-16').map((p) => p.value)).toEqual([
      '2026-10-16',
      '2026-10-17',
      '2026-10-19',
      '2026-10-19',
    ])
    expect(followupPresets('2026-10-19').at(-1).value).toBe('2026-10-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('Cobranza «Registrar pago»', () => {
  const ctx = {
    can_pay: true,
    company: 'Tienda',
    today: '2026-10-16',
    invoices: [
      { name: 'A', outstanding: 1000, currency: 'MXN', account: 'Clientes' },
      { name: 'B', outstanding: 500, currency: 'MXN', account: 'Clientes' },
      { name: 'U', outstanding: 300, currency: 'USD', account: 'Clientes USD' },
    ],
    modes: [
      { name: 'Efectivo', account: 'Caja', needs_reference: false },
      { name: 'Transferencia', account: 'Banco', needs_reference: true },
      { name: 'Tarjeta', account: null, problem: 'sin cuenta' },
    ],
  }
  const form = (extra = {}) => ({
    invoices: ['A', 'B'],
    amount: 1200,
    mode: 'Efectivo',
    reference: '',
    date: '2026-10-16',
    ...extra,
  })

  it('applies a payment to the oldest invoice first', () => {
    expect(allocatePayment(ctx.invoices.slice(0, 2), 1200)).toEqual({
      rows: [
        { invoice: 'A', amount: 1000 },
        { invoice: 'B', amount: 200 },
      ],
      left: 0,
    })
    expect(allocatePayment(ctx.invoices.slice(0, 1), 1000.1).left).toBe(0.1)
    expect(allocatePayment(ctx.invoices.slice(0, 2), 0.1 + 0.2).rows).toEqual([
      { invoice: 'A', amount: 0.3 },
    ])
  })

  it('says what blocks it and how to resolve it', () => {
    expect(paymentProblem(ctx, form())).toBeNull()
    expect(
      paymentProblem(
        { ...ctx, can_pay: false, problem: 'Sin permiso' },
        form(),
      ),
    ).toEqual({
      text: 'Sin permiso',
      action: 'copy_request',
    })
    expect(
      paymentProblem(
        { ...ctx, modes: [ctx.modes[2]], can_setup_modes: true },
        form(),
      ).action,
    ).toBe('setup_modes')
    expect(paymentProblem(ctx, form({ invoices: [] })).text).toMatch(
      /at least one/,
    )
    expect(paymentProblem(ctx, form({ invoices: ['A', 'U'] })).text).toMatch(
      /different accounts/,
    )
    expect(paymentProblem(ctx, form({ amount: 0 })).text).toMatch(/how much/)
    expect(paymentProblem(ctx, form({ amount: 1500.01 })).text).toMatch(
      /more than/,
    )
    expect(paymentProblem(ctx, form({ mode: 'Tarjeta' })).text).toMatch(
      /how they paid/,
    )
    expect(paymentProblem(ctx, form({ mode: 'Transferencia' })).text).toMatch(
      /reference/,
    )
    expect(
      paymentProblem(ctx, form({ mode: 'Transferencia', reference: 'SPEI 1' })),
    ).toBeNull()
    expect(paymentProblem(ctx, form({ date: '2026-10-17' })).text).toMatch(
      /future/,
    )
  })

  it('is the next action where there is no register, beside it where there is', () => {
    const inv = { name: 'A', overdue_days: 0, next_due: null }
    expect(invoiceAction(inv, { caps: { pay: true } }).key).toBe('pay')
    const primary = invoiceAction(inv, { caps: { collect: true, pay: true } })
    expect(primary.key).toBe('collect')
    expect(
      secondaryActions(inv, primary, { collect: true, pay: true }).map(
        (a) => a.key,
      ),
    ).toContain('pay')
    expect(invoiceAction(inv, { caps: {} }).blocked).toBeTruthy()
  })
})

describe('Cobranza summaries', () => {
  it('names each bulk outcome', () => {
    expect(bulkSummary({ sent: 3, already: 1, blocked: 2, skipped: 0 })).toBe(
      '3 sent · 1 already sent · 2 to resolve',
    )
    expect(bulkSummary({})).toBe('')
  })

  it('splits what is owed into overdue and not yet due', () => {
    expect(
      owedSplit([{ currency: 'MXN', outstanding: 1500.3, overdue: 1000.1 }]),
    ).toEqual([{ currency: 'MXN', overdue: 1000.1, upcoming: 500.2 }])
  })
})

describe('Spanish for the power worklist', async () => {
  const { readFileSync } = await import('node:fs')
  const { dirname, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = dirname(fileURLToPath(import.meta.url))
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const catalog = new Set()
  for (const m of po.matchAll(
    /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
  ))
    catalog.add(`${m[1] || ''}\u0004${m[2].replace(/\\"/g, '"')}`)
  const files = [
    'pages/Cobranza.vue',
    'pages/CobranzaCliente.vue',
    'components/cobranza/CobranzaSheet.vue',
    'components/cobranza/PromiseSheet.vue',
    'components/cobranza/CallSheet.vue',
    'components/cobranza/FollowupSheet.vue',
    'components/cobranza/PaymentSheet.vue',
    'components/cobranza/BulkRemindSheet.vue',
    'components/cobranza/StatementSheet.vue',
    'composables/useCobranzaActions.js',
  ]
  const strings = new Set()
  for (const file of files) {
    const source = readFileSync(resolve(here, '../../src', file), 'utf8')
    for (const m of source.matchAll(
      /\b(?:__|tr)\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,\s*(?:\[[^\]]*\]|null)\s*,\s*(CTX))?/g,
    ))
      strings.add(`${m[2] ? 'Cobranza' : ''}\u0004${m[1].replace(/\\'/g, "'")}`)
  }
  const all = {
    remind: true,
    promise: true,
    call: true,
    pay: true,
    assign: true,
  }
  for (const s of [...queueShortcuts(all), ...recordShortcuts(all)])
    strings.add(`\u0004${s.description}`)
  it.each([...strings].map((s) => s.replace('\u0004', ' | ')))('%s', (text) => {
    expect(catalog.has(text.replace(' | ', '\u0004'))).toBe(true)
  })
})
