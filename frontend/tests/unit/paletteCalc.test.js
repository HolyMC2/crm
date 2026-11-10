// The palette's calculator (the awesomebar's): what is a sum, and its result.
import { beforeEach, describe, expect, it } from 'vitest'
import { parsePaletteQuery } from '@/vendor/muelle-shell/contracts'
import { calculate, createCalculatorProvider } from '@/utils/paletteCalc'

beforeEach(() => {
  globalThis.__ = (text) => text
})

describe('calculate', () => {
  it.each([
    ['2+2', 4],
    ['1250*1.16', 1450],
    ['1,250.50 + 49.50', 1300],
    ['(100 + 20) / 4', 30],
    ['10 - 2 * 3', 4],
    ['-5 + 8', 3],
    ['2^10', 1024],
    ['2 x 3', 6],
    ['9 ÷ 3', 3],
    ['0.1 + 0.2', 0.3],
    ['=42', 42],
    ['= 3 * (2 + 1)', 9],
  ])('%s = %s', (text, value) => {
    expect(calculate(text)).toBe(value)
  })

  it('a percentage is hundredths, and of what came before when added or taken away', () => {
    expect(calculate('200 * 16%')).toBe(32)
    expect(calculate('1250 + 16%')).toBe(1450)
    expect(calculate('1000 - 10%')).toBe(900)
    expect(calculate('50%')).toBe(0.5)
    // A percentage inside a product is plain hundredths.
    expect(calculate('100 + 50% * 10')).toBe(105)
  })

  it.each([
    'juan',
    '42',
    '6691234567',
    '2026-11-10',
    '10/11/2026',
    'ACC-SINV-2026-00058',
    '1,25 + 3',
    '2 +',
    '(2 + 3',
    '5 / 0',
    '10 % 3',
    '',
    '+',
  ])('«%s» is not a sum', (text) => {
    expect(calculate(text)).toBeNull()
  })
})

describe('the calculator row', () => {
  const rows = (raw) =>
    createCalculatorProvider().search(parsePaletteQuery(raw))

  it('shows the result and copies it on ↵', async () => {
    expect(await rows('1250*1.16')).toEqual([
      {
        id: 'calculadora',
        group: 'acciones',
        title: '1250*1.16 = 1,450',
        subtitle: 'Copy the result',
        icon: 'lucide-calculator',
        action: 'copy',
        args: { text: '1450' },
        lead: true,
      },
    ])
    expect((await rows('=7/2'))[0].title).toBe('7/2 = 3.5')
  })

  it('a phone or a date typed in the palette is not worked out', async () => {
    expect(await rows('669-123-4567')).toEqual([])
    expect(await rows('2026-11-10')).toEqual([])
    expect(await rows('')).toEqual([])
    expect(await rows('pantalla 12')).toEqual([])
  })
})
