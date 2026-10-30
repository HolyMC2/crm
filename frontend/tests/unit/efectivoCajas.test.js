import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = []
let answer = async () => ({})
vi.mock('frappe-ui', () => ({
  call: (method, args) => {
    calls.push({ method, args })
    return answer(method, args)
  },
}))

const steps = await import('@/components/efectivo/steps')
const cajas = await import('@/components/efectivo/cajas')

const people = { 'karla@x': 'Karla M.', 'jenni@x': 'Jenni' }
const safe = {
  safe: 'CASH-SAFE-1',
  title: 'Caja fuerte centro',
  store: 'S1',
  currency: 'MXN',
  offsite: 'Efectivo matriz',
  transfer_blocker: null,
  can: { transfer_safe: true, fund: true },
}
const bag = {
  name: 'BAG-1',
  seal: 'S-0001',
  amount: 1500,
  prepared_by: 'karla@x',
  verified_by: '',
}
const caja = {
  name: 'REG-1',
  label: 'Caja mostrador',
  store: 'S1',
  revision: '4',
  device: { label: 'Tableta 1' },
}

beforeEach(() => {
  calls.length = 0
  answer = async () => ({})
})

describe('a whole bag leaves the store', () => {
  it('names the destination, warns when nobody verified it and sends transfer_safe', async () => {
    const step = steps.sendOffsite(bag, safe, people)
    expect(step.props.title).toBe('Sacar S-0001 de la tienda')
    expect(step.props.custody).toContain('Efectivo matriz')
    expect(step.props.message).toContain('Karla M.')
    expect(step.props.guard).toBe('')
    expect(step.props.fields.map((f) => f.kind)).toEqual(['reason', 'confirm'])
    const out = await step.submit({
      note: 'Se la lleva el dueño',
      confirmed: true,
    })
    expect(out.toast).toBe('La bolsa salió de la tienda')
    const { method, args } = calls[0]
    expect(method).toMatch(/cash_custody\.service\.command$/)
    expect(args.action).toBe('transfer_safe')
    const payload = JSON.parse(args.payload)
    expect(payload).toMatchObject({
      safe: 'CASH-SAFE-1',
      bag: 'BAG-1',
      note: 'Se la lleva el dueño',
    })
    // The amount and the destination are the server's, never sent.
    expect(payload).not.toHaveProperty('amount')
    expect(payload).not.toHaveProperty('offsite_cash_account')
  })

  it('without an off-site ledger the sheet says why instead of sending', () => {
    const step = steps.sendOffsite(
      { ...bag, verified_by: 'jenni@x' },
      {
        ...safe,
        can: { transfer_safe: false },
        transfer_blocker: 'Configura una cuenta de efectivo externa.',
      },
      people,
    )
    expect(step.props.guard).toBe('Configura una cuenta de efectivo externa.')
    expect(step.props.message).toBe('La verificó Jenni.')
  })
})

describe('money into the safe', () => {
  it('loads the source accounts and sends fund with the count', async () => {
    answer = async (method) =>
      method.endsWith('fund_sources')
        ? { accounts: [{ name: 'Banco - X', root_type: 'Asset' }] }
        : { journal_entry: 'JE-1' }
    const step = steps.fundSafe(safe)
    expect(step.props.mode).toBe('fund')
    const sources = await step.props.fetchSources()
    expect(sources.accounts).toHaveLength(1)
    expect(calls[0].args).toEqual({ safe: 'CASH-SAFE-1' })
    const count = {
      source: 'denominations',
      denominations: [{ value: 500, quantity: 2 }],
    }
    const out = await step.submit({
      count,
      source: 'Banco - X',
      note: 'Retiro del banco para cambio',
    })
    expect(out.toast).toBe('Efectivo ingresado a la caja fuerte')
    expect(calls[1].args.action).toBe('fund')
    expect(JSON.parse(calls[1].args.payload)).toMatchObject({
      safe: 'CASH-SAFE-1',
      source_account: 'Banco - X',
      count,
    })
  })
})

