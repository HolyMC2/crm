import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    api.calls.push(args)
    return api.behavior(...args)
  },
  dayjsLocal: vi.fn(),
  dayjs: vi.fn(),
  getConfig: vi.fn(),
}))
import { useInquiryWorkspace } from '@/components/Inquiries/useInquiryWorkspace'
import { gateRoute, navItemVisible } from '@/utils/crmCapabilities'

const mounted = []
const detail = (name, extra = {}) => ({
  name,
  title: name,
  modified: 'v1',
  can_write: true,
  people: [],
  ...extra,
})
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, no) => {
    resolve = ok
    reject = no
  })
  return { promise, resolve, reject }
}
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}
function mountWorkspace(name = 'INQ-1', options = {}) {
  const actor = ref('staff@example.test')
  const selected = ref(name)
  let state
  const app = createApp(
    defineComponent({
      setup() {
        state = useInquiryWorkspace(actor, selected, options)
        return () => h('div')
      },
    }),
  )
  const el = document.createElement('div')
  app.mount(el)
  mounted.push(app)
  return { state, actor, selected, app }
}
beforeEach(() => {
  api.calls = []
  api.behavior = async (url, args) => {
    if (url.endsWith('get_inquiry')) return detail(args.name)
    if (url.endsWith('list_inquiries')) return { items: [], has_more: false }
    if (url.endsWith('get_assignees'))
      return [{ name: 'staff@example.test', full_name: 'Staff' }]
    return detail(args.name, { modified: 'v2' })
  }
})
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
})

