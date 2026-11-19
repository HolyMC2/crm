// Sibling app links from the shell rail (composables/shellRail.siblingHref).
import { describe, expect, it } from 'vitest'
import { placeHref, siblingHref } from '@/composables/shellRail'
import { SIBLING_APPS } from '@/vendor/muelle-shell/contracts'

const app = (key) => SIBLING_APPS.find((entry) => entry.key === key)

describe('siblingHref', () => {
  it('opens app roots bare: /taller/ would cost a 301 and void the prefetch', () => {
    for (const [key, path] of [
      ['taller', '/taller'],
      ['pos', '/posapp'],
      ['mercado', '/mercado'],
      ['clinica', '/clinica'],
    ]) {
      const url = new URL(
        siblingHref(app(key), '/hoy', 'Hoy'),
        'https://x.test',
      )
      expect(url.pathname).toBe(path)
      expect(url.searchParams.get('return_to')).toBe('/crm/hoy')
    }
  })

  it('keeps Escáner on its offline-ready home alias', () => {
    const url = new URL(siblingHref(app('scan'), '/hoy'), 'https://x.test')
    expect(url.pathname).toBe('/scan/inicio')
  })
})

describe('placeHref', () => {
  it('opens a Desk place from Más with the way back to the page left', () => {
    const url = new URL(
      placeHref({ href: '/desk/asistencia' }, '/hoy', 'Hoy'),
      'https://x.test',
    )
    expect(url.pathname).toBe('/desk/asistencia')
    expect(url.searchParams.get('return_to')).toBe('/crm/hoy')
    expect(url.searchParams.get('return_label')).toBe('Hoy')
  })

  it('keeps the place as given when the way back cannot be built', () => {
    expect(placeHref({ href: 'https://elsewhere.test/x' }, '/hoy', 'Hoy')).toBe(
      'https://elsewhere.test/x',
    )
  })
})
