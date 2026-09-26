import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  emptyRepair,
  repairMoney,
  repairOrderHref,
  repairReturnPath,
} from '@/utils/repairOrders'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import { useRepairOrders } from '@/composables/repairOrders'
import {
  repairActorKey,
  readRepairReceipt,
  saveRepairReceipt,
} from '@/utils/repairRecovery'
const context = (orders = []) => ({
  orders,
  can_create: true,
  create_blocked_reason: '',
  defaults: {
    client: 'CONTACT-1',
    customer: 'CUSTOMER-1',
    laboratorio: 'LAB-1',
  },
  laboratorios: [
    { name: 'LAB-1', label: 'Lab uno', currency: 'USD' },
    { name: 'LAB-2', label: 'Lab dos', currency: 'EUR' },
  ],
  currency: 'USD',
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const scopes = []
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm')
beforeEach(() => {
  sessionStorage.clear()
  document.cookie = 'user_id=repair-agent%40example.test'
  call.mockReset()
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  })
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm)
  else delete window.confirm
})
async function setup(behavior) {
  call.mockImplementation(behavior || (async () => context()))
  const deal = ref('DEAL-1'),
    onCreated = vi.fn(),
    scope = effectScope()
  scopes.push(scope)
  const api = scope.run(() =>
    useRepairOrders(() => deal.value, { onCreated, initiallyOpen: true }),
  )
  await settle()
  return { ...api, deal, onCreated }
}
const fill = (api) =>
  Object.assign(api.state.value.draft, {
    device_model: { value: 'PHONE' },
    falla_reportada: 'Pantalla rota',
    phone_pin: '1234',
    unlock_method: 'pin',
  })
const commands = () =>
  call.mock.calls
    .filter(([method]) => method.endsWith('create_and_link_repair_order'))
    .map(([, args]) => args)

