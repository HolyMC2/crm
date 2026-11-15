import { describe, expect, it, vi } from 'vitest'
import {
  askPrompt,
  bookOf,
  changeAuthor,
  changeRows,
  excelUrl,
  isNewer,
  loadEditor,
  prefetchEditor,
  sheetContext,
} from '@/hojas/hoja'

describe('Hojas', () => {
  it('reloads only for a newer revision of the open sheet', () => {
    const sheet = { name: 'h1', revision: 4 }
    expect(isNewer({ name: 'h1', revision: 5 }, sheet)).toBe(true)
    expect(isNewer({ name: 'h1', revision: 4 }, sheet)).toBe(false)
    expect(isNewer({ name: 'h2', revision: 9 }, sheet)).toBe(false)
    expect(isNewer({ name: 'h1', revision: 9 }, null)).toBe(false)
  })

  it('says who made each change, Muelle for the bot', () => {
    expect(changeAuthor({ by: 'bot', user_name: 'Ana' })).toBe('Muelle')
    expect(changeAuthor({ by: 'page', user_name: 'Ana' })).toBe('Ana')
    expect(changeAuthor({})).toBe('Alguien')
  })

  it('lists changes with what and why', () => {
    const rows = changeRows({
      cambios: [
        {
          revision: 3,
          by: 'bot',
          resumen: '1 celda: G!A1',
          porque: 'Faltaba la luz',
          at: 'x',
        },
      ],
    })
    expect(rows).toEqual([
      {
        revision: 3,
        author: 'Muelle',
        what: '1 celda: G!A1',
        why: 'Faltaba la luz',
        at: 'x',
      },
    ])
    expect(changeRows(null)).toEqual([])
  })

  it('gives Univer a blank book when the sheet has none', () => {
    const book = bookOf({ title: 'X', snapshot: {} })
    expect(book.sheetOrder).toEqual(['s1'])
    const own = { sheets: { a: { name: 'A' } }, sheetOrder: ['a'] }
    expect(bookOf({ snapshot: own })).toBe(own)
  })

  it('tells the assistant which sheet is on screen', () => {
    expect(sheetContext({ name: 'h1', title: 'Flujo' })).toEqual({
      doctype: 'Hoja',
      name: 'h1',
      title: 'Flujo',
    })
    expect(sheetContext(null)).toBeNull()
    expect(askPrompt({ title: 'Flujo' })).toBe('En la hoja «Flujo», ')
  })

  it('downloads the sheet from doco', () => {
    expect(excelUrl('a b')).toBe(
      '/api/method/doco.hojas.api.exportar?name=a%20b',
    )
  })

  it('still adds the stylesheet when the list already prefetched it', async () => {
    const manifest = { js: 'e.js', css: 'e.css', preload: ['c.js'] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => manifest })),
    )
    prefetchEditor()
    await vi.waitFor(() =>
      expect(document.head.querySelector('link[rel="prefetch"]')).toBeTruthy(),
    )
    await loadEditor().catch(() => {}) // the module itself does not exist here
    const sheet = document.head.querySelector('link[rel="stylesheet"]')
    expect(sheet?.getAttribute('href')).toBe('/assets/crm/univer/e.css')
    expect(
      document.head.querySelectorAll('link[rel="modulepreload"]'),
    ).toHaveLength(2)
    vi.unstubAllGlobals()
  })
})
