import DOMPurify from 'dompurify'

// The article body arrives already cleaned by doco (strict allowlist on save and
// in the DTO). The browser cleans it once more before rendering, so nothing a
// worker sees is the stored text as such: no script, handler, form, embed, url()
// style or link that can reach back into this tab.
const FORBID_TAGS = [
  'style',
  'script',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'link',
  'meta',
  'base',
]
const DANGEROUS_STYLE = /url\s*\(|expression\s*\(|javascript:|@import|\\/i
// Links and photos may only point at the web, a phone or mail app, or this site.
const SAFE_URL = /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i

export function articleHtml(html) {
  if (!html || typeof html !== 'string') return ''
  const fragment = DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: ['srcset', 'formaction', 'action', 'background'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
  for (const element of fragment.querySelectorAll('[style]'))
    if (DANGEROUS_STYLE.test(element.getAttribute('style') || ''))
      element.removeAttribute('style')
  for (const element of fragment.querySelectorAll('[href], [src]'))
    for (const name of ['href', 'src']) {
      const value = (element.getAttribute(name) || '').trim()
      if (element.hasAttribute(name) && !SAFE_URL.test(value))
        element.removeAttribute(name)
    }
  for (const link of fragment.querySelectorAll('a')) {
    if (link.getAttribute('target') && link.getAttribute('target') !== '_self')
      link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  const holder = document.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
