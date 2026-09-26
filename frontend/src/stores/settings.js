import { createDocumentResource } from 'frappe-ui'
import { reactive, ref } from 'vue'
import {
  PRODUCT_IDENTITY,
  brandPalette,
  resolveProductIdentity,
} from '@/utils/productIdentity'

const settings = ref({})
const brand = reactive(resolveProductIdentity())
let faviconRequest = 0

// Page-specific usePageMeta calls can restore the favicon captured at boot.
// Reapply the effective tenant icon after navigation without changing page titles.
export function syncBrandFavicon() {
  const favicon = document.querySelector('link[rel="icon"]')
  favicon?.setAttribute('href', brand.favicon)
  favicon?.removeAttribute('type')
  favicon?.removeAttribute('sizes')
}

const _settings = createDocumentResource({
  doctype: 'FCRM Settings',
  name: 'FCRM Settings',
  onSuccess: (data) => {
    settings.value = data
    getSettings().setupBrand()
    return data
  },
})

export function getSettings() {
  function setupBrand() {
    const previousName = brand.name
    Object.assign(brand, resolveProductIdentity(settings.value))
    if (typeof document === 'undefined') return
    for (const [token, value] of Object.entries(brandPalette(brand.color))) {
      document.documentElement.style.setProperty(token, value)
    }
    // Keep record-specific titles; only replace the application title.
    if (
      [previousName, 'Frappe CRM', PRODUCT_IDENTITY.name, ''].includes(
        document.title,
      )
    ) {
      document.title = brand.name
    }
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute('content', brand.name)

    const request = ++faviconRequest
    const applyFavicon = (url) => {
      brand.favicon = url
      // Tenant uploads can be PNG, ICO or SVG, with different dimensions.
      syncBrandFavicon()
    }
    applyFavicon(brand.favicon)
    if (brand.favicon !== PRODUCT_IDENTITY.favicon) {
      const probe = new Image()
      probe.onerror = () => {
        if (request === faviconRequest) applyFavicon(PRODUCT_IDENTITY.favicon)
      }
      probe.src = brand.favicon
    }
  }

  return {
    _settings,
    settings,
    brand,
    setupBrand,
  }
}
