// Surtido: a catalog dropped on the page uploads in place on doco's chunked
// protocol (initiate → each part → complete) with the token of its session.
import { describe, expect, it } from 'vitest'
import {
  mimeOf,
  partRanges,
  partTarget,
  tokenOf,
  uploadCatalog,
} from '@/utils/catalogUpload'

const LINK = 'https://shop.example/catalogo_subir?t=tok-123'

describe('catalog upload session', () => {
  it('reads the token of an upload link', () => {
    expect(tokenOf(LINK)).toBe('tok-123')
    expect(tokenOf('/catalogo_subir?t=abc')).toBe('abc')
    expect(tokenOf('/catalogo_subir')).toBe('')
  })

  it('names the type when the phone sends none', () => {
    expect(mimeOf(new File(['x'], 'Lista.PDF'))).toBe('application/pdf')
    expect(mimeOf(new File(['x'], 'precios.csv', { type: 'text/plain' }))).toBe(
      'text/plain',
    )
    expect(mimeOf(new File(['x'], 'catalogo'))).toBe('application/octet-stream')
  })

  it('sends the site part to the page origin and storage parts as presigned', () => {
    const part =
      'https://shop.example/api/method/doco.docoutils.books.catalogs.uploads.receive_part?token=a&n=1&expires=9&signature=s'
    expect(partTarget(part, 'https://otra-tienda.example')).toBe(
      'https://otra-tienda.example/api/method/doco.docoutils.books.catalogs.uploads.receive_part?token=a&n=1&expires=9&signature=s',
    )
    const presigned =
      'https://s3.storage.example/bucket/key?partNumber=1&X-Amz-Signature=z'
    expect(partTarget(presigned, 'https://otra-tienda.example')).toBe(presigned)
  })

  it('cuts the file where the server asked', () => {
    const session = { part_size: 4, parts: [{ n: 1 }, { n: 2 }, { n: 3 }] }
    expect(partRanges(session, 10).map((p) => [p.n, p.start, p.end])).toEqual([
      [1, 0, 4],
      [2, 4, 8],
      [3, 8, 10],
    ])
  })
})

describe('uploadCatalog', () => {
  it('sends every part, then completes with their receipts in order', async () => {
    const calls = []
    const api = async (method, args) => {
      calls.push([method.split('.').pop(), args])
      return method.endsWith('initiate')
        ? {
            part_size: 4,
            parts: [
              { n: 1, url: '/p/1' },
              { n: 2, url: '/p/2' },
            ],
          }
        : { catalogo: 'CAT-1' }
    }
    const sent = []
    const put = async (url, bytes, onLoaded) => {
      sent.push([url, await bytes.text()])
      onLoaded(bytes.size)
      return `etag-${url.split('/').pop()}`
    }
    const progress = []
    const file = new File(['abcdef'], 'fundas.pdf', { type: 'application/pdf' })
    await uploadCatalog(LINK, file, {
      api,
      put,
      onProgress: (pct) => progress.push(pct),
    })
    expect(calls[0]).toEqual([
      'initiate',
      { token: 'tok-123', size: 6, mime: 'application/pdf' },
    ])
    expect(sent).toEqual([
      ['/p/1', 'abcd'],
      ['/p/2', 'ef'],
    ])
    expect(calls[1]).toEqual([
      'complete',
      {
        token: 'tok-123',
        parts: [
          { n: 1, etag: 'etag-1' },
          { n: 2, etag: 'etag-2' },
        ],
      },
    ])
    expect(progress.at(-1)).toBe(100)
    expect(Math.max(...progress.slice(0, -1))).toBeLessThan(100)
  })

  it('refuses a link without a session', async () => {
    const api = async () => {
      throw new Error('never called')
    }
    await expect(
      uploadCatalog('/catalogo_subir', new File(['x'], 'a.pdf'), { api }),
    ).rejects.toMatchObject({ uploadFailure: 'part' })
  })

  it('stops at a refused part and never completes', async () => {
    const methods = []
    const api = async (method) => {
      methods.push(method.split('.').pop())
      return { part_size: 4, parts: [{ n: 1, url: '/p/1' }] }
    }
    const put = async () => {
      throw Object.assign(new Error('part'), { uploadFailure: 'part' })
    }
    await expect(
      uploadCatalog(LINK, new File(['abc'], 'a.pdf'), { api, put }),
    ).rejects.toMatchObject({ uploadFailure: 'part' })
    expect(methods).toEqual(['initiate'])
  })
})
