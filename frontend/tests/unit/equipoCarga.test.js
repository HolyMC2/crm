import { describe, expect, it } from 'vitest'
import {
  extraLabel,
  levelClass,
  shiftDay,
  verdictLabel,
  verdictTone,
} from '@/components/equipo/carga'

describe('Equipo › Carga', () => {
  it('names each judgment and colours only what needs a look (StatusChip tones)', () => {
    expect(verdictLabel('sin_aporte')).toBe('Nothing done')
    expect(verdictTone('sin_aporte')).toBe('danger')
    expect(verdictTone('bajo')).toBe('warning')
    expect(verdictTone('aporta')).toBe('neutral')
    expect(verdictLabel('compensa')).toBe('Makes up for it')
    expect(verdictTone('compensa')).toBe('info')
    expect(verdictLabel('whatever')).toBe('No data yet')
  })

  it('shows a strong area on the secondary container', () => {
    expect(levelClass('alto')).toContain('secondary-container')
    expect(levelClass('nada')).toContain('amber')
  })

  it('counts extra tasks', () => {
    expect(extraLabel(1)).toBe('1 extra task')
    expect(extraLabel(3)).toBe('3 extra tasks')
  })

  it('moves a day without drifting across time zones', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDay('2026-11-26', -7)).toBe('2026-11-19')
  })
})