describe('repair intake lifecycle (API boundary doubles)', () => {
  it('keeps failed reads distinct from an empty list and recovers', async () => {
    const api = await setup(
      vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(context()),
    )
    expect(api.state.value.context).toBeNull()
    expect(api.state.value.loadError).toBe('offline')
    await api.refresh()
    expect(api.state.value.context.orders).toEqual([])
    expect(api.state.value.loadError).toBe('')
    expect(api.state.value.draft.client).toBe('CONTACT-1')
  })
  it('clears scope data immediately and ignores a late old-deal read while keeping each human draft', async () => {
    const oldRead = deferred(),
      newRead = deferred()
    const api = await setup(async () => context([{ name: 'RO-A' }]))
    fill(api)
    call.mockImplementation((method, { deal_name }) =>
      deal_name === 'DEAL-1' ? oldRead.promise : newRead.promise,
    )
    const refresh = api.refresh()
    api.deal.value = 'DEAL-2'
    await nextTick()
    expect(api.state.value.context).toBeNull()
    expect(api.state.value.loading).toBe(true)
    expect(api.state.value.draft.falla_reportada).toBe('')
    oldRead.resolve(context([{ name: 'RO-A-LATE' }]))
    await refresh
    expect(api.state.value.context).toBeNull()
    newRead.resolve(context([{ name: 'RO-B' }]))
    await settle()
    expect(api.state.value.context.orders[0].name).toBe('RO-B')
    api.deal.value = 'DEAL-1'
    await settle()
    expect(api.state.value.draft.falla_reportada).toBe('Pantalla rota')
    expect(api.state.value.draft.phone_pin).toBe('1234')
  })
  it('retries an ambiguous response with the exact command and one UUID, then publishes the linked result', async () => {
    let attempts = 0
    const api = await setup(async (method) => {
      if (method.endsWith('get_deal_repair_context')) return context()
      if (++attempts === 1) throw new TypeError('response lost')
      return 'RO-REPLAY'
    })
    fill(api)
    expect(await api.create()).toBe(false)
    expect(api.state.value.draft.phone_pin).toBe('1234')
    expect(api.canLeave()).toBe(false)
    expect(api.toggleForm()).toBe(false)
    api.state.value.draft.falla_reportada = 'Programmatic edit after freeze'
    expect(await api.create()).toBe(true)
    expect(commands()).toHaveLength(2)
    expect(commands()[0]).toEqual(commands()[1])
    expect(commands()[1]).toMatchObject({
      deal_name: 'DEAL-1',
      falla_reportada: 'Pantalla rota',
      client_uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(api.onCreated).toHaveBeenCalledExactlyOnceWith('RO-REPLAY')
    expect(api.state.value.createdName).toBe('RO-REPLAY')
    expect(api.state.value.showForm).toBe(false)
    expect(api.state.value.draft.phone_pin).toBe('')
  })
  it('blocks duplicate clicks and does not apply a previous-deal create to the new deal', async () => {
    const result = deferred()
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : result.promise,
    )
    fill(api)
    const creating = api.create()
    expect(await api.create()).toBe(false)
    expect(commands()).toHaveLength(1)
    expect(api.canLeave()).toBe(false)
    api.deal.value = 'DEAL-2'
    await settle()
    expect(api.pending.value).toBe(true)
    expect(api.otherPending.value[0].deal).toBe('DEAL-1')
    result.resolve('RO-1')
    await creating
    expect(api.onCreated).not.toHaveBeenCalled()
    expect(api.state.value.createdName).toBe('')
    expect(api.state.value.deal).toBe('DEAL-2')
  })
  it('can reconcile a previous Deal after a prop switch without applying it to the current Deal', async () => {
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : Promise.reject(new Error('response lost')),
    )
    fill(api)
    await api.create()
    api.deal.value = 'DEAL-2'
    await settle()
    expect(api.otherPending.value[0].deal).toBe('DEAL-1')
    call.mockImplementation(async (method) =>
      method.endsWith('get_deal_repair_context') ? context() : 'RO-OLD',
    )
    await api.retryPending('DEAL-1')
    expect(commands()[1]).toEqual(commands()[0])
    expect(api.pending.value).toBe(false)
    expect(api.state.value.deal).toBe('DEAL-2')
    expect(api.state.value.createdName).toBe('')
    expect(api.onCreated).not.toHaveBeenCalled()
  })
  it('allows editing after a confirmed first rejection but never discards an earlier uncertain identity', async () => {
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : Promise.reject({
            exc_type: 'ValidationError',
            message: 'Review client',
          }),
    )
    fill(api)
    await api.create()
    const rejectedId = commands()[0].client_uuid
    expect(api.state.value.intent).toBeNull()
    expect(api.state.value.draft.phone_pin).toBe('1234')
    call.mockRejectedValueOnce(new Error('timeout'))
    await api.create()
    expect(commands()[1].client_uuid).not.toBe(rejectedId)
    call.mockRejectedValueOnce({
      exc_type: 'PermissionError',
      message: 'Changed permission',
    })
    await api.create()
    expect(commands()[2]).toEqual(commands()[1])
    expect(api.state.value.intent.client_uuid).toBe(commands()[1].client_uuid)
  })
  it('confirms dirty discard, retains sensitive draft on cancel, and uses selected permitted lab currency', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const api = await setup()
    fill(api)
    window.confirm.mockReturnValueOnce(false)
    expect(api.toggleForm()).toBe(false)
    expect(api.state.value.draft.phone_pin).toBe('1234')
    api.state.value.draft.laboratorio = 'LAB-2'
    expect(api.currency.value).toBe('EUR')
    api.state.value.draft.laboratorio = 'UNKNOWN'
    expect(api.currency.value).toBeNull()
    expect(api.toggleForm()).toBe(true)
    expect(api.state.value.draft).toEqual(emptyRepair(context().defaults))
    expect(storage).not.toHaveBeenCalled()
    storage.mockRestore()
  })
  it('never offers creation from missing or denied capabilities', async () => {
    const api = await setup(async () => ({
      ...context(),
      can_create: false,
      create_blocked_reason: 'No write permission',
    }))
    fill(api)
    expect(await api.create()).toBe(false)
    expect(commands()).toHaveLength(0)
  })
})

