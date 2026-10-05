import { describe, expect, it } from 'vitest'
import {
  sourceHref,
  sourceRoute,
  safeIntendedRoute,
  legacyIdentityRoute,
} from '@/utils/shellRoutes'
describe('Muelle shell source routes', () => {
  it('encodes source names without permitting arbitrary doctypes', () => {
    expect(sourceHref('Contact', 'A/B #?')).toBe(
      '/crm/contactos/contact/A%2FB%20%23%3F',
    )
    expect(sourceHref('User', 'Administrator')).toBe('/crm/contactos')
    expect(sourceRoute('Supplier', 'S')).toEqual({
      name: 'Contacto',
      params: { source: 'supplier', name: 'S' },
      query: {},
    })
  })
  it('keeps intended navigation local', () => {
    for (const route of [
      '//evil.invalid/crm/contactos',
      '/login',
      '/crm\\evil',
      'https://evil.invalid/crm/contactos',
    ])
      expect(safeIntendedRoute(route)).toBe('/crm/contactos')
    expect(safeIntendedRoute('/crm/contactos?segment=people#notes')).toBe(
      '/crm/contactos?segment=people#notes',
    )
  })
  it('retains unknown legacy filters for explicit review', () => {
    expect(
      legacyIdentityRoute(
        {
          params: { viewType: 'kanban' },
          query: { view: 'Private', filters: 'unknown' },
          hash: '#documents',
        },
        'organization',
      ),
    ).toEqual({
      name: 'Contactos',
      query: {
        view: 'Private',
        filters: 'unknown',
        legacy_view: 'Private',
        legacy_source: 'organization',
        segment: 'companies',
      },
      hash: '#documents',
    })
  })
})
