import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: mocks.call,
}))

import {
  _resetBtw,
  askBtw,
  btw,
  closeBtw,
  onBtwEvent,
  openBtw,
  tapBtw,
} from '@/components/assistant/assistantBtw'
import { resolveCommand } from '@/components/assistant/assistantAutocomplete'
import { runCommand } from '@/components/assistant/assistantSessions'
import {
  _resetAssistant,
  assistant,
  onMessage,
} from '@/components/assistant/useAssistant'

const API = 'doco.docoutils.assistant.shell_api'
const BTW = {
  cmd: '/btw',
  label: 'Pregunta al margen',
  hint: '/btw ¿cuánto vendimos ayer? — sin cortar lo que va',
  kind: 'client',
  action: 'btw',
}

beforeEach(() => {
  _resetBtw()
  _resetAssistant()
  mocks.call.mockReset()
  mocks.call.mockImplementation(async (method) => {
    if (method === `${API}.autocompletar`) return { items: [BTW] }
    if (method === `${API}.btw_historial`) return []
    return { btw: 'b1', runner: 'btw' }
  })
})
afterEach(() => _resetBtw())

describe('«/btw» from the composer', () => {
  it('is a client command that carries the question to the side sheet', async () => {
    const command = await resolveCommand('/btw ¿cuánto vendimos ayer?')
    expect(command).toEqual({ action: 'btw', rest: '¿cuánto vendimos ayer?' })
    await runCommand(command.action, command.rest)
    expect(btw.open).toBe(true)
    expect(mocks.call).toHaveBeenCalledWith(`${API}.btw`, {
      text: '¿cuánto vendimos ayer?',
    })
    // the question is on the side, never in the conversation
    expect(btw.rows.map((r) => r.role)).toEqual(['user'])
    expect(assistant.messages).toEqual([])
    expect(mocks.call).not.toHaveBeenCalledWith(`${API}.say`, expect.anything())
  })

  it('opens empty with the field ready when nothing follows it', async () => {
    const focus = btw.focus
    openBtw('')
    expect(btw.open).toBe(true)
    expect(btw.focus).toBe(focus + 1)
    expect(mocks.call).not.toHaveBeenCalledWith(`${API}.btw`, expect.anything())
  })
})

describe('the side thread', () => {
  it('takes side answers and their edits, and leaves the conversation alone', () => {
    assistant.messages = [
      { id: 'm0', role: 'bot', text: 'Leyendo la factura…' },
    ]
    const before = JSON.stringify(assistant.messages)
    onBtwEvent(
      { mid: 'x1', text: 'Buscando…', btw: 'b1', chat_id: 'desk:a' },
      'desk:a',
    )
    onBtwEvent(
      {
        mid: 'x1',
        text: 'Ayer vendiste $1,280.',
        edit: true,
        btw: 'b1',
        chat_id: 'desk:a',
      },
      'desk:a',
    )
    expect(btw.rows).toHaveLength(1)
    expect(btw.rows[0].text).toBe('Ayer vendiste $1,280.')
    expect(btw.open).toBe(true)
    expect(JSON.stringify(assistant.messages)).toBe(before)
  })

  it('ignores another chat and shows the typing line', () => {
    onBtwEvent({ mid: 'x2', text: 'otra', chat_id: 'desk:b' }, 'desk:a')
    expect(btw.rows).toEqual([])
    onBtwEvent({ typing: true, chat_id: 'desk:a' }, 'desk:a')
    expect(btw.thinking).toBe(true)
  })

  it('a card on the side is decided through the same callback', async () => {
    await tapBtw('agr:AGR-1:p1:a')
    expect(mocks.call).toHaveBeenCalledWith(`${API}.callback`, {
      data: 'agr:AGR-1:p1:a',
    })
    expect(btw.taps['agr:AGR-1:p1:a']).toBe('done')
  })

  it('closes in one tap and empties only the side thread', async () => {
    assistant.messages = [{ id: 'm0', role: 'bot', text: 'principal' }]
    await askBtw('¿y ese IMEI ya lo tenemos?')
    await closeBtw()
    expect(btw.open).toBe(false)
    expect(btw.rows).toEqual([])
    expect(mocks.call).toHaveBeenCalledWith(`${API}.btw_cerrar`)
    expect(assistant.messages).toEqual([
      { id: 'm0', role: 'bot', text: 'principal' },
    ])
  })

  it('a conversation event never reaches the side thread', () => {
    assistant.status = { chat_id: 'desk:a' }
    onMessage({ mid: 'm9', text: 'respuesta principal', chat_id: 'desk:a' })
    expect(btw.rows).toEqual([])
  })
})
