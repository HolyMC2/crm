// GlobalSearch pure logic (spec 2.6 + 2.7): the snippet-highlight splitter and the
// input debounce. Both are side-effect-free, so no module mocks / fresh-import dance
// is needed here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { highlightSegments, debounce } from '@/utils/searchHighlight'

describe('highlightSegments', () => {
  it('splits around the match and flags only the match segment', () => {
    const segs = highlightSegments('necesito una pantalla', 'pantalla')
    expect(segs).toEqual([
      { text: 'necesito una ', match: false },
      { text: 'pantalla', match: true },
    ])
  })

  it('is case-insensitive but preserves the ORIGINAL casing of the text', () => {
    const segs = highlightSegments('Cambio de PANTALLA hoy', 'pantalla')
    const match = segs.find((s) => s.match)
    expect(match.text).toBe('PANTALLA') // original case kept, not the query case
  })

  it('highlights every occurrence', () => {
    const segs = highlightSegments('abc abc abc', 'abc')
    expect(segs.filter((s) => s.match)).toHaveLength(3)
  })

  it('treats the query literally — regex metacharacters do not blow up', () => {
    const segs = highlightSegments('precio a.b final', 'a.b')
    expect(segs.some((s) => s.match && s.text === 'a.b')).toBe(true)
    // a literal-dot query must NOT match "axb" (proves it is not a RegExp)
    expect(highlightSegments('axb', 'a.b').some((s) => s.match)).toBe(false)
  })

  it('returns a single non-match segment when there is no query', () => {
    expect(highlightSegments('hola', '')).toEqual([{ text: 'hola', match: false }])
    expect(highlightSegments('hola', '   ')).toEqual([{ text: 'hola', match: false }])
  })

  it('returns a single non-match segment when the query is absent from the text', () => {
    expect(highlightSegments('hola mundo', 'zzz')).toEqual([{ text: 'hola mundo', match: false }])
  })

  it('returns [] for empty/nullish text', () => {
    expect(highlightSegments('', 'x')).toEqual([])
    expect(highlightSegments(null, 'x')).toEqual([])
    expect(highlightSegments(undefined, undefined)).toEqual([])
  })

  it('is lossless — joining segment text reconstructs the original', () => {
    const text = 'El cliente pidió una MICA y otra mica para su iphone'
    const joined = highlightSegments(text, 'mica')
      .map((s) => s.text)
      .join('')
    expect(joined).toBe(text)
  })
})

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst into a single trailing call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d()
    d()
    d()
    expect(fn).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(299)
    expect(fn).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('invokes with the arguments of the LAST call in the burst', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('a')
    d('b')
    d('c')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledWith('c')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel() drops a pending run', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('x')
    d.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(0)
  })

  it('fires again for a separate burst after the window', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('one')
    vi.advanceTimersByTime(300)
    d('two')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, 'one')
    expect(fn).toHaveBeenNthCalledWith(2, 'two')
  })
})
