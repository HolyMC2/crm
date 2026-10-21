import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
globalThis.__ = (text) => text

import {
  ASSISTANT_FILE_ACCEPT,
  canSendDraft,
  fileSizeText,
  isImageFile,
} from '@/components/assistant/assistantFiles'
import {
  _resetAssistant,
  assistant,
  attachFile,
  retry,
  send,
  takeAttachment,
} from '@/components/assistant/useAssistant'

const SAY = 'doco.docoutils.assistant.shell_api.say'
const UPLOAD = '/api/method/upload_file'

function picture() {
  return new File(['pixels'], 'print.jpg', { type: 'image/jpeg' })
}

function picked() {
  return { blob: picture(), name: 'print.jpg', size: 6, type: 'image/jpeg' }
}

function uploaded(url = '/private/files/print.jpg') {
  return { ok: true, json: async () => ({ message: { file_url: url } }) }
}

function sayCalls() {
  return mocks.call.mock.calls
    .filter(([method]) => method === SAY)
    .map(([, args]) => args)
}

describe('assistant file rules', () => {
  it('accepts what the Desk receipt picker accepts: photos, PDFs and CFDI XML', () => {
    const types = ASSISTANT_FILE_ACCEPT.split(',')
    for (const type of [
      'image/*',
      'application/pdf',
      '.pdf',
      'text/xml',
      '.xml',
    ])
      expect(types).toContain(type)
  })

  it('tells photos from documents', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true)
    expect(isImageFile({ type: 'application/pdf' })).toBe(false)
    expect(isImageFile(null)).toBe(false)
  })

  it('shows sizes the way a phone does', () => {
    expect(fileSizeText(340 * 1024)).toBe('340 KB')
    expect(fileSizeText(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })

  it('sends a note, a file, or both, and never an empty message', () => {
    expect(canSendDraft('   ', null)).toBe(false)
    expect(canSendDraft('¿Qué formato es?', null)).toBe(true)
    expect(canSendDraft('', { name: 'print.jpg' })).toBe(true)
  })
})

describe('file messages', () => {
  beforeEach(() => {
    _resetAssistant()
    mocks.call.mockReset()
    mocks.call.mockResolvedValue({ ok: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => uploaded()),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads the picture as private, then says it with its file_url', async () => {
    await send('', { file: picked() })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(UPLOAD)
    expect(init.body.get('is_private')).toBe('1')
    expect(sayCalls()).toEqual([
      expect.objectContaining({
        text: '',
        file_url: '/private/files/print.jpg',
      }),
    ])
    expect(assistant.messages.at(-1)).toMatchObject({
      pending: false,
      file: { url: '/private/files/print.jpg' },
    })
  })

  it('a retry after a refused say sends the same upload, not a second copy', async () => {
    mocks.call.mockRejectedValueOnce({ messages: ['Ese archivo no es tuyo.'] })
    await send('¿Qué formato es?', { file: picked() })
    expect(assistant.messages.at(-1)).toMatchObject({ failed: true })

    await retry(assistant.messages.at(-1))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sayCalls().at(-1)).toMatchObject({
      text: '¿Qué formato es?',
      file_url: '/private/files/print.jpg',
    })
  })

  it('a failed upload keeps the note and the file for a retry, and says what to do', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    await send('Factura', { file: picked() })

    expect(mocks.call).not.toHaveBeenCalled()
    const failed = assistant.messages.at(-1)
    expect(failed).toMatchObject({ text: 'Factura', failed: true })
    expect(failed.file.blob).toBeInstanceOf(File)
    expect(assistant.error).toMatch(/Your message is still here/)
  })

  it('a note without a file goes as a plain message', async () => {
    await send('Hola')
    expect(fetch).not.toHaveBeenCalled()
    expect(sayCalls()[0].file_url).toBeUndefined()
  })

  it('the composer keeps one picked file until the message takes it', () => {
    URL.createObjectURL = vi.fn(() => 'blob:print')
    URL.revokeObjectURL = vi.fn()
    attachFile(picture())
    expect(assistant.attachment).toMatchObject({
      name: 'print.jpg',
      previewUrl: 'blob:print',
    })
    expect(takeAttachment().name).toBe('print.jpg')
    expect(assistant.attachment).toBeNull()
    // the bubble keeps the preview, so taking the file revokes nothing
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})
