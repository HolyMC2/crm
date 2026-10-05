import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  repairMoney,
  repairOrderHref,
  repairReturnPath,
  tallerIntakeHref,
  tallerOrderHref,
} from '@/utils/repairOrders'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import { useRepairOrders } from '@/composables/repairOrders'
const context = (orders = []) => ({ orders, can_create: true })
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const scopes = []
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
beforeEach(() => {
  call.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})
async function setup(behavior) {
  call.mockImplementation(behavior || (async () => context()))
  const deal = ref('DEAL-1'),
    scope = effectScope()
  scopes.push(scope)
  const api = scope.run(() => useRepairOrders(() => deal.value))
  await settle()
  return { ...api, deal }
}
const reads = () =>
  call.mock.calls.filter(([method]) =>
    method.endsWith('get_deal_repair_context'),
  ).length

describe('deal repair order list (API boundary doubles)', () => {
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
  })
  it('clears the previous Deal immediately and ignores its late read', async () => {
    const oldRead = deferred(),
      newRead = deferred()
    const api = await setup(async () => context([{ name: 'RO-A' }]))
    call.mockImplementation((method, { deal_name }) =>
      deal_name === 'DEAL-1' ? oldRead.promise : newRead.promise,
    )
    const refresh = api.refresh()
    api.deal.value = 'DEAL-2'
    await nextTick()
    expect(api.state.value.context).toBeNull()
    expect(api.state.value.loading).toBe(true)
    oldRead.resolve(context([{ name: 'RO-A-LATE' }]))
    await refresh
    expect(api.state.value.context).toBeNull()
    newRead.resolve(context([{ name: 'RO-B' }]))
    await settle()
    expect(api.state.value.context.orders[0].name).toBe('RO-B')
  })
  it('never calls a CRM-side create endpoint', async () => {
    await setup()
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'taller.repair.repair_orders.get_deal_repair_context',
    ])
  })
})

describe('reload when the operator returns from taller Intake', () => {
  it('reloads the list on focus, visible tab and bfcache restore, one read per return', async () => {
    const api = await setup()
    expect(reads()).toBe(1)
    vi.setSystemTime(Date.now() + 5000)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(reads()).toBe(2)
    vi.setSystemTime(Date.now() + 5000)
    const restored = new Event('pageshow')
    restored.persisted = true
    window.dispatchEvent(restored)
    await settle()
    expect(reads()).toBe(3)
    vi.setSystemTime(Date.now() + 5000)
    window.dispatchEvent(new Event('pageshow'))
    await settle()
    expect(reads()).toBe(3)
    expect(api.state.value.context.orders).toEqual([])
  })
  it('keeps the loaded list on screen while it reloads', async () => {
    const later = deferred()
    const api = await setup(async () => context([{ name: 'RO-A' }]))
    call.mockImplementation(() => later.promise)
    vi.setSystemTime(Date.now() + 5000)
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(api.state.value.context.orders[0].name).toBe('RO-A')
    later.resolve(context([{ name: 'RO-A' }, { name: 'RO-NEW' }]))
    await settle()
    expect(api.state.value.context.orders.map((ro) => ro.name)).toEqual([
      'RO-A',
      'RO-NEW',
    ])
  })
  it('ignores returns while hidden and stops listening once disposed', async () => {
    await setup()
    const hidden = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    vi.setSystemTime(Date.now() + 5000)
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(reads()).toBe(1)
    hidden.mockRestore()
    scopes.splice(0).forEach((scope) => scope.stop())
    vi.setSystemTime(Date.now() + 5000)
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(reads()).toBe(1)
  })
})

describe('taller Intake handoff URL', () => {
  const parse = (href) => new URL(href, 'https://crm.invalid')
  it('targets taller Intake with the Deal and the current CRM path, both encoded', () => {
    const href = tallerIntakeHref(
      'DEAL 1/ñ&x=1',
      '/deals/DEAL%201%2F%C3%B1%26x%3D1?returnTo=%2Fdeals%3Fowner%3Dme#repair',
    )
    expect(href).toBe(
      '/taller/intake?deal=' +
        encodeURIComponent('DEAL 1/ñ&x=1') +
        '&return=' +
        encodeURIComponent(
          '/crm/deals/DEAL%201%2F%C3%B1%26x%3D1?returnTo=%2Fdeals%3Fowner%3Dme#repair',
        ),
    )
    const url = parse(href)
    expect(url.pathname).toBe('/taller/intake')
    expect([...url.searchParams.keys()]).toEqual(['deal', 'return'])
    expect(url.searchParams.get('deal')).toBe('DEAL 1/ñ&x=1')
  })
  it('keeps the return inside /crm/ and falls back to the Deal page otherwise', () => {
    const back = (path) =>
      parse(tallerIntakeHref('DEAL-1', path)).searchParams.get('return')
    expect(back('/crm/deal/DEAL-1')).toBe('/crm/deal/DEAL-1')
    expect(back('/inbox?owner=me')).toMatch(/^\/crm\/inbox\?/)
    for (const invalid of [
      'https://evil.test/crm/deals/DEAL-1',
      '//evil.test',
      '/deals/OTHER',
      '/taller/orders',
      '/deals/DEAL-1\\evil',
      null,
    ]) {
      expect(back(invalid)).toBe('/crm/deals/DEAL-1')
      expect(back(invalid).startsWith('/crm/')).toBe(true)
    }
  })
  it('refuses to build a handoff without a Deal', () => {
    expect(tallerIntakeHref('', '/deals/X')).toBeNull()
    expect(tallerIntakeHref(null, '/deals/X')).toBeNull()
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

describe('tallerOrderHref', () => {
  const at = (pathname, search = '') => ({ pathname, search })
  it('opens the Taller record with the way back to this CRM page', () => {
    expect(
      tallerOrderHref(
        'RO 1',
        'Ana López',
        at('/crm/contactos/C-1', '?tab=repairs'),
      ),
    ).toBe(
      '/taller/orders/RO%201?return_to=%2Fcrm%2Fcontactos%2FC-1%3Ftab%3Drepairs&return_label=Ana+L%C3%B3pez',
    )
  })
  it('caps the label and omits an empty one', () => {
    const href = tallerOrderHref('RO-1', 'x'.repeat(60), at('/crm/inbox'))
    expect(
      new URL(href, 'https://x.invalid').searchParams.get('return_label'),
    ).toHaveLength(40)
    expect(tallerOrderHref('RO-1', '', at('/crm/inbox'))).toBe(
      '/taller/orders/RO-1?return_to=%2Fcrm%2Finbox',
    )
  })
  it('never forwards a location outside the CRM', () => {
    expect(tallerOrderHref('RO-1', 'A', at('/desk/contact/C-1'))).toBe(
      '/taller/orders/RO-1',
    )
    expect(tallerOrderHref('RO-1', 'A', at('/crm/a\\b'))).toBe(
      '/taller/orders/RO-1',
    )
  })
})
