// frappe-ui's Select shows its English default «Select option» whenever the
// value matches no option (an empty first choice does not count as a label).
// Shell pickers that can start empty name their own placeholder.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path) =>
  readFileSync(resolve(__dirname, '../../src', path), 'utf8')
// The FormControl tag that binds `model` (attributes up to its closing `/>`).
function picker(path, model) {
  const text = source(path)
  const at = text.indexOf(model)
  expect(at, `${path}: ${model}`).toBeGreaterThan(-1)
  const start = text.lastIndexOf('<FormControl', at)
  return text.slice(start, text.indexOf('/>', at))
}

describe('shell pickers never fall back to «Select option»', () => {
  it.each([
    ['pages/Hoy.vue', 'v-model="picks[card.key + row.key]"'],
    ['components/cobranza/PaymentSheet.vue', 'v-model="form.mode"'],
    ['components/cobranza/AutoSetupSheet.vue', ':model-value="form.account"'],
    ['components/archivos/ArchivoDetail.vue', 'v-model="manual.doctype"'],
    ['components/archivos/ArchivoDetail.vue', 'v-model="form.document_kind"'],
    ['pages/Garantia.vue', 'v-model="purchaseReceipt"'],
    ['pages/EquipoVacaciones.vue', 'v-model="leaveType"'],
    ['pages/ManualEditor.vue', 'v-model="form.company"'],
    ['components/manual/TemplatesSheet.vue', 'v-model="company"'],
  ])('%s %s', (path, model) => {
    const tag = picker(path, model)
    expect(tag).toContain('type="select"')
    expect(tag).toMatch(/:placeholder="/)
  })

  it('the Hoy technician picker says what to choose, in the catalog’s words', () => {
    expect(picker('pages/Hoy.vue', 'v-model="picks[')).toContain(
      ':placeholder="`${card.source.action.field_label || __(\'Choose\')}…`"',
    )
  })
})
