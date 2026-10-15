import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  whatsappSaveArgs,
  emailSaveArgs,
  isWhatsappAttachment,
  isWhatsappInboxMessage,
  collectFileUrls,
  collectFileNames,
  savedAttachmentsArgs,
  mergeSavedMap,
} from '../../src/composables/useConversationArchivos.js'

describe('save_attachment args', () => {
  it('builds WhatsApp args from the message name and attach URL', () => {
    expect(
      whatsappSaveArgs({ name: 'WA-1', attach: '/private/files/a.jpg' }),
    ).toEqual({
      source_doctype: 'WhatsApp Message',
      source_name: 'WA-1',
      file_url: '/private/files/a.jpg',
    })
  })
  it('includes company only when given', () => {
    expect(
      whatsappSaveArgs({ name: 'WA-1', attach: '/x.jpg' }, 'Doco MX'),
    ).toMatchObject({ company: 'Doco MX' })
    expect(
      whatsappSaveArgs({ name: 'WA-1', attach: '/x.jpg' }),
    ).not.toHaveProperty('company')
  })
  it('builds email args from the Communication name and File docname', () => {
    expect(
      emailSaveArgs({ name: 'COMM-1' }, { name: 'F-1', file_url: '/f.pdf' }),
    ).toEqual({
      source_doctype: 'Communication',
      source_name: 'COMM-1',
      file: 'F-1',
    })
  })
})

describe('eligible attachments', () => {
  it('a WhatsApp message counts only with a known media type and an attach URL', () => {
    expect(
      isWhatsappAttachment({ content_type: 'image', attach: '/a.jpg' }),
    ).toBe(true)
    expect(
      isWhatsappAttachment({ content_type: 'document', attach: '/a.pdf' }),
    ).toBe(true)
    expect(isWhatsappAttachment({ content_type: 'text', attach: '/a' })).toBe(
      false,
    )
    expect(isWhatsappAttachment({ content_type: 'image', attach: '' })).toBe(
      false,
    )
    expect(isWhatsappAttachment(null)).toBe(false)
  })
  it('a unified-inbox message is only eligible on a WhatsApp conversation', () => {
    const message = { content_type: 'image', attach: '/a.jpg' }
    expect(
      isWhatsappInboxMessage(message, { provider: 'WhatsApp' }),
    ).toBe(true)
    expect(
      isWhatsappInboxMessage(message, { provider: 'Messenger' }),
    ).toBe(false)
    expect(isWhatsappInboxMessage(message, { provider: 'Webchat' })).toBe(
      false,
    )
    expect(isWhatsappInboxMessage(message, null)).toBe(false)
  })
})

describe('collecting what to ask about', () => {
  it('dedupes WhatsApp attach URLs and skips non-media rows', () => {
    const messages = [
      { content_type: 'image', attach: '/a.jpg' },
      { content_type: 'text', attach: null },
      { content_type: 'image', attach: '/a.jpg' },
      { content_type: 'document', attach: '/b.pdf' },
    ]
    expect(collectFileUrls(messages)).toEqual(['/a.jpg', '/b.pdf'])
  })
  it('only collects WhatsApp rows from a mixed-provider inbox list', () => {
    const messages = [
      { content_type: 'image', attach: '/a.jpg' },
      { content_type: 'image', attach: '/b.jpg' },
    ]
    expect(
      collectFileUrls(messages, (m) =>
        isWhatsappInboxMessage(m, { provider: 'Messenger' }),
      ),
    ).toEqual([])
    expect(
      collectFileUrls(messages, (m) =>
        isWhatsappInboxMessage(m, { provider: 'WhatsApp' }),
      ),
    ).toEqual(['/a.jpg', '/b.jpg'])
  })
  it('dedupes email File docnames', () => {
    expect(
      collectFileNames([{ name: 'F-1' }, { name: 'F-2' }, { name: 'F-1' }]),
    ).toEqual(['F-1', 'F-2'])
    expect(collectFileNames([])).toEqual([])
    expect(collectFileNames(undefined)).toEqual([])
  })
})

describe('saved_attachments call', () => {
  it('sends only the non-empty keys, each as a JSON array', () => {
    expect(savedAttachmentsArgs({ fileUrls: ['/a.jpg'] })).toEqual({
      file_urls: JSON.stringify(['/a.jpg']),
    })
    expect(savedAttachmentsArgs({ files: ['F-1'] })).toEqual({
      files: JSON.stringify(['F-1']),
    })
    expect(
      savedAttachmentsArgs({ fileUrls: ['/a.jpg'], files: ['F-1'] }),
    ).toEqual({
      file_urls: JSON.stringify(['/a.jpg']),
      files: JSON.stringify(['F-1']),
    })
    expect(savedAttachmentsArgs()).toEqual({})
    expect(savedAttachmentsArgs({ fileUrls: [], files: [] })).toEqual({})
  })
  it('maps the server result into the reactive saved-state object, keeping unrelated keys', () => {
    const target = { '/old.jpg': 'DOC-OLD' }
    mergeSavedMap(target, { '/a.jpg': 'DOC-1', '/b.jpg': null })
    expect(target).toEqual({ '/old.jpg': 'DOC-OLD', '/a.jpg': 'DOC-1' })
  })
})

describe('es catalog has every new msgid this package added', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const files = [
    '../../src/components/Activities/WhatsAppArea.vue',
    '../../src/components/Activities/EmailArea.vue',
    '../../src/components/Activities/MessengerArea.vue',
    '../../src/components/Activities/ArchivosAttachmentActions.vue',
  ]
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const catalog = new Map()
  for (const m of po.matchAll(
    /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
  ))
    catalog.set(m[1], m[2])

  // Only the strings this package (ARC-S2.3) introduced, so pre-existing
  // strings these files already carried (checked by the project's own
  // archivos.test.js pattern) don't need a second owner here.
  const introduced = [
    'In Files',
    'Save to Files',
    'Link to…',
    'Files actions',
    'Files…',
    'Saved to Files',
  ]
  it('every ARC-S2.3 msgid used in the touched files is catalogued', () => {
    for (const file of files) {
      const source = readFileSync(resolve(here, file), 'utf8')
      const strings = [
        ...source.matchAll(/__\(\s*(['"])((?:(?!\1).)+)\1/gs),
      ].map((m) => m[2])
      for (const text of strings.filter((s) => introduced.includes(s)))
        expect(catalog.get(text), `${file}: ${text}`).toBeTruthy()
    }
  })
  it('the introduced strings resolve to a non-empty Spanish string', () => {
    for (const text of introduced)
      expect(catalog.get(text), text).toBeTruthy()
  })
})

describe('useConversationArchivos composable shape', () => {
  it('exposes the reactive saved map plus the actions every area calls', async () => {
    const mod = await import('../../src/composables/useConversationArchivos.js')
    const state = mod.useConversationArchivos()
    expect(state.saved).toEqual({})
    expect(typeof state.isBusy).toBe('function')
    expect(typeof state.save).toBe('function')
    expect(typeof state.linkTo).toBe('function')
    expect(typeof state.refreshSaved).toBe('function')
    expect(state.isBusy('/a.jpg')).toBe(false)
  })
})
