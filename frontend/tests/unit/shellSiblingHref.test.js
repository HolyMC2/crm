// Sibling app links from the shell rail (composables/shellRail.siblingHref).
import { describe, expect, it } from 'vitest'
import { siblingHref } from '@/composables/shellRail'
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
