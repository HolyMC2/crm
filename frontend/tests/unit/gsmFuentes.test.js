import { describe, expect, it } from 'vitest'
import {
  KINDS,
  VIEWS,
  checkReceipt,
  guessKind,
  inView,
  kindLabel,
  normalizeView,
  rowSubtitle,
  stateChip,
  suggestTitle,
} from '@/composables/useGsmFuentes'

const row = (over = {}) => ({
  name: 'a1',
  title: 'Z3X Team',
  kind: 'telegram',
  url: 'https://t.me/z3x_news',
  enabled: true,
  on_site: true,
  state: 'ok',
  last_ok: null,
  error: '',
  count: 0,
  ...over,
})

describe('Servidor GSM › Fuentes de novedades', () => {
  it('leads with «Todas» and falls back to it', () => {
    expect(VIEWS[0].value).toBe('todas')
    expect(normalizeView('nope')).toBe('todas')
    expect(normalizeView('con_fallas')).toBe('con_fallas')
  })

  it('filters the views', () => {
    const rows = [
      row(),
      row({ name: 'b', enabled: false, state: 'off' }),
      row({ name: 'c', state: 'failing' }),
    ]
    expect(rows.filter((r) => inView(r, 'todas'))).toHaveLength(3)
    expect(rows.filter((r) => inView(r, 'activas')).map((r) => r.name)).toEqual(
      ['a1', 'c'],
    )
    expect(
      rows.filter((r) => inView(r, 'con_fallas')).map((r) => r.name),
    ).toEqual(['c'])
  })

  it('guesses the kind from the pasted link, like the server', () => {
    expect(guessKind('https://t.me/z3x_news')).toBe('telegram')
    expect(guessKind('@GriffinUnlocker')).toBe('telegram')
    expect(guessKind('https://octoplusbox.com/en/news/', '/en/news/')).toBe(
      'page',
    )
    expect(guessKind('https://chimeratool.com/es/rss')).toBe('feed')
    expect(KINDS.map((k) => k.value)).toEqual(['feed', 'telegram', 'page'])
  })

  it('suggests a name from the channel or the site', () => {
    expect(suggestTitle('https://t.me/s/z3x_news')).toBe('z3x_news')
    expect(suggestTitle('@GriffinUnlocker')).toBe('GriffinUnlocker')
    expect(suggestTitle('https://www.chimeratool.com/es/rss')).toBe(
      'chimeratool.com',
    )
    expect(suggestTitle('no es un enlace')).toBe('')
  })

  it('says how each source is doing in words, the failure first', () => {
    expect(stateChip('failing')).toEqual({ label: 'Failing', tone: 'danger' })
    expect(stateChip('ok').tone).toBe('success')
    expect(
      rowSubtitle(
        row({ state: 'failing', error: 't.me respondió 404.', count: 3 }),
      ),
    ).toBe(`${kindLabel('telegram')} · t.me respondió 404. · 3 items`)
    expect(rowSubtitle(row({ count: 1, on_site: false }))).toBe(
      `${kindLabel('telegram')} · 1 item · team only`,
    )
  })

  it('reads the result of a save or a check', () => {
    expect(checkReceipt({ ok: true, new: 3 })).toEqual({
      ok: true,
      line: 'Read: 3 new items',
    })
    expect(checkReceipt({ ok: true, new: 0, unchanged: true }).line).toBe(
      'Read: nothing new',
    )
    expect(
      checkReceipt({ ok: false, error: 'La dirección no es pública.' }),
    ).toEqual({
      ok: false,
      line: 'La dirección no es pública.',
    })
  })
})
