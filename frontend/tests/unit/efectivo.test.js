import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = []
let answer = async () => ({})
vi.mock('frappe-ui', () => ({
  call: (method, args) => {
    calls.push({ method, args })
    return answer(method, args)
  },
}))

const {
  bagStep,
  bulkActions,
  cashMap,
  cashSegments,
  custodyCount,
  faceLabel,
  holderText,
  minorCount,
  oneInstruction,
  salesWord,
  shiftLine,
  shiftSource,
  shiftWhen,
  totalMinor,
} = await import('@/components/efectivo/efectivo')
const steps = await import('@/components/efectivo/steps')

const people = { 'karla@x': 'Karla M.', 'jenni@x': 'Jenni' }
const storeSafe = {
  safe: 'CASH-SAFE-1',
  title: 'Caja fuerte centro',
  store: 'S1',
  currency: 'MXN',
  can: {
    prepare: true,
    verify: true,
    dispatch: true,
    confirm_bank: true,
    review: true,
  },
}

beforeEach(() => {
  calls.length = 0
  answer = async () => ({})
})

describe('counting', () => {
  it('adds whole pieces in centavos and sends both count shapes', () => {
    const rows = { 50000: 2, 2000: 3, 50: 1, 100: 0, 1000: 'x' }
    expect(totalMinor(rows)).toBe(106050)
    expect(custodyCount(rows).denominations).toEqual([
      { value: 0.5, quantity: 1 },
      { value: 20, quantity: 3 },
      { value: 500, quantity: 2 },
    ])
    expect(minorCount({ 50000: 1 })).toEqual({
      source: 'denominations',
      denominations: [{ value_minor: '50000', quantity: 1 }],
    })
    expect(faceLabel(100000)).toBe('$1,000')
    expect(faceLabel(50)).toBe('50¢')
  })
})

describe('who holds the cash', () => {
  it('names the person answerable for the bag, never an email', () => {
    expect(
      holderText({ holder: { kind: 'carrier', user: 'karla@x' } }, people),
    ).toBe('La lleva Karla M. al banco')
    expect(
      holderText({ holder: { kind: 'safe', user: 'ana@tienda.mx' } }, {}),
    ).toBe('En la caja fuerte · responde ana')
    expect(
      holderText(
        { holder: { kind: 'bank' }, deposit_reference: 'F-123' },
        people,
      ),
    ).toBe('En el banco · ficha F-123')
  })

  it('offers the next step or says who takes it', () => {
    const bag = {
      state: 'Unverified',
      prepared_by: 'karla@x',
      purpose: 'Takings',
    }
    expect(bagStep(bag, storeSafe, 'jenni@x')).toEqual({
      action: 'verify',
      label: 'Contar y verificar',
    })
    expect(bagStep(bag, storeSafe, 'karla@x').reason).toMatch(/otra persona/)
    const owner = { ...storeSafe, can: { ...storeSafe.can, self_review: true } }
    expect(bagStep(bag, owner, 'karla@x').action).toBe('verify')
    expect(
      bagStep({ ...bag, state: 'In Transit' }, { can: {} }, 'jenni@x').reason,
    ).toMatch(/ficha del banco/)
    expect(
      bagStep({ ...bag, state: 'Disputed' }, storeSafe, 'jenni@x').action,
    ).toBe('review')
  })
})

describe('one instruction, one request ID', () => {
  it('keeps the ID after a dropped connection and frees it after a refusal', async () => {
    const one = oneInstruction()
    const ids = []
    await expect(
      one.send(async (id) => {
        ids.push(id)
        throw Object.assign(new Error('Failed to fetch'), { status: 0 })
      }),
    ).rejects.toThrow()
    await one.send(async (id) => ids.push(id))
    expect(ids[0]).toBe(ids[1])
    expect(ids[0]).toMatch(/^[A-Za-z0-9_-]{16,80}$/)
    await expect(
      one.send(async (id) => {
        ids.push(id)
        throw { messages: ['Another person must verify the bag.'] }
      }),
    ).rejects.toBeTruthy()
    await one.send(async (id) => ids.push(id))
    expect(ids[3]).not.toBe(ids[2])
  })
})

