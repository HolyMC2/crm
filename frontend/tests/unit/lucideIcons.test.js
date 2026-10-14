import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  lucideMaskSvg,
  svgDataUri,
  withLeanLucide,
} from '../../tailwind/lucideIcons.js'

const require = createRequire(import.meta.url)
const icons = join(
  dirname(require.resolve('lucide-static/package.json')),
  'icons',
)
const source = (name) => readFileSync(join(icons, `${name}.svg`), 'utf8')

describe('lean lucide mask icons', () => {
  it('keeps the shapes, the 24×24 viewBox and frappe-ui’s 1.5 stroke; drops the rest', () => {
    const svg = lucideMaskSvg(source('search'))
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('stroke-width="1.5"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('<path d="m21 21-4.34-4.34" />')
    expect(svg).toContain('<circle cx="11" cy="11" r="8" />')
    expect(svg).not.toMatch(/license|class=/)
  })

  it('is a short data URI that a CSS url("…") can hold', () => {
    const uri = svgDataUri(lucideMaskSvg(source('search')))
    expect(uri.startsWith('data:image/svg+xml,%3Csvg ')).toBe(true)
    expect(uri).not.toMatch(/["#<>\n]/)
    expect(uri.length).toBeLessThan(320)
    // A browser reads it back to the same SVG.
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toBe(
      "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='m21 21-4.34-4.34'/><circle cx='11' cy='11' r='8'/></svg>",
    )
  })

  it('replaces exactly the one lucide plugin of the preset', () => {
    const other = { handler: ({ addBase }) => addBase({}) }
    const lucide = { handler: ({ matchComponents }) => matchComponents({}) }
    const lean = withLeanLucide({ plugins: [other, lucide], theme: { a: 1 } })
    expect(lean.theme).toEqual({ a: 1 })
    expect(lean.plugins).toHaveLength(2)
    expect(lean.plugins[0]).toBe(other)
    expect(lean.plugins[1]).not.toBe(lucide)
    expect(() => withLeanLucide({ plugins: [other] })).toThrow(/preset changed/)
  })
})
