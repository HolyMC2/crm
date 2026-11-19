import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
globalThis.__ = (text) => text

import {
  ASSISTANT_FILE_ACCEPT,
  ASSISTANT_MAX_FILES,
  canSendDraft,
  fileSizeText,
  isImageFile,
} from '@/components/assistant/assistantFiles'
import {
  _resetAssistant,
  assistant,
  attachFiles,
  removeAttachment,
  retry,
  send,
  takeAttachments,
} from '@/components/assistant/useAssistant'

const SAY = 'doco.docoutils.assistant.shell_api.say'
const UPLOAD = '/api/method/upload_file'

function picture(name = 'print.jpg') {
  return new File(['pixels'], name, { type: 'image/jpeg' })
}

function picked(name = 'print.jpg') {
  return { blob: picture(name), name, size: 6, type: 'image/jpeg' }
}

// upload_file answers with the File: its name and its private url
function uploaded(name = 'print.jpg') {
  return {
    ok: true,
    json: async () => ({
      message: { name: `F-${name}`, file_url: `/private/files/${name}` },
    }),
  }
}

function uploadFor(init) {
  return uploaded(init.body.get('file').name)
}

function sayCalls() {
  return mocks.call.mock.calls
    .filter(([method]) => method === SAY)
    .map(([, args]) => args)
}

function sentFiles(args) {
  return JSON.parse(args.attachments)
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

  it('sends a note, files, or both, and never an empty message', () => {
    expect(canSendDraft('   ', [])).toBe(false)
    expect(canSendDraft('¿Qué formato es?', [])).toBe(true)
    expect(canSendDraft('', [{ name: 'print.jpg' }])).toBe(true)
  })

  it('takes up to five files in one message, as the Desk composer does', () => {
    expect(ASSISTANT_MAX_FILES).toBe(5)
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

  it('uploads the picture as private, then says it as the File it became', async () => {
    await send('', { files: [picked()] })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(UPLOAD)
    expect(init.body.get('is_private')).toBe('1')
    const [args] = sayCalls()
    expect(args).toMatchObject({ text: '' })
    expect(args.file_url).toBeUndefined()
    expect(sentFiles(args)).toEqual([
      expect.objectContaining({ file_id: 'F-print.jpg', purpose: 'auto' }),
    ])
    expect(assistant.messages.at(-1)).toMatchObject({
      pending: false,
      files: [{ fileId: 'F-print.jpg', url: '/private/files/print.jpg' }],
    })
  })

  it('sends the order, shipping and payment photos in one message', async () => {
    fetch.mockImplementation(async (_, init) => uploadFor(init))
    await send('Pedido de PI', {
      files: [picked('pedido.jpg'), picked('envio.jpg'), picked('pago.jpg')],
    })

    expect(fetch).toHaveBeenCalledTimes(3)
    const calls = sayCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toBe('Pedido de PI')
    const files = sentFiles(calls[0])
    expect(files.map((f) => f.file_id)).toEqual([
      'F-pedido.jpg',
      'F-envio.jpg',
      'F-pago.jpg',
    ])
    // each file is its own attachment in the send, read by the server on «auto»
    expect(new Set(files.map((f) => f.attachment_id)).size).toBe(3)
    expect(files.every((f) => f.purpose === 'auto')).toBe(true)
  })

  it('a retry after a refused say sends the same uploads, not second copies', async () => {
    fetch.mockImplementation(async (_, init) => uploadFor(init))
    mocks.call.mockRejectedValueOnce({ messages: ['Ese archivo no es tuyo.'] })
    await send('¿Qué formato es?', {
      files: [picked('a.jpg'), picked('b.jpg')],
    })
    expect(assistant.messages.at(-1)).toMatchObject({ failed: true })

    await retry(assistant.messages.at(-1))

    expect(fetch).toHaveBeenCalledTimes(2)
    const last = sayCalls().at(-1)
    expect(last.text).toBe('¿Qué formato es?')
    expect(sentFiles(last).map((f) => f.file_id)).toEqual([
      'F-a.jpg',
      'F-b.jpg',
    ])
  })

  it('when one of several uploads fails, the retry uploads only that one', async () => {
    fetch.mockImplementation(async (_, init) =>
      init.body.get('file').name === 'b.jpg'
        ? { ok: false, json: async () => ({}) }
        : uploadFor(init),
    )
    await send('Pedido', { files: [picked('a.jpg'), picked('b.jpg')] })
    expect(mocks.call).not.toHaveBeenCalled()
    expect(assistant.messages.at(-1)).toMatchObject({ failed: true })

    fetch.mockClear()
    fetch.mockImplementation(async (_, init) => uploadFor(init))
    await retry(assistant.messages.at(-1))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].body.get('file').name).toBe('b.jpg')
    expect(sentFiles(sayCalls()[0]).map((f) => f.file_id)).toEqual([
      'F-a.jpg',
      'F-b.jpg',
    ])
  })

  it('a failed upload keeps the note and the file for a retry, and says what to do', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    await send('Factura', { files: [picked()] })

    expect(mocks.call).not.toHaveBeenCalled()
    const failed = assistant.messages.at(-1)
    expect(failed).toMatchObject({ text: 'Factura', failed: true })
    expect(failed.files[0].blob).toBeInstanceOf(File)
    expect(assistant.error).toMatch(/Your message is still here/)
  })

  it('a note without a file goes as a plain message', async () => {
    await send('Hola')
    expect(fetch).not.toHaveBeenCalled()
    expect(sayCalls()[0].attachments).toBeUndefined()
  })

  it('the composer keeps the picked files until the message takes them', () => {
    URL.createObjectURL = vi.fn((blob) => `blob:${blob.name}`)
    URL.revokeObjectURL = vi.fn()
    attachFiles([picture('pedido.jpg'), picture('envio.jpg')])
    attachFiles([picture('pago.jpg')])
    expect(assistant.attachments.map((f) => f.name)).toEqual([
      'pedido.jpg',
      'envio.jpg',
      'pago.jpg',
    ])
    expect(assistant.attachments[0].previewUrl).toBe('blob:pedido.jpg')
    expect(takeAttachments()).toHaveLength(3)
    expect(assistant.attachments).toEqual([])
    // the bubble keeps the previews, so taking the files revokes nothing
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('takes one file off and lets its preview go', () => {
    URL.createObjectURL = vi.fn((blob) => `blob:${blob.name}`)
    URL.revokeObjectURL = vi.fn()
    attachFiles([picture('a.jpg'), picture('b.jpg')])
    removeAttachment(assistant.attachments[0])
    expect(assistant.attachments.map((f) => f.name)).toEqual(['b.jpg'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg')
  })

  it('past five files the rest stay out and the sheet says why', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    attachFiles(
      Array.from({ length: 7 }, (_, i) => picture(`foto${i + 1}.jpg`)),
    )
    expect(assistant.attachments).toHaveLength(5)
    expect(assistant.attachments.at(-1).name).toBe('foto5.jpg')
    expect(assistant.error).toMatch(/A message takes up to/)
  })
})
