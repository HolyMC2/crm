// Duplicate-merge toast summary (spec 4.3b). Pure formatting — mirrors the backend
// artifact keys returned by services/merge.py :: merge_conversation.
import { describe, it, expect } from 'vitest'
import { formatMovedCounts } from '@/utils/mergeSummary'

describe('formatMovedCounts', () => {
  it('joins non-zero counts in artifact order with es-MX labels', () => {
    expect(
      formatMovedCounts({ 'WhatsApp Message': 3, Comment: 1, Tags: 2 }),
    ).toBe('3 mensajes de WhatsApp, 1 comentario, 2 etiquetas')
  })

  it('uses singular for a count of 1 and plural otherwise', () => {
    expect(formatMovedCounts({ 'FCRM Note': 1 })).toBe('1 nota')
    expect(formatMovedCounts({ 'FCRM Note': 4 })).toBe('4 notas')
    expect(formatMovedCounts({ ToDo: 1, 'Messenger Message': 2 })).toBe(
      '2 mensajes de Messenger, 1 tarea',
    )
  })

  it('drops zero counts and unknown keys', () => {
    expect(formatMovedCounts({ 'WhatsApp Message': 0, Comment: 2, Bogus: 9 })).toBe('2 comentarios')
  })

  it('returns empty string for an all-zero / empty / bad input', () => {
    expect(formatMovedCounts({ 'WhatsApp Message': 0, Tags: 0 })).toBe('')
    expect(formatMovedCounts({})).toBe('')
    expect(formatMovedCounts(null)).toBe('')
    expect(formatMovedCounts(undefined)).toBe('')
    expect(formatMovedCounts('nope')).toBe('')
  })
})
