// Pure helpers behind ReportsAgents.vue (P2 S2): duration formatting + the
// client-side column sort (null-sinks-to-bottom) + header-click transition.
import { describe, it, expect } from 'vitest'
import { fmtDuration, sortAgents, nextSort } from '@/utils/agentMetricsFormat'

describe('fmtDuration', () => {
  it('renders — for null/undefined (no measured response)', () => {
    expect(fmtDuration(null)).toBe('—')
    expect(fmtDuration(undefined)).toBe('—')
  })
  it('0 is 0s, not — (a real zero-second response)', () => {
    expect(fmtDuration(0)).toBe('0s')
  })
  it('seconds under a minute', () => {
    expect(fmtDuration(45)).toBe('45s')
  })
  it('minutes under an hour, rounded', () => {
    expect(fmtDuration(130)).toBe('2m')
    expect(fmtDuration(59)).toBe('59s')
    expect(fmtDuration(60)).toBe('1m')
  })
  it('hours with one decimal', () => {
    expect(fmtDuration(3600)).toBe('1.0h')
    expect(fmtDuration(5400)).toBe('1.5h')
  })
})

describe('sortAgents', () => {
  const rows = [
    { agent_name: 'Beto', open: 3, won: 1, won_value: 500, median_response_secs: 300 },
    { agent_name: 'Ana', open: 1, won: 5, won_value: 999, median_response_secs: null },
    { agent_name: 'Caro', open: 2, won: 2, won_value: 100, median_response_secs: 60 },
  ]

  it('never mutates the source array', () => {
    const snapshot = JSON.parse(JSON.stringify(rows))
    sortAgents(rows, 'won_value', 'desc')
    expect(rows).toEqual(snapshot)
  })
  it('numeric desc (won_value)', () => {
    expect(sortAgents(rows, 'won_value', 'desc').map((r) => r.agent_name)).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('numeric asc (open)', () => {
    expect(sortAgents(rows, 'open', 'asc').map((r) => r.agent_name)).toEqual(['Ana', 'Caro', 'Beto'])
  })
  it('null median sinks to the bottom in BOTH directions', () => {
    expect(sortAgents(rows, 'median_response_secs', 'asc').map((r) => r.agent_name)).toEqual(['Caro', 'Beto', 'Ana'])
    expect(sortAgents(rows, 'median_response_secs', 'desc').map((r) => r.agent_name)).toEqual(['Beto', 'Caro', 'Ana'])
  })
  it('text sort uses es locale (asc)', () => {
    expect(sortAgents(rows, 'agent_name', 'asc').map((r) => r.agent_name)).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('tolerates null / empty input', () => {
    expect(sortAgents(null, 'won')).toEqual([])
    expect(sortAgents([], 'won')).toEqual([])
  })
})

describe('nextSort', () => {
  it('a new column starts descending', () => {
    expect(nextSort({ key: 'won', dir: 'asc' }, 'open')).toEqual({ key: 'open', dir: 'desc' })
  })
  it('the active column toggles direction', () => {
    expect(nextSort({ key: 'won', dir: 'desc' }, 'won')).toEqual({ key: 'won', dir: 'asc' })
    expect(nextSort({ key: 'won', dir: 'asc' }, 'won')).toEqual({ key: 'won', dir: 'desc' })
  })
  it('no current sort → descending', () => {
    expect(nextSort(null, 'open')).toEqual({ key: 'open', dir: 'desc' })
  })
})
