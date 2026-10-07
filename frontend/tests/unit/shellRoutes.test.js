import { describe, expect, it } from 'vitest'
import {
  sourceHref,
  sourceRoute,
  safeIntendedRoute,
  legacyIdentityRoute,
  recoveryModule,
  recoveryReady,
  moduleRefusal,
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
      expect(safeIntendedRoute(route)).toBe('/crm')
    // A caller that knows the boot resumes in the worker's first module.
    expect(safeIntendedRoute('//evil.invalid/crm', '/crm/pendientes')).toBe(
      '/crm/pendientes',
    )
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
describe('Permission recovery follows the module the worker meant to open', () => {
  it('reads the intended module from the refused route', () => {
    expect(recoveryModule('/avisos')).toBe('avisos')
    expect(recoveryModule('/notifications')).toBe('avisos')
    expect(recoveryModule('/avisos?view=history')).toBe('avisos')
    expect(recoveryModule('/compras/orden/PO-1')).toBe('compras')
    expect(recoveryModule('/cobranza?segment=vencidas')).toBe('cobranza')
    expect(recoveryModule('/cobranza/cliente/Ana?company=X')).toBe('cobranza')
    expect(recoveryModule('/archivos?view=ayuda')).toBe('archivos')
    expect(recoveryModule('/contactos/customer/C-1')).toBe('contactos')
    expect(recoveryModule('/organizations')).toBe('contactos')
    expect(recoveryModule('/deals/view/list')).toBe('ventas')
    expect(recoveryModule(undefined)).toBe('ventas')
  })
  it('lets a Website User converted to staff resume Avisos without Sales or Contactos', () => {
    const converted = {
      modules: {
        contactos: { key: 'contactos', enabled: false },
        ventas: { key: 'ventas', enabled: false },
        avisos: { key: 'avisos', enabled: true },
      },
    }
    expect(recoveryReady('avisos', converted)).toBe(true)
    expect(recoveryReady('ventas', converted)).toBe(false)
    expect(recoveryReady('contactos', converted)).toBe(false)
    expect(
      recoveryReady('avisos', { modules: { avisos: { enabled: false } } }),
    ).toBe(false)
    expect(recoveryReady('avisos', { modules: {} })).toBe(false)
    expect(recoveryReady('avisos', null)).toBe(false)
  })
  it('refuses only the module the route belongs to, never over the recovery screen', () => {
    const boot = {
      modules: {
        contactos: { enabled: false, reason: 'Sin Contactos' },
        ventas: { enabled: false },
        avisos: { enabled: true },
      },
    }
    const recovery = { meta: { app: 'contactos', recovery: true } }
    expect(moduleRefusal(recovery, 'contactos', { boot, error: '' })).toBe(null)
    expect(
      moduleRefusal(recovery, 'contactos', {
        boot: null,
        error: 'Sin permiso',
      }),
    ).toBe(null)
    const contactos = { meta: { app: 'contactos' } }
    expect(moduleRefusal(contactos, 'contactos', { boot, error: '' })).toEqual({
      reason: 'Sin Contactos',
    })
    const avisos = { meta: { app: 'avisos' } }
    expect(moduleRefusal(avisos, 'avisos', { boot, error: '' })).toBe(null)
    expect(
      moduleRefusal(avisos, 'avisos', {
        boot: { modules: { avisos: { enabled: false } } },
        error: '',
      }),
    ).toEqual({ reason: '' })
    expect(
      moduleRefusal(avisos, 'avisos', { boot: { modules: {} }, error: '' }),
    ).toEqual({ reason: '' })
    expect(moduleRefusal(avisos, 'avisos', { boot: null, error: '' })).toBe(
      null,
    )
    expect(moduleRefusal({ meta: {} }, 'ventas', { boot, error: '' })).toBe(
      null,
    )
  })
})
