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
  it('parses Desk messages, maps indicators, drops blanks and repeats', () => {
    expect(
      parseServerMessages([
        JSON.stringify({ message: 'User x removed.', indicator: 'green' }),
        JSON.stringify({ message: 'Careful', indicator: 'orange', title: 'Stock' }),
        JSON.stringify({ message: 'Careful', indicator: 'orange' }),
        JSON.stringify({ message: '  ' }),
        'plain text',
        '{not json',
        JSON.stringify({ message: 'Bad', indicator: 'red' }),
      ]),
    ).toEqual([
      { type: 'success', message: 'User x removed.', title: '' },
      { type: 'warning', message: 'Careful', title: 'Stock' },
      { type: 'info', message: 'plain text', title: '' },
      { type: 'info', message: '{not json', title: '' },
      { type: 'error', message: 'Bad', title: '' },
    ])
    expect(parseServerMessages(undefined)).toEqual([])
  })

  it('toasts one per message with the title as description', () => {
    handleServerMessages([
      JSON.stringify({ message: 'Saved', indicator: 'green' }),
      JSON.stringify({ message: 'Heads up', indicator: 'blue', title: 'Nota' }),
    ])
    expect(calls).toEqual([
      ['success', 'Saved', undefined],
      ['info', 'Heads up', { description: 'Nota' }],
    ])
  })
})
