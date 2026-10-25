import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [])
vi.mock('frappe-ui', () => {
  const rec = (type) => (message, data) => calls.push([type, message, data])
  return {
    toast: {
      success: rec('success'),
      error: rec('error'),
      warning: rec('warning'),
      info: rec('info'),
    },
  }
})
import {
  handleServerMessages,
  parseServerMessages,
} from '@/utils/serverMessages'

// B7: frappe-ui 1.0.2 hands `_server_messages` of a successful call to the
// configured handler (beta.29 dropped them). crm toasts them by indicator.
beforeEach(() => calls.splice(0))

describe('serverMessages', () => {
  it('keeps what the server styled for the person, once, without Desk title', () => {
    expect(
      parseServerMessages([
        JSON.stringify({ message: 'User x removed.', indicator: 'green' }),
        JSON.stringify({
          message: 'Careful',
          indicator: 'orange',
          title: 'Stock',
        }),
        JSON.stringify({ message: 'Careful', indicator: 'orange' }),
        JSON.stringify({ message: '  ', indicator: 'red' }),
        JSON.stringify({ message: 'Heads up', indicator: 'blue' }),
        JSON.stringify({ message: 'Bad', indicator: 'red' }),
      ]),
    ).toEqual([
      { type: 'success', message: 'User x removed.' },
      { type: 'warning', message: 'Careful' },
      { type: 'info', message: 'Heads up' },
      { type: 'error', message: 'Bad' },
    ])
    expect(parseServerMessages(undefined)).toEqual([])
  })

  // F16-3/F16-4: these rode a 200 and toasted across the bottom nav.
  it('drops what the server only logged on the way to a successful answer', () => {
    expect(
      parseServerMessages([
        // Frappe's permission-check note when an actions probe or an optional read is denied.
        JSON.stringify({
          message:
            'El usuario <strong>x@y</strong> no tiene acceso a este documento: Orden de compra - PUR-ORD-1',
          as_table: false,
          title: 'Mensaje',
        }),
        // A refusal the server raised and caught (the encargado's boot).
        JSON.stringify({
          message: 'Esta acción requiere rol Sales Manager…',
          title: 'Mensaje',
          indicator: 'red',
          raise_exception: 1,
        }),
        'plain text',
        '{not json',
      ]),
    ).toEqual([])
  })

  it('toasts one per message with no description line', () => {
    handleServerMessages([
      JSON.stringify({ message: 'Saved', indicator: 'green' }),
      JSON.stringify({ message: 'Heads up', indicator: 'blue', title: 'Nota' }),
      JSON.stringify({
        message: 'Caught',
        indicator: 'red',
        raise_exception: 1,
      }),
    ])
    expect(calls).toEqual([
      ['success', 'Saved', undefined],
      ['info', 'Heads up', undefined],
    ])
  })
})
