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
  custodyCount,
  faceLabel,
  holderText,
  minorCount,
  oneInstruction,
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
