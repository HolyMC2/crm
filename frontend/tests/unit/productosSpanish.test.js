// Every string the Productos list and product page show has its es-MX
// translation (with the Productos context where the code asks for it), and
// the «Mínimos por tienda» lines read in Spanish as the catalog says them.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  otherRulesLine,
  problemOf,
  projectionLine,
} from '@/composables/useProductos'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Set()
const spanish = new Map()
for (const m of po.matchAll(
  /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
)) {
  const key = `${m[1] || ''}\u0004${m[2].replace(/\\"/g, '"')}`
  catalog.add(key)
  spanish.set(key, m[3].replace(/\\"/g, '"'))
}
// As the shell translates (src/translation.js): the context's entry first,
// then the plain one.
function es(message, replace, context = null) {
  const found =
    (context && spanish.get(`${context}\u0004${message}`)) ||
    spanish.get(`\u0004${message}`) ||
    message
  return found.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const FILES = [
  'pages/Productos.vue',
  'pages/Producto.vue',
  'pages/ProductoNuevo.vue',
  'components/productos/CatalogFilters.vue',
  'components/productos/CatalogItem.vue',
  'components/productos/ProductThumb.vue',
  'components/productos/VariantGrid.vue',
  'components/productos/PackDialog.vue',
  'components/productos/PhotoGallery.vue',
  'components/productos/LabelDialog.vue',
  'components/productos/MinimoSheet.vue',
  'components/productos/PriceListsToggle.vue',
  'components/productos/ProductInsights.vue',
  'components/productos/ProductPrices.vue',
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

const shell = globalThis.__
afterEach(() => {
  globalThis.__ = shell
})

describe('Productos speaks Spanish', () => {
  it('has a translation for every string it shows', () => {
    const missing = [...strings]
      .filter((key) => !catalog.has(key))
      .map((key) => key.replace('\u0004', ' | '))
    expect(missing).toEqual([])
  })

  it('says a store’s minimum, its projection and its other rules in Spanish', () => {
    globalThis.__ = es
    const centro = {
      warehouse: 'Centro - T',
      label: 'Centro',
      actual_qty: 2,
      projected_qty: 6,
      reorder_level: 5,
      reorder_qty: 10,
      request_type: 'Purchase',
      other_rows: [
        { request_type: 'Transfer', reorder_level: 3, reorder_qty: 6 },
      ],
    }
    expect(projectionLine(centro)).toBe(
      'Quedan 6 contando lo reservado y lo que viene en camino.',
    )
    expect(otherRulesLine(centro)).toBe(
      'Esta tienda también tiene otras reglas: Traslado (mín. 3, pedir 6).',
    )
    expect(
      otherRulesLine({
        other_rows: [
          { request_type: 'Purchase', reorder_level: 1, reorder_qty: 2 },
          { request_type: 'Material Issue', reorder_level: 1, reorder_qty: 2 },
          { request_type: 'Manufacture', reorder_level: 1, reorder_qty: 2 },
          {
            request_type: 'Customer Provided',
            reorder_level: 1,
            reorder_qty: 2,
          },
        ],
      }),
    ).toBe(
      'Esta tienda también tiene otras reglas: Compra (mín. 1, pedir 2), Salida de material (mín. 1, pedir 2), Fabricación (mín. 1, pedir 2), Customer Provided (mín. 1, pedir 2).',
    )
    // MinimoSheet: the story without the worker's own watch, and the
    // question before «Quitar mínimo» when other rules go with it.
    expect(
      es(
        'When there are fewer than {0} in {1}, I suggest ordering {2}. To get an alert, turn on «Alert me» in this store.',
        ['5', 'Centro', '10'],
        'Productos',
      ),
    ).toBe(
      'Cuando haya menos de 5 en Centro, sugiero pedir 10. Para que te avise, pon «Avísame» en esta tienda.',
    )
    expect(
      es(
        'Remove the minimum of {0}? These go too: {1}. I stop suggesting orders there.',
        ['Centro', 'Traslado (mín. 3, pedir 6)'],
        'Productos',
      ),
    ).toBe(
      '¿Quitar el mínimo de Centro? También se quitan: Traslado (mín. 3, pedir 6). Dejo de sugerir pedidos ahí.',
    )
    // A save whose answer never came.
    expect(problemOf({ offline: true, message: 'Sin conexión.' }).title).toBe(
      'No sabemos si se guardó',
    )
  })
})
