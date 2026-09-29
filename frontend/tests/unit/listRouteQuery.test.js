import { describe, expect, it } from 'vitest'
import {
  creationFilter,
  initialListParams,
  isBackToSource,
  nextDay,
  parseDealListQuery,
  withoutRouteQuery,
} from '@/utils/listRouteQuery'
import { restoreListParams, snapshotListState } from '@/utils/listViewState'

// the query PipelineAnalysis (origin and the embudo lane) pushes
const PIPELINE_DRILL = {
  report: 'pipeline',
  status: 'Qualification',
  pipeline: 'Ventas',
  created_from: '2026-09-01',
  created_to: '2026-09-28',
}

const viewParams = {
  doctype: 'CRM Deal',
  filters: { status: ['not in', ['Won', 'Lost']] },
  order_by: 'modified desc',
  view: { custom_view_name: 'todos', view_type: 'list', group_by_field: '' },
  page_length: 20,
  page_length_count: 20,
}

describe('parseDealListQuery', () => {
  it('maps the pipeline report query onto list filters', () => {
    const drill = parseDealListQuery(PIPELINE_DRILL)
    expect(drill.filters).toEqual({
      status: 'Qualification',
      pipeline: 'Ventas',
      creation: ['between', ['2026-09-01', '2026-09-28']],
    })
    expect(drill.source.name).toBe('Pipeline Analysis')
    expect(drill.keys).toEqual([
      'report',
      'status',
      'pipeline',
      'created_from',
      'created_to',
    ])
  })

  it('reads the owner and repeated values as `in` filters', () => {
    const drill = parseDealListQuery({
      report: 'pipeline',
      status: ['Won', 'Lost'],
      owner: 'ana@example.com',
    })
    expect(drill.filters).toEqual({
      status: ['in', ['Won', 'Lost']],
      deal_owner: 'ana@example.com',
    })
    expect(
      parseDealListQuery({ report: 'pipeline', owner: ['a@x.mx', 'b@x.mx'] })
        .filters,
    ).toEqual({ deal_owner: ['in', ['a@x.mx', 'b@x.mx']] })
  })

  it('keeps an open-ended creation window in site dates', () => {
    expect(
      parseDealListQuery({ report: 'pipeline', created_to: '2026-09-30' })
        .filters,
    ).toEqual({ creation: ['<', '2026-10-01'] })
    expect(
      parseDealListQuery({ report: 'pipeline', created_from: '2026-09-01' })
        .filters,
    ).toEqual({ creation: ['>=', '2026-09-01'] })
  })

  it('ignores bad dates and orders a reversed window', () => {
    expect(
      parseDealListQuery({
        report: 'pipeline',
        status: 'Won',
        created_from: '2026-02-30',
        created_to: 'yesterday',
      }).filters,
    ).toEqual({ status: 'Won' })
    expect(
      parseDealListQuery({
        report: 'pipeline',
        created_from: '2026-09-28',
        created_to: '2026-09-01',
      }).filters.creation,
    ).toEqual(['between', ['2026-09-01', '2026-09-28']])
  })

  it('is null without a known report or without any filter', () => {
    expect(parseDealListQuery({})).toBeNull()
    expect(parseDealListQuery({ status: 'Won' })).toBeNull()
    expect(parseDealListQuery({ report: 'other', status: 'Won' })).toBeNull()
    expect(parseDealListQuery({ report: 'pipeline' })).toBeNull()
    expect(parseDealListQuery({ report: 'pipeline', status: '' })).toBeNull()
  })

  it('gives the same query the same key and another query another', () => {
    const a = parseDealListQuery(PIPELINE_DRILL)
    const b = parseDealListQuery({ ...PIPELINE_DRILL, view: 'todos' })
    const c = parseDealListQuery({ ...PIPELINE_DRILL, status: 'Won' })
    expect(a.key).toBe(b.key)
    expect(a.key).not.toBe(c.key)
  })
})

describe('creationFilter / nextDay', () => {
  it('rolls over month and year ends', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
    expect(creationFilter('', '')).toBeNull()
  })
})

describe('initialListParams', () => {
  const drill = parseDealListQuery(PIPELINE_DRILL)
  const stored = snapshotListState(
    {
      ...viewParams,
      filters: { status: 'Won' },
      or_filters: { deal_name: ['LIKE', '%ana%'] },
      order_by: 'deal_value desc',
    },
    { scrollTop: 400, viewUpdated: true },
  )
  const opts = { restore: restoreListParams }

  it('without a drill, lays the stored state over the view as before', () => {
    const out = initialListParams(viewParams, { ...opts, restored: stored })
    expect(out.params.filters).toEqual({ status: 'Won' })
    expect(out.params.order_by).toBe('deal_value desc')
    expect(out.state).toBe(stored)
    expect(out.viewUpdated).toBe(true)
    expect(initialListParams(viewParams, opts)).toEqual({
      params: viewParams,
      state: null,
      viewUpdated: false,
    })
  })

  it('an explicit drill replaces the filters and ignores the stored state', () => {
    const out = initialListParams(viewParams, {
      ...opts,
      restored: stored,
      incoming: drill,
      returning: false,
    })
    expect(out.params.filters).toEqual(drill.filters)
    expect(out.params.filters).not.toBe(drill.filters)
    expect(out.params.or_filters).toBeUndefined()
    expect(out.params.order_by).toBe('modified desc')
    expect(out.state).toBeNull()
    expect(out.viewUpdated).toBe(true)
  })

  it('state saved under another drill never overrides the incoming one', () => {
    const other = { ...stored, routeKey: 'another drill' }
    const out = initialListParams(viewParams, {
      ...opts,
      restored: other,
      incoming: drill,
      returning: true,
    })
    expect(out.params.filters).toEqual(drill.filters)
    expect(out.state).toBeNull()
  })

  it('coming back to the same drill entry keeps what the worker did since', () => {
    const same = snapshotListState(
      { ...viewParams, filters: { ...drill.filters, deal_owner: 'ana' } },
      { scrollTop: 250, viewUpdated: true, routeKey: drill.key },
    )
    const back = initialListParams(viewParams, {
      ...opts,
      restored: same,
      incoming: drill,
      returning: true,
    })
    expect(back.params.filters).toEqual({ ...drill.filters, deal_owner: 'ana' })
    expect(back.state.scrollTop).toBe(250)
    // the same link opened afresh (a new history entry) starts from the drill
    const fresh = initialListParams(viewParams, {
      ...opts,
      restored: same,
      incoming: drill,
      returning: false,
    })
    expect(fresh.params.filters).toEqual(drill.filters)
  })
})

describe('withoutRouteQuery / isBackToSource', () => {
  it('drops only the drill keys', () => {
    expect(withoutRouteQuery({ ...PIPELINE_DRILL, view: 'todos' })).toEqual({
      view: 'todos',
    })
  })

  it('matches the previous entry by path, ignoring its query', () => {
    expect(
      isBackToSource(
        '/pipeline-analysis?period=month&pipeline=Ventas',
        '/pipeline-analysis',
      ),
    ).toBe(true)
    expect(isBackToSource('/deals/view/list', '/pipeline-analysis')).toBe(false)
    expect(isBackToSource(null, '/pipeline-analysis')).toBe(false)
  })
})
