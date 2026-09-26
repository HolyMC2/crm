import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import {
  PRODUCT_IDENTITY,
  brandPalette,
  resolveProductIdentity,
} from '@/utils/productIdentity'
import BrandLogo from '@/components/BrandLogo.vue'

const settingsResource = vi.hoisted(() => ({ options: null }))
vi.mock('frappe-ui', () => ({
  createDocumentResource: (options) => {
    settingsResource.options = options
    return {}
  },
}))
import { getSettings, syncBrandFavicon } from '@/stores/settings'

const cleanups = []
const probes = []
beforeEach(() => {
  document.head.innerHTML =
    '<title>CRM</title><link rel="icon" type="image/png" sizes="32x32"><meta name="apple-mobile-web-app-title" content="CRM">'
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        probes.push(this)
      }
    },
  )
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  probes.length = 0
  vi.unstubAllGlobals()
})

function mountLogo(brand) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(BrandLogo, { modelValue: brand }) })
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}

describe('CRM display identity', () => {
  it('has usable defaults while settings are unavailable', () => {
    expect(resolveProductIdentity(null)).toMatchObject({
      name: 'CRM',
      logo: '',
      favicon: PRODUCT_IDENTITY.favicon,
    })
    const el = mountLogo(resolveProductIdentity())
    expect(el.querySelector('svg[role="img"]').getAttribute('aria-label')).toBe(
      'CRM',
    )
  })

  it('preserves custom settings without mutating them', () => {
    const settings = Object.freeze({
      brand_name: 'Casa de ventas',
      brand_logo: '/files/logo.png',
      favicon: 'https://example.test/favicon.ico',
      brand_color: '#A02080',
    })
    expect(resolveProductIdentity(settings)).toEqual({
      name: 'Casa de ventas',
      tenantName: 'Casa de ventas',
      logo: '/files/logo.png',
      favicon: 'https://example.test/favicon.ico',
      color: '#a02080',
    })
    expect(
      resolveProductIdentity({
        brand_logo: 'javascript:alert(1)',
        favicon: 'invalid',
        brand_color: 'red;',
      }),
    ).toMatchObject({
      logo: '',
      favicon: PRODUCT_IDENTITY.favicon,
      color: PRODUCT_IDENTITY.color,
    })
  })

  it('falls back after a broken tenant logo and recovers after changing it', async () => {
    const brand = reactive(
      resolveProductIdentity({
        brand_name: 'A long tenant name',
        brand_logo: '/files/missing.png',
      }),
    )
    const el = mountLogo(brand)
    expect(el.querySelector('img').alt).toBe('A long tenant name')
    el.querySelector('img').dispatchEvent(new Event('error'))
    await nextTick()
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('svg').getAttribute('aria-label')).toBe(
      'A long tenant name',
    )
    brand.logo = '/files/new.png'
    await nextTick()
    expect(el.querySelector('img').getAttribute('src')).toBe('/files/new.png')
  })

  it('updates reactive names, favicon and the full palette, and resets removed overrides', () => {
    settingsResource.options.onSuccess({
      brand_name: 'Tienda',
      favicon: '/files/icon.ico',
      brand_color: '#a02080',
    })
    const { brand } = getSettings()
    expect(brand.name).toBe('Tienda')
    expect(document.title).toBe('Tienda')
    expect(
      document.querySelector('link[rel="icon"]').getAttribute('href'),
    ).toBe('/files/icon.ico')
    for (const [token, color] of Object.entries(brandPalette('#a02080'))) {
      expect(document.documentElement.style.getPropertyValue(token)).toBe(color)
    }
    probes[0].onerror()
    expect(brand.favicon).toBe(PRODUCT_IDENTITY.favicon)
    settingsResource.options.onSuccess({})
    expect(brand.name).toBe('CRM')
    expect(document.title).toBe('CRM')
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      PRODUCT_IDENTITY.color,
    )
  })

  it('restores the tenant favicon after page metadata resets it without changing the title', () => {
    settingsResource.options.onSuccess({ favicon: '/files/tenant.ico' })
    document
      .querySelector('link[rel="icon"]')
      .setAttribute('href', PRODUCT_IDENTITY.favicon)
    document.title = 'Reports'
    syncBrandFavicon()
    expect(
      document.querySelector('link[rel="icon"]').getAttribute('href'),
    ).toBe('/files/tenant.ico')
    expect(document.title).toBe('Reports')
  })

  it('ignores an older favicon failure and preserves a record-specific title', () => {
    document.title = 'Deal 002'
    settingsResource.options.onSuccess({ favicon: '/files/old.ico' })
    settingsResource.options.onSuccess({
      brand_name: 'New shop',
      favicon: '/files/new.ico',
    })
    probes[0].onerror()
    expect(getSettings().brand.favicon).toBe('/files/new.ico')
    expect(document.title).toBe('Deal 002')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]').content,
    ).toBe('New shop')
  })
})
