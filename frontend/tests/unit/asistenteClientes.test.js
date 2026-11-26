import { describe, expect, it } from 'vitest'
import {
  decisionText,
  modes,
  providerIcon,
  providerLabel,
} from '@/components/asistente/clientes'

describe('asistente para clientes', () => {
  it('offers the three ways a reply reaches the customer, automatic as a trial', () => {
    expect(modes.map((m) => m.value)).toEqual([
      'borrador',
      'informativo',
      'automatico',
    ])
    expect(modes.find((m) => m.value === 'automatico').trial).toBe(true)
    expect(modes[0].label).toBe('Todo pasa por revisión')
  })

  it('names each channel in the worker words', () => {
    expect(providerLabel('Webchat')).toBe('Chat de la tienda')
    expect(providerIcon('WhatsApp')).toBe('lucide-message-circle')
    expect(providerIcon('Otro')).toBe('lucide-message-circle')
  })

  it('says what a test reply would do', () => {
    expect(decisionText({ decision: 'send' })).toBe('Saldría sola.')
    expect(decisionText({ decision: 'handoff' })).toBe(
      'Pasaría con una persona del equipo.',
    )
    expect(
      decisionText({ decision: 'review', reason: 'ungrounded:$700' }),
    ).toBe('Esperaría revisión: $700 no salió de una herramienta.')
    expect(decisionText({ decision: 'review', reason: 'borrador' })).toBe(
      'Esperaría revisión de un gerente.',
    )
  })
})