describe('steps send the custody commands', () => {
  it('verify names the store safe, the bag and the count', async () => {
    const step = steps.verifyBag(
      { name: 'BAG-1', seal: 'JENNI-1', prepared_by: 'jenni@x' },
      storeSafe,
      people,
    )
    await step.submit({ count: custodyCount({ 20000: 1 }), note: '' })
    expect(calls[0].method).toBe(
      'posawesome.posawesome.api.cash_custody.service.command',
    )
    expect(calls[0].args.action).toBe('verify')
    const payload = JSON.parse(calls[0].args.payload)
    expect(payload).toMatchObject({ safe: 'CASH-SAFE-1', bag: 'BAG-1' })
    expect(payload.count.denominations).toEqual([{ value: 200, quantity: 1 }])
    expect(payload.request_id).toMatch(/^shell-/)
  })

  it('a register safe is named by its profile', async () => {
    const pair = { ...storeSafe, store: null, pos_profile: 'Caja 1' }
    await steps
      .confirmDeposit({ name: 'BAG-2', seal: 'S', holder: {} }, pair, people)
      .submit({ reference: 'F-9' })
    expect(JSON.parse(calls[0].args.payload)).toMatchObject({
      pos_profile: 'Caja 1',
      bag: 'BAG-2',
      reference: 'F-9',
    })
    expect(calls[0].args.action).toBe('confirm_bank')
  })

  it('a refusal comes back as the server sentence', async () => {
    answer = async () => {
      throw {
        messages: ['Only verified available bags can leave for the bank.'],
      }
    }
    const step = steps.dispatchBag(
      { name: 'B', seal: 'S', amount: 10 },
      storeSafe,
      people,
      'karla@x',
    )
    await expect(step.submit({ note: 'BBVA centro, Karla' })).rejects.toThrow(
      'Only verified available bags can leave for the bank.',
    )
  })

  it('a safe traslado is sealed, then handed over, with related request IDs', async () => {
    answer = async (method) =>
      method.endsWith('prepare')
        ? { name: 'T1', revision: 2, state: 'Prepared' }
        : {}
    await steps
      .handTransfer(
        {
          name: 'T1',
          revision: 1,
          state: 'Draft',
          destination_label: 'Caja 2',
        },
        storeSafe,
      )
      .submit({ rows: { 10000: 5 } })
    expect(calls.map((c) => c.method.split('.').pop())).toEqual([
      'prepare',
      'dispatch',
    ])
    expect(calls[1].args.expected_revision).toBe(2)
    expect(calls[0].args.request_id.replace(/-p$/, '')).toBe(
      calls[1].args.request_id.replace(/-d$/, ''),
    )
  })

  it('an authorization sends the password to the server only', async () => {
    const row = {
      document_type: 'Journal Entry',
      document_name: 'JV-1',
      event: 'submit',
      amount_minor: '100',
    }
    await steps
      .authorize(row, people)
      .submit({ reason: 'Pago autorizado', password: 'secreto' })
    expect(calls[0].method).toBe(
      'posawesome.posawesome.api.cash_resources.authorize_posting',
    )
    expect(calls[0].args).toMatchObject({
      document_name: 'JV-1',
      password: 'secreto',
    })
  })
})

