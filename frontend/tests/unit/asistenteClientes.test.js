import { describe, expect, it } from 'vitest'
import {
  decisionText,
  modes,
  providerIcon,
  providerLabel,
  toolLimits,
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

  it('says what a tool lacks on this shop, and nothing for the rest', () => {
    const tools = [
      { name: 'shop_facts', label: 'Datos del negocio', available: true },
      {
        name: 'product_hold',
        label: 'Apartar productos',
        available: false,
        blocker: 'Para apartar, enciende la venta en línea de la tienda.',
      },
      {
        name: 'repair_payment',
        label: 'Cobrar en línea',
        available: true,
        note: 'Sin pagos en línea: dice el saldo y que se paga en la tienda.',
      },
    ]
    expect(toolLimits(tools)).toEqual([
      {
        name: 'product_hold',
        label: 'Apartar productos',
        text: 'Para apartar, enciende la venta en línea de la tienda.',
        off: true,
      },
      {
        name: 'repair_payment',
        label: 'Cobrar en línea',
        text: 'Sin pagos en línea: dice el saldo y que se paga en la tienda.',
        off: false,
      },
    ])
    expect(toolLimits(undefined)).toEqual([])
  })
})
