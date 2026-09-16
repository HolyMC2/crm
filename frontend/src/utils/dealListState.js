import { FOLLOW_UP_QUEUES } from './dealFollowUp'
import { isGroupBy } from './dealGroups'
// Per-user, per-tab list context survives a visit to the deal workspace.
const SORTS = ['modified', 'organization', 'deal_name', 'mobile_no', 'deal_value', 'expected_deal_value', 'expected_closure_date', 'next_activity_at', 'status', 'creation']
export function dealListState(raw = {}) {
  const list = (key) => Array.isArray(raw?.[key]) ? raw[key].filter((v) => typeof v === 'string') : []
  return {
    status: list('status'), source: list('source'), owner: list('owner'),
    followUp: FOLLOW_UP_QUEUES.some(q => q.key === raw?.followUp) ? raw.followUp : 'all',
    search: typeof raw?.search === 'string' ? raw.search : '',
    view: ['list', 'board', 'funnel'].includes(raw?.view) ? raw.view : 'list',
    groupBy: isGroupBy(raw?.groupBy) ? raw.groupBy : 'none',
    // The saved view the context came from, so returning from a deal still shows
    // it as the selected one. An unknown name simply selects nothing.
    viewName: raw?.viewName == null ? '' : String(raw.viewName),
    sort: { field: SORTS.includes(raw?.sort?.field) ? raw.sort.field : 'modified', dir: raw?.sort?.dir === 'asc' ? 'asc' : 'desc' },
  }
}
