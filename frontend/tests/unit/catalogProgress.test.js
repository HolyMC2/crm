// A supplier list's bar: what the chat card and Compras › Surtido say while the
// list is indexed and its products are read (doco books.catalogs.progress).
import { describe, expect, it } from 'vitest'
import { progressOf, progressView } from '@/utils/catalogProgress'
import { splitButtons } from '@/components/assistant/assistantText'

describe('progressView', () => {
  it('counts indexed pages of the pages, then pages read of the pages picked', () => {
    const index = progressView({
      stage: 'index',
      pages: 8,
      indexed: 2,
      pct: 25,
    })
    expect(index).toMatchObject({ busy: true, pct: 25 })
    expect(index.line).toBe('Indexing: 2 of 8 pages')
    const read = progressView({
      stage: 'read',
      to_read: 4,
      read: 1,
      lines: 38,
      pct: 25,
    })
    expect(read).toMatchObject({ busy: true, pct: 25 })
    expect(read.line).toBe('Reading products: 1 of 4 pages, 38 products so far')
    expect(read.note).toBe(
      'You can keep working. Muelle tells you in the chat when it is done.',
    )
  })

  it('says the read is starting before its pages are picked', () => {
    const got = progressView({ stage: 'read', to_read: 0, pct: 0 })
    expect(got.line).toBe('Starting to read the products…')
    expect(got.pct).toBe(0)
  })

  it('a settled, waiting or stopped list shows no bar and says why', () => {
    expect(progressView({ stage: 'done', lines: 120 })).toMatchObject({
      busy: false,
      pct: null,
      tone: 'success',
      line: 'Ready: 120 products',
    })
    expect(
      progressView({
        stage: 'failed',
        error: 'No se pudo procesar el archivo',
      }),
    ).toMatchObject({ tone: 'danger', line: 'No se pudo procesar el archivo' })
    expect(progressView({ stage: 'confirm', units: 40 }).line).toBe(
      'Reading its products uses 40 units of your plan; it waits for your OK',
    )
    expect(progressView(null)).toBe(null)
  })
})

describe('progressOf', () => {
  it('takes the server progress when there is one', () => {
    const progress = { stage: 'read', to_read: 3 }
    expect(progressOf({ status: 'Listo', progress })).toBe(progress)
  })

  it('reads index_progress as pages, never as a percent', () => {
    const got = progressOf({
      status: 'Indexando',
      page_count: 5,
      index_progress: 5,
    })
    expect(got).toMatchObject({ stage: 'index', pct: 100 })
    expect(
      progressOf({ status: 'Indexando', page_count: 0, index_progress: 3 }).pct,
    ).toBe(0)
    expect(progressOf({ status: 'Error', error: 'x' }).stage).toBe('failed')
    expect(progressOf({ status: 'Listo', reading: true }).stage).toBe('read')
    expect(progressOf({ status: 'Listo', lines: 4 }).stage).toBe('done')
  })
})

describe('the list bar in the chat', () => {
  it('«Ver avance» becomes the bar of its list, not a choice', () => {
    const got = splitButtons({
      text: 'Recibí el catálogo (5 págs).',
      buttons: [
        [
          {
            text: 'Ver avance',
            callback_data: 'imgq:catalog:progress:j5l84q9o0m',
          },
        ],
        [
          {
            text: 'Ver páginas',
            callback_data: 'imgq:catalog:pages:j5l84q9o0m',
          },
        ],
      ],
    })
    expect(got.progress).toBe('j5l84q9o0m')
    expect(got.choices.map((c) => c.data)).toEqual([
      'imgq:catalog:pages:j5l84q9o0m',
    ])
    expect(splitButtons({ text: 'hola' }).progress).toBe('')
  })
})
