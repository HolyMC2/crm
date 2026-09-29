import { describe, expect, it } from 'vitest'
import {
  LIST_STATE_MAX_AGE_MS,
  clearListState,
  listStateKey,
  readListState,
  restoreListParams,
  snapshotListState,
  writeListState,
} from '@/utils/listViewState'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  }
}

const params = {
  doctype: 'CRM Deal',
  filters: { status: 'Open', next_activity_at: ['<', '@today'] },
  or_filters: { deal_name: ['LIKE', '%ana%'] },
  order_by: 'next_activity_at asc',
  view: { custom_view_name: 'V1', view_type: 'list', group_by_field: 'owner' },
  page_length: 60,
  page_length_count: 20,
}

describe('list state key', () => {
  it('separates users, doctypes, views and view types', () => {
    const a = listStateKey('ana@x', 'CRM Deal', 'V1', 'list')
    expect(a).not.toBe(listStateKey('bea@x', 'CRM Deal', 'V1', 'list'))
    expect(a).not.toBe(listStateKey('ana@x', 'CRM Lead', 'V1', 'list'))
    expect(a).not.toBe(listStateKey('ana@x', 'CRM Deal', '', 'list'))
    expect(a).not.toBe(listStateKey('ana@x', 'CRM Deal', 'V1', 'group_by'))
  })
})

describe('save and restore', () => {
  it('round-trips filters, search, sort, pages and scroll', () => {
    const storage = memoryStorage()
    const key = listStateKey('ana@x', 'CRM Deal', 'V1', 'list')
    const snap = snapshotListState(params, {
      scrollTop: 812.4,
      viewUpdated: true,
      now: 1000,
    })
    expect(writeListState(storage, key, snap)).toBe(true)
    const state = readListState(storage, key, { now: 2000 })
    expect(state).toMatchObject({
      scrollTop: 812,
      viewUpdated: true,
      page_length: 60,
      page_length_count: 20,
    })

    const fresh = {
      ...params,
      filters: {},
      or_filters: undefined,
      order_by: 'modified desc',
      page_length: undefined,
      page_length_count: undefined,
      view: { ...params.view, group_by_field: 'deal_owner' },
    }
    const restored = restoreListParams(fresh, state)
    expect(restored.filters).toEqual(params.filters)
    expect(restored.or_filters).toEqual(params.or_filters)
    expect(restored.order_by).toBe('next_activity_at asc')
    expect(restored.page_length).toBe(60)
    expect(restored.page_length_count).toBe(20)
    expect(restored.view.group_by_field).toBe('owner')
    // the stored snapshot is a copy, never the live params object
    restored.filters.status = 'Won'
    expect(params.filters.status).toBe('Open')
  })

  it('ignores stale, missing and unreadable state', () => {
    const storage = memoryStorage()
    const key = 'k'
    expect(readListState(storage, key)).toBeNull()
    storage.setItem(key, '{not json')
    expect(readListState(storage, key)).toBeNull()
    writeListState(storage, key, snapshotListState(params, { now: 0 }))
    expect(
      readListState(storage, key, { now: LIST_STATE_MAX_AGE_MS + 1 }),
    ).toBeNull()
    clearListState(storage, key)
    expect(storage.getItem(key)).toBeNull()
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('full')
      },
      removeItem() {
        throw new Error('blocked')
      },
    }
    expect(writeListState(broken, 'k', {})).toBe(false)
    expect(readListState(broken, 'k')).toBeNull()
    expect(() => clearListState(broken, 'k')).not.toThrow()
  })

  it('leaves params alone without state', () => {
    expect(restoreListParams(params, null)).toBe(params)
  })
})