describe('bounded repair recovery receipts', () => {
  it('bounds unresolved receipts and rejects malformed or expanded private payloads', () => {
    const id = '12345678-1234-4234-8234-123456789abc'
    for (let i = 0; i < 20; i++) saveRepairReceipt('DEAL-' + i, id)
    expect(() => saveRepairReceipt('DEAL-21', id)).toThrow(
      'Revisa las reparaciones pendientes',
    )
    expect(JSON.parse(sessionStorage.getItem(repairActorKey()))).toHaveLength(
      20,
    )
    sessionStorage.setItem(
      repairActorKey(),
      JSON.stringify([
        { deal: 'DEAL-1', client_uuid: id, phone_pin: 'sensitive' },
      ]),
    )
    expect(() => readRepairReceipt('DEAL-1')).toThrow('necesita revisión')
  })
  it('stores only Deal and UUID, resolves changed existing orders on reload and clears the receipt', async () => {
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : Promise.reject(new Error('timeout')),
    )
    fill(api)
    await api.create()
    const id = api.state.value.intent.client_uuid
    expect(JSON.parse(sessionStorage.getItem(repairActorKey()))).toEqual([
      { deal: 'DEAL-1', client_uuid: id },
    ])
    expect(api.saveForLater()).toBe(true)
    expect(api.canLeave()).toBe(true)
    expect(api.state.value.intent).toEqual({
      deal_name: 'DEAL-1',
      client_uuid: id,
    })
    expect(api.state.value.draft.phone_pin).toBe('')
    scopes[0].stop()
    call.mockClear()
    const reloaded = await setup(async (method) =>
      method.endsWith('resolve_deal_repair_request')
        ? { status: 'created', name: 'RO-EDITED' }
        : context(),
    )
    expect(reloaded.state.value.createdName).toBe('RO-EDITED')
    expect(reloaded.state.value.intent).toBeNull()
    expect(readRepairReceipt('DEAL-1')).toBeNull()
    expect(commands()).toHaveLength(0)
  })
  it('never replaces an absent delayed original request with a new UUID and allows explicitly retained recovery', async () => {
    const id = '12345678-1234-4234-8234-123456789abc'
    saveRepairReceipt('DEAL-1', id)
    const api = await setup(async (method) =>
      method.endsWith('resolve_deal_repair_request')
        ? { status: 'not_found', retry_same_request: true }
        : context(),
    )
    fill(api)
    expect(api.state.value.intent.client_uuid).toBe(id)
    expect(api.state.value.recoveryOnly).toBe(true)
    expect(await api.create()).toBe(false)
    expect(commands()).toHaveLength(0)
    expect(api.saveForLater()).toBe(true)
    expect(api.canLeave()).toBe(true)
    expect(readRepairReceipt('DEAL-1').client_uuid).toBe(id)
  })
  it('retains a denied lookup without leaking an original RO and never requires repeated failing creates to leave', async () => {
    saveRepairReceipt('DEAL-1', '12345678-1234-4234-8234-123456789abc')
    const api = await setup((method) =>
      method.endsWith('resolve_deal_repair_request')
        ? Promise.reject({ exc_type: 'PermissionError', message: 'Denied' })
        : Promise.resolve(context()),
    )
    expect(api.state.value.createdName).toBe('')
    expect(api.state.value.createError).toContain('Denied')
    expect(api.saveForLater()).toBe(true)
    expect(api.canLeave()).toBe(true)
    expect(commands()).toHaveLength(0)
  })
  it('reports failed storage and keeps the live command/draft mounted instead of claiming safe recovery', async () => {
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : Promise.reject(new Error('timeout')),
    )
    fill(api)
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Quota exceeded')
      })
    try {
      await api.create()
      expect(api.saveForLater()).toBe(false)
      expect(api.canLeave()).toBe(false)
      expect(api.state.value.recoveryError).toContain('No se pudo guardar')
      expect(api.state.value.draft.phone_pin).toBe('1234')
      expect(api.state.value.intent.phone_pin).toBe('1234')
    } finally {
      storage.mockRestore()
    }
  })
  it('partitions lookup receipts by actor across logout/relogin and discards stale sensitive callbacks on actor switch', async () => {
    const reply = deferred()
    const api = await setup((method) =>
      method.endsWith('get_deal_repair_context')
        ? Promise.resolve(context())
        : reply.promise,
    )
    fill(api)
    const pending = api.create()
    const oldKey = repairActorKey()
    expect(sessionStorage.getItem(oldKey)).toBeTruthy()
    document.cookie = 'user_id=Guest'
    window.dispatchEvent(new Event('focus'))
    expect(api.state.value.draft.phone_pin).toBe('')
    expect(api.state.value.context).toBeNull()
    expect(readRepairReceipt('DEAL-1')).toBeNull()
    document.cookie = 'user_id=other%40example.test'
    reply.resolve('RO-PRIVATE')
    await pending
    expect(api.onCreated).not.toHaveBeenCalled()
    expect(api.state.value.createdName).toBe('')
    expect(readRepairReceipt('DEAL-1')).toBeNull()
    document.cookie = 'user_id=repair-agent%40example.test'
    expect(readRepairReceipt('DEAL-1')).toMatchObject({ deal: 'DEAL-1' })
  })
})

