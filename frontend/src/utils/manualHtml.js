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
// The same allow-list as doco.manual.content: typography only, nothing that moves a box.
const STYLES = new Set([
  'text-align',
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
])
// Links may only point at the web, a phone or mail app, or a path of this site.
const SAFE_HREF = /^(?:https?:|mailto:|tel:|\/|#)/i
// Photos only from this site's files (doco keeps the article's own ones).
const IMAGE_PREFIXES = ['/private/files/', '/files/']
// Browsers drop tabs and newlines inside URLs (and spaces and controls around them).
const denoise = (value) =>
  [...value].filter((char) => char.charCodeAt(0) > 0x20).join('')

function sitePath(url) {
  let path = url.pathname
  for (let i = 0; i < 4; i++) {
    let decoded
    try {
      decoded = decodeURIComponent(path)
    } catch {
      break
    }
    if (decoded === path) break
    path = decoded
  }
  // Resolve «.» and «..» the way the server reads the path.
  return new URL(
    path.replace(/\\/g, '/'),
    location.origin,
  ).pathname.toLowerCase()
}

/** A same-site URL that runs a method in the reader's session: /api/… or `?cmd=`. */
function callsTheSite(url) {
  const path = sitePath(url)
  if (path === '/api' || path.startsWith('/api/')) return true
  return [...url.searchParams.keys()].some(
    (key) => key.trim().toLowerCase() === 'cmd',
  )
}

function safeHref(value) {
  const text = denoise(value)
  if (!SAFE_HREF.test(text)) return false
  if (text.startsWith('#') || /^(mailto|tel):/i.test(text)) return true
  let url
  try {
    url = new URL(text, location.origin)
  } catch {
    return false
  }
  if (url.origin !== location.origin) return true
  return !callsTheSite(url)
}

function safeImage(value) {
  const text = denoise(value)
  if (!text.startsWith('/') || text.startsWith('//') || text.startsWith('/\\'))
    return false
  let url
  try {
    url = new URL(text, location.origin)
  } catch {
    return false
  }
  if (url.origin !== location.origin) return false
  if (!IMAGE_PREFIXES.some((prefix) => sitePath(url).startsWith(prefix)))
    return false
  return [...url.searchParams.entries()].every(
    ([key, id]) => key === 'fid' && /^[A-Za-z0-9]{1,40}$/.test(id),
  )
}

function keepTypography(style) {
  return style
    .split(';')
    .map((part) => part.split(':'))
    .filter(
      ([name, ...rest]) =>
        rest.length &&
        STYLES.has(name.trim().toLowerCase()) &&
        !DANGEROUS_STYLE.test(rest.join(':')),
    )
    .map(([name, ...rest]) => `${name.trim()}: ${rest.join(':').trim()}`)
    .join('; ')
}

export function articleHtml(html) {
  if (!html || typeof html !== 'string') return ''
  const fragment = DOMPurify.sanitize(html, {
    FORBID_TAGS,
    // No class or id (review XSS-1): the app's own CSS would make a link an
    // invisible full-screen trap, and an id can clobber the page.
    FORBID_ATTR: [
      'srcset',
      'formaction',
      'action',
      'background',
      'class',
      'id',
    ],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
  for (const element of fragment.querySelectorAll('[style]')) {
    const style = keepTypography(element.getAttribute('style') || '')
    if (style) element.setAttribute('style', style)
    else element.removeAttribute('style')
  }
  for (const element of fragment.querySelectorAll('[href]'))
    if (!safeHref((element.getAttribute('href') || '').trim()))
      element.removeAttribute('href')
  for (const element of fragment.querySelectorAll('[src]'))
    if (
      element.tagName !== 'IMG' ||
      !safeImage((element.getAttribute('src') || '').trim())
    )
      element.removeAttribute('src')
  for (const link of fragment.querySelectorAll('a')) {
    if (link.getAttribute('target') && link.getAttribute('target') !== '_self')
      link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  const holder = document.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