describe('cajas', () => {
  it('a row says who has it open, or what it needs', () => {
    expect(
      cajas.cajaLine({
        lifecycle: 'Ready',
        opening_shift: 'SH-1',
        cashier_name: 'Karla M.',
        opened_at: '9:02',
        attention: [],
      }),
    ).toBe('Abierta · Karla M. desde 9:02')
    expect(
      cajas.cajaLine({ lifecycle: 'Draft', attention: ['setup_incomplete'] }),
    ).toBe('Por configurar')
    expect(
      cajas.cajaLine({
        lifecycle: 'Ready',
        opening_shift: 'SH-1',
        attention: ['older_shift'],
      }),
    ).toBe('Tiene abierto un turno de otro día')
    expect(
      cajas.cajaLine({ lifecycle: 'Ready', mode: 'Cashless', attention: [] }),
    ).toBe('Disponible · sin efectivo')
  })

  it('what a caja still needs reads in Spanish, by its key', () => {
    expect(cajas.readinessText({ key: 'device', message: 'Connect it.' })).toBe(
      'Conecta el dispositivo de esta caja.',
    )
    expect(cajas.readinessText({ key: 'new', message: 'Server words' })).toBe(
      'Server words',
    )
  })

  it('suspending sends the revision and the reason, with a stable request ID', async () => {
    const step = cajas.suspendCaja(caja)
    expect(step.props.fields[0].kind).toBe('reason')
    await step.submit({ reason: 'Se descompuso el cajón' })
    const { method, args } = calls[0]
    expect(method).toMatch(/commands\.set_register_lifecycle$/)
    expect(args).toMatchObject({
      register: 'REG-1',
      target: 'Suspended',
      expected_revision: '4',
      reason: 'Se descompuso el cajón',
      schema_version: 1,
    })
    expect(args.request_id).toMatch(/^[A-Za-z0-9_-]{16,80}$/)
  })

  it('a dropped connection keeps the request ID for the retry', async () => {
    answer = async () => {
      throw Object.assign(new Error('Network'), { status: 0 })
    }
    const step = cajas.activateCaja(caja)
    await expect(step.submit({})).rejects.toThrow()
    answer = async () => ({})
    await step.submit({})
    expect(calls[1].args.request_id).toBe(calls[0].args.request_id)
    expect(calls[1].args.target).toBe('Ready')
  })

  it('replacing a device asks for the reason, the warning and the password', async () => {
    answer = async () => ({ code: 'ABCD-EFGH', expires_at: 'x' })
    const step = cajas.replaceDevice(caja)
    expect(step.props.fields.map((f) => f.kind)).toEqual([
      'reason',
      'confirm',
      'password',
    ])
    const out = await step.submit({
      reason: 'Se perdió la tableta',
      acknowledge: true,
      password: 'secreto',
    })
    expect(out.code.code).toBe('ABCD-EFGH')
    expect(calls[0].args).toMatchObject({
      register: 'REG-1',
      purpose: 'Replace',
      acknowledge_recovery: 1,
    })
  })

  it('linking a safe and unlinking it are the cash_transfer.safes commands', async () => {
    await cajas
      .linkSafe(caja, { name: 'SAFE-S1', title: 'Caja fuerte centro' })
      .submit({})
    await cajas
      .unlinkSafe(caja, {
        link: 'LINK-1',
        safe_title: 'Caja fuerte centro',
        revision: '2',
      })
      .submit({ reason: 'La caja se cambia de tienda' })
    expect(calls[0].method).toMatch(/cash_transfer\.safes\.link_register$/)
    expect(calls[0].args).toMatchObject({ safe: 'SAFE-S1', register: 'REG-1' })
    expect(calls[1].method).toMatch(/cash_transfer\.safes\.unlink_register$/)
    expect(calls[1].args).toMatchObject({
      link: 'LINK-1',
      expected_revision: '2',
    })
  })

  it('the activity says what happened, never an event key', () => {
    expect(
      cajas.activityText({
        action: 'register.lifecycle',
        details: { lifecycle: 'Suspended' },
      }),
    ).toBe('La suspendió')
    expect(cajas.activityText({ action: 'device.bound' })).toBe(
      'Conectó un dispositivo',
    )
    expect(cajas.activityText({ action: 'something.new' })).toBe(
      'Movimiento de la caja',
    )
  })
})