describe('native inquiry workspace', () => {
  it('treats handoff access revocation as success and removes protected detail without retrying', async () => {
    const behavior = api.behavior
    const tombstone = { name: 'INQ-1', access_revoked: true }
    api.behavior = async (url, args) =>
      url.endsWith('update_inquiry') ? tombstone : behavior(url, args)
    const { state } = mountWorkspace()
    await flush()
    state.items.value = [{ name: 'INQ-1', title: 'Private summary' }]
    const result = await state.mutate('update_inquiry', {
      values: { assigned_to: 'new-owner@example.test' },
    })
    expect(result).toEqual(tombstone)
    expect(state.inquiry.value).toBeNull()
    expect(state.items.value).toEqual([])
    expect(state.transferNotice.value).toContain('Consulta transferida')
    expect(state.mutationError.value).toBeNull()
    expect(state.mutationBusy.value).toBe('')
    expect(state.detailUpdateAvailable.value).toBe(false)
    expect(
      api.calls.filter(([url]) => url.endsWith('list_inquiries')).length,
    ).toBeGreaterThan(1)
  })
  it('refreshes the list on realtime/focus, keeps detail untouched, and removes exact callbacks', async () => {
    const socket = { on: vi.fn(), off: vi.fn() }
    const focusTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const { state, app } = mountWorkspace('INQ-1', { socket, focusTarget })
    await flush()
    const before = api.calls.filter(([url]) =>
      url.endsWith('get_inquiry'),
    ).length
    const callback = socket.on.mock.calls[0][1]
    expect(socket.on.mock.calls[0][0]).toBe('crm_inquiry_updated')
    const record = state.inquiry.value
    callback({})
    await flush()
    expect(state.detailUpdateAvailable.value).toBe(true)
    expect(state.inquiry.value).toBe(record)
    expect(
      api.calls.filter(([url]) => url.endsWith('get_inquiry')),
    ).toHaveLength(before)
    expect(focusTarget.addEventListener).toHaveBeenCalledWith('focus', callback)
    await state.loadDetail()
    expect(state.detailUpdateAvailable.value).toBe(false)
    app.unmount()
    mounted.splice(mounted.indexOf(app), 1)
    expect(socket.off).toHaveBeenCalledWith('crm_inquiry_updated', callback)
    expect(focusTarget.removeEventListener).toHaveBeenCalledWith(
      'focus',
      callback,
    )
  })
  it('core route and navigation remain usable without marketing or known capabilities', () => {
    expect(gateRoute({ name: 'Inquiries' }, false)).toBeNull()
    expect(navItemVisible('Inquiries', false)).toBe(true)
    expect(gateRoute({ name: 'Inquiries' })).toBeNull()
  })

  it('paginates and resets the offset when changing a filter', async () => {
    const { state } = mountWorkspace('')
    await flush()
    state.start.value = 20
    await flush()
    expect(
      api.calls.filter(([url]) => url.endsWith('list_inquiries')).at(-1)[1],
    ).toEqual({
      start: 20,
      page_length: 20,
      status: undefined,
      assigned_to: undefined,
    })
    state.status.value = 'Closed'
    await flush()
    expect(
      api.calls.filter(([url]) => url.endsWith('list_inquiries')).at(-1)[1],
    ).toMatchObject({ start: 0, status: 'Closed' })
  })

  it('never replaces the selected detail with a slower previous selection', async () => {
    const a = deferred(),
      b = deferred()
    api.behavior = (url, args) =>
      url.endsWith('get_inquiry')
        ? args.name === 'A'
          ? a.promise
          : b.promise
        : Promise.resolve([])
    const { state, selected } = mountWorkspace('A')
    selected.value = 'B'
    b.resolve(detail('B'))
    await flush()
    a.resolve(detail('A'))
    await flush()
    expect(state.inquiry.value.name).toBe('B')
    expect(state.detailBusy.value).toBe(false)
  })

  it('does not apply an old mutation or clear another selected record’s busy state', async () => {
    const first = deferred(),
      second = deferred()
    const behavior = api.behavior
    api.behavior = (url, args) =>
      url.endsWith('update_inquiry')
        ? args.name === 'A'
          ? first.promise
          : second.promise
        : behavior(url, args)
    const { state, selected } = mountWorkspace('A')
    await flush()
    const mutatingA = state.mutate('update_inquiry', {
      values: { title: 'A changed' },
    })
    selected.value = 'B'
    await flush()
    const mutatingB = state.mutate('update_inquiry', {
      values: { title: 'B changed' },
    })
    first.resolve(detail('A', { modified: 'v2' }))
    expect(await mutatingA).toBeNull()
    expect(state.inquiry.value.name).toBe('B')
    expect(state.mutationBusy.value).toBe('update_inquiry')
    second.resolve(detail('B', { modified: 'v2' }))
    await mutatingB
    expect(state.mutationBusy.value).toBe('')
  })

  it('rejects stale actor responses and clears private state synchronously on actor change', async () => {
    const pending = deferred()
    const behavior = api.behavior
    let first = true
    api.behavior = (url, args) => {
      if (url.endsWith('get_inquiry') && first) {
        first = false
        return pending.promise
      }
      return behavior(url, args)
    }
    const { state, actor } = mountWorkspace('A')
    actor.value = 'other@example.test'
    expect(state.inquiry.value).toBeNull()
    pending.resolve(detail('SECRET'))
    await flush()
    expect(state.inquiry.value.name).toBe('A')
    expect(state.assignees.value).not.toContainEqual({ name: 'SECRET' })
  })

  it('keeps concurrency failures visible and sends the latest modified value after reload', async () => {
    const behavior = api.behavior
    let fail = true
    api.behavior = async (url, args) => {
      if (url.endsWith('update_inquiry') && fail)
        throw { exc_type: 'TimestampMismatchError' }
      if (url.endsWith('get_inquiry'))
        return detail(args.name, { modified: fail ? 'v1' : 'v2' })
      return behavior(url, args)
    }
    const { state } = mountWorkspace()
    await flush()
    expect(
      await state.mutate('update_inquiry', { values: { title: 'Draft' } }),
    ).toBeNull()
    expect(state.mutationError.value.kind).toBe('conflict')
    expect(state.inquiry.value.modified).toBe('v1')
    fail = false
    await state.loadDetail()
    expect(state.mutationError.value).toBeNull()
    await state.mutate('update_inquiry', { values: { title: 'Draft' } })
    expect(
      api.calls.filter(([url]) => url.endsWith('update_inquiry')).at(-1)[1]
        .modified,
    ).toBe('v2')
  })

  it('uses the explicit conversion response and omits modified from conversion params', async () => {
    const behavior = api.behavior
    api.behavior = async (url, args) =>
      url.endsWith('convert_person')
        ? {
            inquiry: detail(args.name, {
              people: [{ person_key: 'p2', lead: 'LEAD-9' }],
            }),
            lead: 'LEAD-9',
            created: false,
          }
        : behavior(url, args)
    const { state } = mountWorkspace()
    await flush()
    await state.mutate('convert_person', {
      person_key: 'p2',
      existing_lead: 'LEAD-9',
    })
    expect(
      api.calls.find(([url]) => url.endsWith('convert_person'))[1],
    ).toEqual({ name: 'INQ-1', person_key: 'p2', existing_lead: 'LEAD-9' })
    expect(state.inquiry.value.people[0].lead).toBe('LEAD-9')
  })

  it('surfaces unavailable schema and denies local mutations on read-only records', async () => {
    const { state } = mountWorkspace()
    await flush()
    state.inquiry.value.can_write = false
    expect(await state.mutate('add_person', {})).toBeNull()
    expect(api.calls.some(([url]) => url.endsWith('add_person'))).toBe(false)
    api.behavior = async () => {
      throw {
        exc_type: 'ValidationError',
        messages: ['Native inquiries are not installed yet.'],
      }
    }
    await state.loadList()
    expect(state.listError.value.kind).toBe('unavailable')
  })
})
