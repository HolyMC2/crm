// Every string the Productos list and product page show has its es-MX
// translation (with the Productos context where the code asks for it).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Set()
for (const m of po.matchAll(
  /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
))
  catalog.add(`${m[1] || ''}\u0004${m[2].replace(/\\"/g, '"')}`)

const FILES = [
  'pages/Productos.vue',
  'pages/Producto.vue',
  'components/productos/CatalogFilters.vue',
  'components/productos/CatalogItem.vue',
  'components/productos/ProductThumb.vue',
  'components/productos/VariantGrid.vue',
  'components/productos/PackDialog.vue',
  'components/productos/PhotoGallery.vue',
  'composables/useProductos.js',
]
const strings = new Set()
for (const file of FILES) {
  const source = readFileSync(resolve(here, '../../src', file), 'utf8')
  for (const m of source.matchAll(
    /\b(?:__|tr)\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,\s*(?:\[[^\]]*\]|null|[\w.[\]]+)\s*,\s*(CTX|'[^']*'))?/g,
  )) {
    const context = !m[2]
      ? ''
      : m[2] === 'CTX'
        ? 'Productos'
        : m[2].slice(1, -1)
    strings.add(`${context}\u0004${m[1].replace(/\\'/g, "'")}`)
  }
}

describe('Productos speaks Spanish', () => {
  it('has a translation for every string it shows', () => {
    const missing = [...strings]
      .filter((key) => !catalog.has(key))
      .map((key) => key.replace('\u0004', ' | '))
    expect(missing).toEqual([])
  })
})