describe('repair display and return context', () => {
  it('preserves zero and unknown currency without an invented money unit', () => {
    expect(repairMoney(0, 'USD')).toMatch(/USD.*0[.,]00/)
    expect(repairMoney(0, null)).toBe('0')
    expect(repairMoney(null, 'USD')).toBe('—')
    expect(repairMoney('bad', 'USD')).toBe('—')
  })
  it('retains the Deal360 route and binds the legacy Inbox selection without conflicting conversation context', () => {
    expect(
      repairReturnPath(
        'DEAL-1',
        '/deal/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#repair',
      ),
    ).toBe('/crm/deal/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#repair')
    const inbox = new URL(
      repairReturnPath(
        'DEAL-1',
        '/inbox?deal=OLD&deal=OTHER&doctype=CRM+Lead&workspace=conversations&conversation=CONV-OLD&owner=me#repair',
      ),
      'https://crm.invalid',
    )
    expect(inbox.pathname).toBe('/crm/inbox')
    expect(inbox.searchParams.getAll('deal')).toEqual(['DEAL-1'])
    expect(inbox.searchParams.getAll('doctype')).toEqual(['CRM Deal'])
    expect(inbox.searchParams.getAll('workspace')).toEqual(['activity'])
    expect(inbox.searchParams.has('conversation')).toBe(false)
    expect(inbox.searchParams.get('owner')).toBe('me')
    expect(inbox.hash).toBe('#repair')
    expect(repairReturnPath('DEAL-1', '/inbox?' + 'x'.repeat(2040))).toBe(
      '/crm/deals/DEAL-1',
    )
  })
  it('carries the bound Deal query and tab, rejecting other deals and external paths', () => {
    const path = '/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity'
    const href = new URL(
      repairOrderHref('RO/1', 'DEAL-1', path),
      'https://crm.invalid',
    )
    expect(href.pathname).toBe('/taller/orders/RO%2F1')
    expect(href.searchParams.get('crm_return_to')).toBe('/crm' + path)
    for (const invalid of [
      'https://evil.test',
      '//evil.test',
      '/deals/OTHER',
      '/crm/deals/OTHER',
      '/deals/DEAL-1\\evil',
      '/deals/DEAL-1\n',
    ])
      expect(repairReturnPath('DEAL-1', invalid)).toBe('/crm/deals/DEAL-1')
  })
})
