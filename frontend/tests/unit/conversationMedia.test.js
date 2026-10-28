import { describe, expect, it } from 'vitest'
import {
  linksIn,
  splitConversationMedia,
} from '@/composables/conversationMedia'

describe('conversation media', () => {
  it('finds links without the punctuation that ends the sentence', () => {
    expect(
      linksIn('Mira https://doco.mx/equipo. Y (http://wa.me/5215550001)!'),
    ).toEqual(['https://doco.mx/equipo', 'http://wa.me/5215550001'])
    expect(linksIn('')).toEqual([])
  })

  it('splits the thread and the record files into media, docs and links, newest first', () => {
    const { media, docs, links } = splitConversationMedia(
      [
        {
          name: 'm1',
          content_type: 'image',
          attach: '/private/files/foto.jpg',
          message: 'la pantalla https://x.mx/a',
          creation: '2026-10-01 10:00:00',
          type: 'Incoming',
        },
        {
          name: 'm2',
          content_type: 'document',
          attach: '/files/Cotizaci%C3%B3n.pdf',
          creation: '2026-10-03 10:00:00',
        },
        {
          name: 'm3',
          content_type: 'text',
          message: 'ubicación: https://maps.app/1',
          creation: '2026-10-02 10:00:00',
        },
        { name: 'm4', content_type: 'audio', attach: '/files/nota.ogg' },
      ],
      [
        // the same file the chat already shows is not counted twice
        {
          name: 'f1',
          file_url: '/private/files/foto.jpg',
          file_name: 'foto.jpg',
        },
        {
          name: 'f2',
          file_url: '/private/files/IMG_1.jpeg',
          file_name: 'IMG_1.jpeg',
          creation: '2026-10-05 09:00:00',
        },
        {
          name: 'f3',
          file_url: '/files/garantia.pdf',
          file_name: 'garantia.pdf',
          file_size: 2048,
          creation: '2026-09-01 09:00:00',
        },
      ],
    )
    expect(media.map((m) => m.key)).toEqual(['f2', 'm1'])
    expect(media[1]).toMatchObject({ kind: 'image', mine: false })
    expect(docs.map((d) => [d.name, d.ext])).toEqual([
      ['Cotización.pdf', 'PDF'],
      ['garantia.pdf', 'PDF'],
    ])
    expect(links.map((l) => [l.url, l.host])).toEqual([
      ['https://maps.app/1', 'maps.app'],
      ['https://x.mx/a', 'x.mx'],
    ])
  })
})
