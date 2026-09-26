// Display identity only. Routes, app ids, DocTypes and tenant settings stay intact.
export const PRODUCT_IDENTITY = Object.freeze({
  name: 'CRM',
  logo: '/assets/crm/images/logo.svg',
  favicon: '/assets/crm/images/logo.svg',
  color: '#0f6b78',
})

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function imageUrl(value) {
  const url = text(value)
  return /^(\/[^/]|https?:\/\/)/i.test(url) ? url : ''
}

export function resolveProductIdentity(settings = {}) {
  const tenantName = text(settings?.brand_name)
  return {
    name: tenantName || PRODUCT_IDENTITY.name,
    tenantName,
    // An empty tenant logo renders the inline, accessible product mark.
    logo: imageUrl(settings?.brand_logo),
    favicon: imageUrl(settings?.favicon) || PRODUCT_IDENTITY.favicon,
    color: /^#[0-9a-f]{6}$/i.test(text(settings?.brand_color))
      ? settings.brand_color.trim().toLowerCase()
      : PRODUCT_IDENTITY.color,
  }
}

export function brandPalette(color) {
  const mix = (target, weight) =>
    '#' +
    [1, 3, 5]
      .map((i) => {
        const channel = parseInt(color.slice(i, i + 2), 16)
        return Math.round(channel * (1 - weight) + target * weight)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  return {
    '--brand': color,
    '--brand-strong': mix(0, 0.2),
    '--brand-soft-light': mix(255, 0.9),
    '--brand-soft-dark': mix(24, 0.8),
  }
}