describe('several bags, one instruction', () => {
  const pair = {
    safe: 'CASH-SAFE-2',
    title: 'Caja fuerte Tienda',
    store: null,
    pos_profile: 'Tienda',
    currency: 'MXN',
    offsite: 'Caja fuerte casa',
    destinations: [{ account: 'HOME', label: 'Caja fuerte casa' }],
    can: {
      verify: true,
      unpack: true,
      dispatch: true,
      confirm_bank: true,
      transfer_safe: true,
      verify_together: true,
      deposit: true,
    },
  }
  const bag = (name, state, extra = {}) => ({
    name,
    seal: `SEAL-${name}`,
    state,
    amount: 1000.1,
    prepared_by: 'jenni@x',
    ...extra,
  })
  const keys = (rows) => rows.map((r) => `${r.key}:${r.bags.length}`)
  const payload = (n = 0) => JSON.parse(calls[n].args.payload)
  const BATCH = 'posawesome.posawesome.api.cash_custody.batch.command'

  it('offers each step to the chosen bags it applies to', () => {
    const chosen = [
      bag('B1', 'Unverified'),
      bag('B2', 'Unverified'),
      bag('B3', 'Unverified', { prepared_by: 'karla@x' }),
      bag('B4', 'Available'),
    ]
    expect(keys(bulkActions(chosen, pair, 'karla@x'))).toEqual([
      'verify_together:2',
      'verify_each:2',
      'deposit:1',
      'dispatch:1',
      'transfer_safe:4',
      'unpack:1',
      'labels:4',
    ])
    // The owner counts their own bag too.
    const owner = { ...pair, can: { ...pair.can, self_review: true } }
    expect(keys(bulkActions(chosen, owner, 'karla@x'))[0]).toBe(
      'verify_together:3',
    )
  })

  it('counting together needs two bags and someone who resolves differences', () => {
    const chosen = [bag('B1', 'Unverified'), bag('B2', 'Unverified')]
    const custodian = { ...pair, can: { ...pair.can, verify_together: false } }
    expect(keys(bulkActions(chosen, custodian, 'karla@x'))[0]).toBe(
      'verify_each:2',
    )
    expect(keys(bulkActions(chosen.slice(0, 1), pair, 'karla@x'))[0]).toBe(
      'verify_each:1',
    )
    const cashier = { ...pair, can: {} }
    expect(keys(bulkActions(chosen, cashier, 'karla@x'))).toEqual(['labels:2'])
  })

  it('a bank trip for several bags is one batch with one note', async () => {
    const step = steps.dispatchBags(
      [bag('B1', 'Available'), bag('B2', 'Available')],
      pair,
      people,
      'karla@x',
    )
    expect(step.props.title).toBe('Llevar 2 bolsas al banco')
    expect(step.props.amount).toBe(2000.2)
    expect(step.props.items.map((i) => i.title)).toEqual(['SEAL-B1', 'SEAL-B2'])
    await step.submit({ note: 'BBVA centro, Karla' })
    expect(calls[0].method).toBe(BATCH)
    expect(calls[0].args.action).toBe('dispatch')
    expect(payload()).toMatchObject({
      pos_profile: 'Tienda',
      bags: ['B1', 'B2'],
      note: 'BBVA centro, Karla',
    })
    expect(payload().request_id).toMatch(/^shell-/)
  })

  it('a deposit takes one slip; a blank note is left to the server', async () => {
    await steps
      .depositBags([bag('B1', 'Available')], pair)
      .submit({ reference: 'F-88', note: '' })
    expect(calls[0].args.action).toBe('deposit')
    expect(payload()).toEqual({
      pos_profile: 'Tienda',
      bags: ['B1'],
      reference: 'F-88',
      request_id: payload().request_id,
    })
  })

  it('bags leave for the destination the worker picks when the safe lists several', async () => {
    const chosen = [bag('B1', 'Available'), bag('B2', 'Unverified')]
    const one = steps.sendOffsiteBags(chosen, pair)
    expect(one.props.fields.map((f) => f.key)).toEqual(['note', 'confirmed'])
    expect(one.props.message).toMatch(/^1 de 2 no se han verificado/)
    await one.submit({ note: 'Se las lleva el dueño', confirmed: true })
    expect(payload()).not.toHaveProperty('destination')

    const several = {
      ...pair,
      destinations: [...pair.destinations, { account: 'HQ', label: 'Matriz' }],
    }
    const step = steps.sendOffsiteBags(chosen, several)
    const [choice, , confirm] = step.props.fields
    expect(choice.options).toEqual([
      { value: 'HOME', label: 'Caja fuerte casa' },
      { value: 'HQ', label: 'Matriz' },
    ])
    expect(confirm.label({ destination: 'HQ' })).toMatch(/hacia Matriz\.$/)
    await step.submit({
      destination: 'HQ',
      note: 'Se las lleva el dueño',
      confirmed: true,
    })
    expect(calls[1].args.action).toBe('transfer_safe')
    expect(payload(1)).toMatchObject({ bags: ['B1', 'B2'], destination: 'HQ' })

    await steps
      .sendOffsite(bag('B3', 'Available'), several, people)
      .submit({ destination: 'HQ', note: 'Se la lleva el dueño' })
    expect(calls[2].method).toBe(
      'posawesome.posawesome.api.cash_custody.service.command',
    )
    expect(payload(2)).toMatchObject({ bag: 'B3', destination: 'HQ' })
  })

  it('one count for the pile, and counting one by one when it does not match', async () => {
    const chosen = [bag('B1', 'Unverified'), bag('B2', 'Unverified')]
    const step = steps.verifyTogether(chosen, pair, people)
    expect(step.props.mode).toBe('verify_together')
    // A blind count: the sheet lists the seals, never what they hold.
    expect(step.props.items.map((i) => i.meta)).toEqual([
      'la selló Jenni',
      'la selló Jenni',
    ])
    expect(step).not.toHaveProperty('props.amount')
    await step.submit({ count: custodyCount({ 100000: 2, 20: 1 }), note: '' })
    expect(calls[0].args.action).toBe('verify_together')
    expect(payload()).toMatchObject({
      bags: ['B1', 'B2'],
      count: { source: 'denominations' },
    })

    const each = step.props.fallback()
    expect(each.props.title).toBe('Contar SEAL-B1 · 1 de 2')
    answer = async () => ({ state: 'Available' })
    const first = await each.submit({ count: custodyCount({ 100000: 1 }) })
    expect(first.toast).toBe('Bolsa verificada · falta 1')
    expect(first.next.props.title).toBe('Contar SEAL-B2 · 2 de 2')
    answer = async () => ({ state: 'Disputed' })
    const last = await first.next.submit({ count: custodyCount({ 50000: 1 }) })
    expect(last.next).toBeUndefined()
    expect(last.toast).toBe('No cuadró: la bolsa queda con diferencia')
    expect(
      calls.slice(1).map((c) => [c.args.action, payload(calls.indexOf(c)).bag]),
    ).toEqual([
      ['verify', 'B1'],
      ['verify', 'B2'],
    ])
  })

  it('a refused batch comes back as the server sentence with the seal', async () => {
    answer = async () => {
      throw {
        messages: [
          'SEAL-B2: Only verified available bags can leave for the bank.',
        ],
      }
    }
    await expect(
      steps
        .dispatchBags(
          [bag('B1', 'Available'), bag('B2', 'Available')],
          pair,
          people,
          'karla@x',
        )
        .submit({ note: 'BBVA centro, Karla' }),
    ).rejects.toThrow('SEAL-B2: Only verified available bags')
  })
})

