import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import plugin from 'tailwindcss/plugin'

// Lucide mask icons for `class="lucide-<name>"`, as frappe-ui's preset makes
// them, but about a fifth of the bytes. frappe-ui embeds each icon's SVG file
// verbatim — license comment, class attribute, every character
// percent-encoded — twice per rule (-webkit-mask-image and mask-image), which
// made the icons 300 KB of the 640 KB global stylesheet every phone parses
// before the first paint (and ~13 KB of its 60 KB gzip budget). Here each rule
// carries one minimal data URI in a custom property that both mask
// declarations read. The rendering is the same: a 24×24 viewBox, stroke 1.5,
// round caps and joins, painted through the mask in currentColor.

const require = createRequire(import.meta.url)
const ICONS_DIR = path.join(
  path.dirname(require.resolve('lucide-static/package.json')),
  'icons',
)
// frappe-ui draws lucide at 1.5 instead of the stock 2.
const STROKE_WIDTH = '1.5'

/** An SVG as a short, valid data URI: single quotes, only the needed escapes. */
export function svgDataUri(svg) {
  const compact = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(\/?>)\s*/g, '$1')
    .replace(/\s*</g, '<')
    .replace(/"/g, "'")
    .trim()
  return (
    'data:image/svg+xml,' +
    compact.replace(/[\r\n%#()<>?[\\\]^`{|}]/g, encodeURIComponent)
  )
}

/** The mask SVG of one lucide icon: its shapes on the shared stroke style. */
export function lucideMaskSvg(source) {
  const shapes = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ` +
    `viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="${STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`
  )
}

const cache = new Map()
function iconUri(name) {
  if (cache.has(name)) return cache.get(name)
  const file = path.join(ICONS_DIR, `${name}.svg`)
  let uri = null
  if (/^[a-z0-9-]+$/.test(name) && fs.existsSync(file))
    uri = svgDataUri(lucideMaskSvg(fs.readFileSync(file, 'utf8')))
  cache.set(name, uri)
  return uri
}

function iconNames() {
  try {
    return fs
      .readdirSync(ICONS_DIR)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.slice(0, -4))
  } catch {
    return []
  }
}

export const lucideIcons = plugin(({ matchComponents }) => {
  const values = Object.fromEntries(iconNames().map((name) => [name, name]))
  // Components layer (as in frappe-ui) so `size-4`, `text-ink-*` and other
  // utilities still win without `!important`.
  matchComponents(
    {
      lucide: (name) => {
        const uri = iconUri(name)
        if (!uri) return {}
        return {
          '--lucide-icon': `url("${uri}")`,
          display: 'block',
          width: '1em',
          height: '1em',
          'background-color': 'currentColor',
          '-webkit-mask': 'var(--lucide-icon) center / contain no-repeat',
          mask: 'var(--lucide-icon) center / contain no-repeat',
          'flex-shrink': '0',
        }
      },
    },
    { values, type: 'any' },
  )
})

/** frappe-ui's preset with its lucide plugin swapped for this one. */
export function withLeanLucide(preset) {
  const isLucide = (entry) =>
    String(entry?.handler || entry).includes('matchComponents')
  const plugins = (preset.plugins || []).filter((entry) => !isLucide(entry))
  if (plugins.length !== (preset.plugins || []).length - 1)
    throw new Error(
      'tailwind/lucideIcons: frappe-ui preset changed; expected exactly one lucide plugin to replace',
    )
  return { ...preset, plugins: [...plugins, lucideIcons] }
}
