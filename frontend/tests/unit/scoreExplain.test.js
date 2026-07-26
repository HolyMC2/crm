// Score-explain pure helpers (ScoreExplainPopover.vue, spec 5.4). No frappe-ui
// mock here, so the vitest-4 spy-results trap (see outbox.test.js) does not apply.
import { describe, it, expect } from 'vitest'
import { signedPoints, criterionText, gradeHeadline, popoverPosition } from '@/utils/scoreExplain'

const MINUS = '−' // true minus sign the badge renders

describe('signedPoints', () => {
  it('prefixes a plus for positive contributions', () => {
    expect(signedPoints(20)).toBe('+20')
    expect(signedPoints(1)).toBe('+1')
  })

  it('uses a true minus sign for negative contributions', () => {
    expect(signedPoints(-15)).toBe(`${MINUS}15`)
    expect(signedPoints(-1)).toBe(`${MINUS}1`)
  })

  it('renders a bare zero', () => {
    expect(signedPoints(0)).toBe('0')
  })

  it('coerces and truncates non-integers / junk to a safe value', () => {
    expect(signedPoints(7.9)).toBe('+7')
    expect(signedPoints('12')).toBe('+12')
    expect(signedPoints(null)).toBe('0')
    expect(signedPoints(undefined)).toBe('0')
    expect(signedPoints('nope')).toBe('0')
  })
})

describe('criterionText', () => {
  it('phrases each operator compactly', () => {
    expect(criterionText('source', 'equals', 'Website')).toBe('source = Website')
    expect(criterionText('source', 'not equals', 'Cold')).toBe('source ≠ Cold')
    expect(criterionText('mobile_no', 'is set', null)).toBe('mobile_no definido')
    expect(criterionText('email', 'is not set', null)).toBe('email sin definir')
    expect(criterionText('email', 'contains', 'doco')).toBe('email contiene «doco»')
    expect(criterionText('territory', 'in', 'MX,US')).toBe('territory ∈ MX,US')
    expect(criterionText('score', 'greater than', '50')).toBe('score > 50')
    expect(criterionText('score', 'less than', '10')).toBe('score < 10')
  })

  it('falls back to a joined form for an unknown operator', () => {
    expect(criterionText('x', 'weird op', 'v')).toBe('x weird op v')
  })

  it('tolerates missing field / value', () => {
    expect(criterionText('', 'is set', null)).toBe('definido')
    expect(criterionText('source', 'equals', null)).toBe('source =')
  })
})

describe('gradeHeadline', () => {
  it('reads "por qué B · 62" with grade and score', () => {
    expect(gradeHeadline('B', 62)).toBe('por qué B · 62')
    expect(gradeHeadline('A', 0)).toBe('por qué A · 0')
  })

  it('drops the score when it is absent', () => {
    expect(gradeHeadline('C', '')).toBe('por qué C')
    expect(gradeHeadline('C', null)).toBe('por qué C')
  })

  it('falls back to a plain score line when ungraded', () => {
    expect(gradeHeadline('', 40)).toBe('Puntaje 40')
    expect(gradeHeadline(null, '')).toBe('Puntaje')
  })
})

describe('popoverPosition', () => {
  const vp = { w: 400, h: 800 }
  const card = { w: 300, h: 200 }

  it('drops below the trigger when there is room', () => {
    const rect = { top: 100, bottom: 120, left: 40 }
    expect(popoverPosition(rect, card, vp)).toEqual({ top: 126, left: 40 })
  })

  it('flips above when the card would overflow the bottom', () => {
    const rect = { top: 700, bottom: 720, left: 40 }
    // 720+6+200 = 926 > 800 → place above: 700-6-200 = 494
    expect(popoverPosition(rect, card, vp)).toEqual({ top: 494, left: 40 })
  })

  it('clamps left so the card stays on screen', () => {
    const rect = { top: 100, bottom: 120, left: 380 }
    // 380+300 = 680 > 400-6 → left = 400-6-300 = 94
    expect(popoverPosition(rect, card, vp)).toEqual({ top: 126, left: 94 })
  })

  it('never lets the card run off the left edge', () => {
    const rect = { top: 100, bottom: 120, left: -50 }
    expect(popoverPosition(rect, card, vp).left).toBe(6)
  })

  it('clamps the top when the card fits neither above nor below', () => {
    const tall = { w: 300, h: 780 }
    const rect = { top: 400, bottom: 420, left: 40 }
    // below overflows; above (400-6-780 < 6) also fails → clamp to vp.h-6-780 = 14
    expect(popoverPosition(rect, tall, vp).top).toBe(14)
  })
})