describe('where the cash is', () => {
  const safe = (over = {}) => ({
    title: 'Caja fuerte centro',
    currency: 'MXN',
    balance: 10000,
    loose_balance: 2600,
    in_transit: 3100,
    bags: [
      { state: 'Unverified', amount: 2211 },
      { state: 'Unverified', amount: 1500.5 },
      { state: 'Available', amount: 3688.5 },
      { state: 'In Transit', amount: 3100 },
      { state: 'Deposited', amount: 900 },
    ],
    ...over,
  })

  it('splits the safe by where its money sits, in the order it moves', () => {
    const map = cashMap([safe()])
    expect(map.label).toBe('En Caja fuerte centro')
    expect(map.balance).toBe(10000)
    expect(map.parts.map((p) => [p.label, p.amount, p.count, p.view])).toEqual([
      ['Suelto', 2600, null, undefined],
      ['Por verificar', 3711.5, 2, 'sealed'],
      ['Listas', 3688.5, 1, 'sealed'],
      ['En camino', 3100, 1, 'transit'],
    ])
  })

  it('adds the safes a worker sees and leaves out what is not theirs to see', () => {
    const map = cashMap([safe(), safe({ title: 'Norte', balance: 500 })])
    expect(map.label).toBe('En tus cajas fuertes')
    expect(map.balance).toBe(10500)
    expect(cashMap([safe({ balance: null })])).toBeNull()
    expect(cashMap([safe(), safe({ currency: 'USD' })])).toBeNull()
  })

  it('gives each part its share of the bar, a short ledger counting as none', () => {
    const segments = cashSegments([
      { key: 'loose', amount: -50 },
      { key: 'Unverified', amount: 300 },
      { key: 'Available', amount: 100 },
    ])
    expect(segments.map((s) => [s.key, s.start, s.share])).toEqual([
      ['loose', 0, 0],
      ['Unverified', 0, 0.75],
      ['Available', 0.75, 0.25],
    ])
    expect(cashSegments([{ key: 'loose', amount: 0 }])[0].share).toBe(0)
  })
})

