import { describe, expect, it } from 'vitest'
import { dealQueues, queueKey, queueRoute } from '@/utils/dealQueues'

const view = (name, key, extra = {}) => ({
  name,
  dt: 'CRM Deal',
  public: 1,
  crm_seed_key: key,
  label: name,
  ...extra,
})

describe('dealQueues', () => {
  it('reads the server namespaced seed key (crm.deal_queue.<key>)', () => {
    expect(queueKey('crm.deal_queue.vencidos')).toBe('vencidos')
    expect(queueKey('todos')).toBe('todos')
    const out = dealQueues([
      view('40', 'crm.deal_queue.sin_seguimiento'),
      view('36', 'crm.deal_queue.todos'),
    ])
    expect(out.map((v) => v.name)).toEqual(['36', '40'])
  })

  it('orders seeded queues for the daily chain, whatever the server order', () => {
    const out = dealQueues([
      view('5', 'sin_seguimiento'),
      view('2', 'vencidos'),
      view('1', 'todos'),
      view('4', 'sin_fecha'),
      view('3', 'para_hoy'),
    ])
    expect(out.map((v) => v.name)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('ignores private, other-doctype, unseeded and unknown-key views', () => {
    const out = dealQueues([
      view('a', 'todos', { public: 0 }),
      view('b', 'todos', { dt: 'CRM Lead' }),
      view('c', ''),
      view('d', 'mystery'),
      view('e', 'vencidos'),
    ])
    expect(out.map((v) => v.name)).toEqual(['e'])
  })

  it('keeps the first view per key and tolerates empty input', () => {
    expect(dealQueues(null)).toEqual([])
    const out = dealQueues([view('x', 'todos'), view('y', 'todos')])
    expect(out.map((v) => v.name)).toEqual(['x'])
  })

  it('routes to the view by name in its own view type', () => {
    expect(queueRoute(view('7', 'todos', { type: 'kanban' }))).toEqual({
      name: 'Deals',
      params: { viewType: 'kanban' },
      query: { view: '7' },
    })
    expect(queueRoute(view('8', 'todos')).params.viewType).toBe('list')
  })
})
