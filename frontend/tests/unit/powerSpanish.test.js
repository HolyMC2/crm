// Every string the power worklists of Compras, Gastos and Garantías show has
// its es-MX translation (with its module context where the code asks for one),
// and so do the keys they list in the Alt+H sheet.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as compras from '@/composables/useCompras'
import * as gastos from '@/composables/useGastos'
import * as garantias from '@/composables/useGarantias'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Set()
for (const m of po.matchAll(
  /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
))
  catalog.add(`${m[1] || ''}\u0004${m[2].replace(/\\"/g, '"')}`)

const MODULES = {
  Compras: [
    'pages/Compras.vue',
    'pages/CompraOrden.vue',
    'components/compras/BulkConfirmSheet.vue',
    'composables/useCompras.js',
  ],
  Gastos: [
    'pages/Gastos.vue',
    'pages/GastoFactura.vue',
    'components/gastos/PayDialog.vue',
    'components/gastos/ApprovalDialog.vue',
    'components/gastos/BulkPaySheet.vue',
    'composables/useGastos.js',
  ],
  Garantías: [
    'pages/Garantias.vue',
    'pages/Garantia.vue',
    'components/garantias/BulkAssignSheet.vue',
    'composables/useGarantias.js',
  ],
  '': [
    'components/power/PowerAppBar.vue',
    'components/power/PowerBulkBar.vue',
    'components/power/PowerResults.vue',
    'components/power/PowerSheet.vue',
    'composables/powerUndo.js',
  ],
}
const strings = new Set()
for (const [module, files] of Object.entries(MODULES))
  for (const file of files) {
    const source = readFileSync(resolve(here, '../../src', file), 'utf8')
    for (const m of source.matchAll(
      /\b(?:__|tr)\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,\s*(?:\[[^\]]*\]|null|[\w.[\]]+)\s*,\s*(CTX|'[^']*'))?/g,
    )) {
      const context = !m[2] ? '' : m[2] === 'CTX' ? module : m[2].slice(1, -1)
      strings.add(`${context}\u0004${m[1].replace(/\\'/g, "'")}`)
    }
  }
const all = {
  pay: true,
  submit: true,
  confirm: true,
  receive: true,
  write: true,
}
for (const s of [
  ...compras.recordShortcuts(all),
  ...gastos.recordShortcuts(all),
  ...gastos.queueShortcuts({}),
  ...garantias.recordShortcuts(all),
])
  strings.add(`\u0004${s.description}`)

// Strings picked from a table at run time: ask the helpers themselves.
const asked = []
const previous = globalThis.window.__
globalThis.window.__ = (message, _replace, context) => {
  asked.push(`${context || ''}\u0004${message}`)
  return message
}
for (const next of [
  'review',
  'decide',
  'resolve',
  'supplier_answer',
  'follow_remedy',
])
  for (const remedy of ['Reparación', 'Cambio', 'Reembolso', 'Proveedor', ''])
    garantias.nextStepLabel({ next, remedy })
compras.SEGMENTS.forEach((s) => compras.segmentLabel(s.value))
gastos.SEGMENTS.forEach((s) => gastos.segmentLabel(s.value))
garantias.SEGMENTS.forEach((s) => garantias.segmentLabel(s.value))
globalThis.window.__ = previous
for (const entry of asked) strings.add(entry)
for (const chip of garantias.CHIPS) strings.add(`Garantías\u0004${chip.label}`)

describe('Spanish for the Compras, Gastos and Garantías power lists', () => {
  it.each([...strings].map((s) => s.replace('\u0004', ' | ')))('%s', (text) => {
    expect(catalog.has(text.replace(' | ', '\u0004'))).toBe(true)
  })
})
