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

  // Hoy has no select for the technician: «Asignar» opens a sheet of choices
  // whose subtitle says what to choose, in the catalog's words (SHELL-S3.3).
  it('the Hoy technician picker is a sheet named in the catalog’s words', () => {
    const text = source('pages/Hoy.vue')
    expect(text).not.toContain('v-model="picks[')
    expect(text).toMatch(/<BottomSheet[^>]*:subtitle="assignField"/)
    expect(text).toContain('action.field_label || action.label')
  })
})
