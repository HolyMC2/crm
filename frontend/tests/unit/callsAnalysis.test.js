// The calls page's words for a call (components/doco/calls/calls.js): the
// full time on a 12-hour clock, who was on shift, and the analysis action.
import { describe, it, expect } from 'vitest'
import {
  GOAL,
  SENTIMENT,
  analysisAction,
  callAgo,
  callWhen,
  onShift,
  time12,
} from '@/components/doco/calls/calls'

describe('call time', () => {
  it('reads on a 12-hour clock', () => {
    expect(time12('2026-10-28 16:05:00')).toBe('4:05 p. m.')
    expect(time12('2026-10-28 00:30:00')).toBe('12:30 a. m.')
    expect(time12('2026-10-28 12:00:00')).toBe('12:00 p. m.')
    expect(time12('')).toBe('')
  })

  it('names the weekday and day, then the time', () => {
    const now = new Date(2026, 9, 28, 18, 0)
    const when = callWhen('2026-10-27 09:15:00', { now })
    expect(when).toMatch(/^mar.* 27 .*oct.* · 9:15 a\. m\.$/)
    expect(when).not.toMatch(/2026/)
  })

  it('adds the year for a call from another year', () => {
    const now = new Date(2026, 9, 28, 18, 0)
    expect(callWhen('2025-12-31 20:00:00', { now })).toMatch(/2025/)
  })
})

describe('how long ago', () => {
  const now = new Date(2026, 9, 28, 18, 0)

  it('says it for the last week only; older calls have their date', () => {
    expect(callAgo('2026-10-28 15:00:00', { now })).toBe('hace 3 h')
    expect(callAgo('2026-10-27 15:00:00', { now })).toBe('ayer')
    expect(callAgo('2026-10-20 15:00:00', { now })).toBe('')
    expect(callAgo('', { now })).toBe('')
  })
})

describe('on shift', () => {
  const shifts = [
    { name: 'Ana López', start: '2026-10-28T09:00', end: '2026-10-28T17:00' },
    { name: 'Beto Ruiz', start: '2026-10-28T15:00', end: '2026-10-28T23:00' },
    { name: 'Ana López', start: '2026-10-28T09:00', end: '2026-10-28T17:00' },
    { name: 'Caro Díaz', start: '2026-10-27T22:00', end: '2026-10-28T06:00' },
  ]

  it('names everyone working when the call started, once each', () => {
    expect(onShift('2026-10-28 16:15:00', shifts)).toEqual(['Ana', 'Beto'])
  })

  it('counts a night shift past midnight and ends shifts at their end', () => {
    expect(onShift('2026-10-28 02:00:00', shifts)).toEqual(['Caro'])
    expect(onShift('2026-10-28 17:00:00', shifts)).toEqual(['Beto'])
  })

  it('is empty without a time or shifts', () => {
    expect(onShift('', shifts)).toEqual([])
    expect(onShift('2026-10-28 16:15:00')).toEqual([])
  })
})

describe('analysis action', () => {
  it('explains why a call without a recording cannot be transcribed', () => {
    const action = analysisAction({})
    expect(action.allowed).toBe(false)
    expect(action.hint).toMatch(/no tiene grabación/)
  })

  it('offers the first run, then a rerun', () => {
    const first = analysisAction({ recording_url_path: '/rec' })
    expect(first).toMatchObject({
      allowed: true,
      label: 'Transcribir y analizar',
    })
    const again = analysisAction({
      recording_url_path: '/rec',
      transcript: 'Hola',
    })
    expect(again).toMatchObject({ allowed: true, label: 'Volver a analizar' })
  })

  it('waits while the job runs and shows a failure note', () => {
    expect(
      analysisAction({
        recording_url_path: '/rec',
        analysis_status: 'en_proceso',
      }).allowed,
    ).toBe(false)
    const failed = analysisAction({
      recording_url_path: '/rec',
      analysis_status: 'error',
      analysis_note: 'No se pudo transcribir la grabación.',
    })
    expect(failed).toMatchObject({
      allowed: true,
      hint: 'No se pudo transcribir la grabación.',
    })
  })
})

describe('chips', () => {
  it('words every stored choice', () => {
    expect(Object.keys(GOAL)).toEqual(['si', 'parcial', 'no'])
    expect(Object.keys(SENTIMENT)).toEqual(['positivo', 'neutral', 'negativo'])
    expect(GOAL.no.tone).toBe('danger')
  })
})
