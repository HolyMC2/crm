import { createDocumentResource } from 'frappe-ui'
import { reactive, ref } from 'vue'

const settings = ref({})
const brand = reactive({})

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
    brand.name = settings.value?.brand_name
    brand.logo = settings.value?.brand_logo
    brand.favicon = settings.value?.favicon
    // Per-tenant accent: FCRM Settings.brand_color (custom field, optional)
    // overrides the --brand default from index.css. Only a #rrggbb value is
    // accepted — anything else keeps the default rather than injecting CSS.
    const color = settings.value?.brand_color
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      document.documentElement.style.setProperty('--brand', color)
    }
  }

  return {
    _settings,
    settings,
    brand,
    setupBrand,
  }
}
