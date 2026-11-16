import { describe, expect, it, vi } from 'vitest'
import {
  askPrompt,
  bookOf,
  changeAuthor,
  changeRows,
  botNote,
  excelUrl,
  liveStep,
  loadEditor,
  presenceRows,
  prefetchEditor,
  sheetContext,
} from '@/hojas/hoja'

describe('Hojas', () => {
  it('replays the next change in place, reloads on a gap, skips its own', () => {
    const state = {
      sheet: { name: 'h1', revision: 4 },
      cliente: 'yo',
      seen: new Set(),
    }
    const m = [{ id: 'sheet.mutation.set-range-values', params: {} }]
    expect(liveStep({ name: 'h1', revision: 5, mutations: m }, state)).toBe(
      'apply',
    )
    expect(liveStep({ name: 'h1', revision: 5 }, state)).toBe('reload') // too big to travel
    expect(liveStep({ name: 'h1', revision: 7, mutations: m }, state)).toBe(
      'reload',
    ) // a gap
    expect(
      liveStep({ name: 'h1', revision: 5, mutations: m, cliente: 'yo' }, state),
    ).toBe('ignore')
    expect(liveStep({ name: 'h1', revision: 4, mutations: m }, state)).toBe(
      'ignore',
    )
    expect(liveStep({ name: 'h2', revision: 5, mutations: m }, state)).toBe(
      'ignore',
    )
    expect(
      liveStep({ name: 'h1', revision: 5 }, { ...state, inFlight: {} }),
    ).toBe('wait')
    expect(
      liveStep(
        { name: 'h1', revision: 5, mutations: m },
        { ...state, seen: new Set([5]) },
      ),
    ).toBe('ignore')
    expect(
      liveStep({ name: 'h1', revision: 9 }, { ...state, sheet: null }),
    ).toBe('ignore')
  })

  it('shows where the others are, newest first, until they go quiet', () => {
    const now = 100000
    const rows = presenceRows(
      {
        a: { user_name: 'Ana', celda: 'Ventas!B4', at: now - 1000 },
        b: { user_name: 'Beto', celda: 'Gastos!A1', at: now - 500 },
        c: { user_name: 'Caro', celda: 'Gastos!C9', at: now - 70000 },
        d: { user_name: 'Dani', celda: null, at: now },
      },
      now,
    )
    expect(rows.map((r) => `${r.name} · ${r.celda}`)).toEqual([
      'Beto · Gastos!A1',
      'Ana · Ventas!B4',
    ])
  })

  it('says what Muelle changed and why', () => {
    expect(
      botNote({
        by: 'bot',
        resumen: '3 celdas: Gastos!B2:B4',
        porque: 'Faltaba la luz',
      }),
    ).toBe('Muelle cambió 3 celdas: Gastos!B2:B4: Faltaba la luz')
    expect(botNote({ by: 'bot' })).toBe('Muelle cambió la hoja')
    expect(botNote({ by: 'page', resumen: 'x' })).toBe('')
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