describe('the turn the cash came from', () => {
  // Saturday 7 Nov 2026, 10:00 on the device: Friday is «ayer».
  const now = new Date(2026, 10, 7, 10, 0)
  const corte = {
    shift: 'POSA-OS-1',
    cashier: 'jenni@x',
    caja: 'Doco Ventas',
    opened: '2026-11-03 09:28:19.995152',
    closed: '2026-11-03 15:01:17.156824',
    closing: 'POSA-CS-1',
    sales: 7,
    total: 920,
  }

  it('says when the turn ran, across midnight or still open', () => {
    expect(shiftWhen(corte, { now })).toBe('mar 3 nov, 09:28–15:01')
    expect(
      shiftWhen(
        {
          ...corte,
          opened: '2026-11-06 15:05:10',
          closed: '2026-11-06 19:49:15',
        },
        { now },
      ),
    ).toBe('ayer, 15:05–19:49')
    expect(
      shiftWhen(
        {
          ...corte,
          opened: '2026-11-05 22:00:00',
          closed: '2026-11-06 02:10:00',
        },
        { now },
      ),
    ).toBe('jue 5 nov 22:00 – ayer 02:10')
    expect(
      shiftWhen(
        {
          ...corte,
          opened: '2026-11-07 09:26:54',
          closed: null,
          closing: null,
        },
        { now },
      ),
    ).toBe('abierto desde hoy 09:26')
    expect(shiftWhen(null)).toBe('')
  })

  it('a row names the cashier, the day and how many sales the corte holds', () => {
    expect(shiftLine(corte, people, { now })).toBe(
      'Corte de Jenni · mar 3 nov, 09:28–15:01 · 7 ventas',
    )
    expect(shiftLine({ ...corte, sales: 1 }, people, { now })).toMatch(
      /· 1 venta$/,
    )
    expect(salesWord(0)).toBe('sin ventas')
    // A fund leaves the sales out; an open turn has none to count yet.
    expect(shiftLine(corte, people, { now, sales: false })).toBe(
      'Corte de Jenni · mar 3 nov, 09:28–15:01',
    )
    expect(
      shiftLine(
        {
          ...corte,
          opened: '2026-11-07 09:26:54',
          closed: null,
          closing: null,
          sales: null,
        },
        people,
        { now },
      ),
    ).toBe('Turno de Jenni · abierto desde hoy 09:26')
    expect(shiftLine(null, people)).toBe('')
  })

  it('the page adds the caja, the sales total when it is visible, the note and the closing', () => {
    const source = shiftSource(corte, people, {
      now,
      link: true,
      note: 'faltan las recargas del cel',
      noteBy: 'jenni@x',
    })
    expect(source).toEqual({
      title: 'Corte de Jenni',
      line: 'mar 3 nov, 09:28–15:01 · 7 ventas por $920.00 · Doco Ventas',
      note: 'Nota de Jenni: «faltan las recargas del cel»',
      to: {
        name: 'ResultadosDocumento',
        params: { doctype: 'POS Closing Shift', name: 'POSA-CS-1' },
      },
    })
    // A reader without the safe's totals gets the count of sales, no amount, and no link without Resultados.
    const blind = shiftSource({ ...corte, total: null }, people, { now })
    expect(blind.line).toBe('mar 3 nov, 09:28–15:01 · 7 ventas · Doco Ventas')
    expect(blind.to).toBeNull()
    expect(blind.note).toBe('')
    expect(shiftSource(null, people)).toBeNull()
  })

  it('the review of a short corte and the count of a bag carry their turn', () => {
    const source = shiftSource(corte, people, { now })
    const review = steps.reviewCount(
      {
        name: 'CASH-COUNT-1',
        amount: 1211,
        expected_amount: 1361,
        difference: -150,
        counted_by: 'jenni@x',
      },
      storeSafe,
      people,
      source,
    )
    expect(review.props.source).toBe(source)
    expect(review.props.title).toBe('Faltante por revisar')
    expect(review.props.message).toBe(
      'Se esperaban $1,361.00 y Jenni contó $1,211.00.',
    )
    const verify = steps.verifyBag(
      {
        name: 'BAG-1',
        seal: 'JENNIFER-031126-02',
        prepared_by: 'jenni@x',
        shift: corte,
      },
      storeSafe,
      people,
    )
    expect(verify.props.custody).toMatch(
      /^Corte de Jenni · .+ · 7 ventas\. La selló Jenni\./,
    )
  })
})
