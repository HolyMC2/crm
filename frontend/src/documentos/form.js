// Draft editing and creation (Shell SPEC §6 D1.2): which fields show, what
// changed, and the payload `crm.api.documentos.save` takes. Pure helpers.

const SIMPLE = /^(!)?\s*([a-z_][a-z0-9_]*)$/i
const EVAL_CMP =
  /^eval:\s*(!)?doc\.([a-z_][a-z0-9_]*)\s*(?:(===?|!==?)\s*(['"])(.*)\4)?\s*;?$/i

/**
 * Frappe `depends_on` for the simple shapes forms use («customer»,
 * «eval:doc.x», «eval:doc.x=='y'», «eval:!doc.x»). Anything else shows the
 * field: hiding a field the worker needs is worse than one extra row.
 */
export function dependsOk(expr, doc = {}) {
  if (!expr) return true
  const text = String(expr).trim()
  let m = text.match(SIMPLE)
  if (m && !text.startsWith('eval:')) {
    const v = !!doc[m[2]]
    return m[1] ? !v : v
  }
  m = text.match(EVAL_CMP)
  if (!m) return true
  const [, not, field, op, , literal] = m
  const value = doc[field]
  if (!op) return not ? !value : !!value
  const equal = String(value ?? '') === literal
  const result = op.startsWith('!') ? !equal : equal
  return not ? !result : result
}

/** The value a control shows: the worker's change, else the document's. */
export function valueOf(field, changes, doc) {
  return Object.prototype.hasOwnProperty.call(changes, field.fieldname)
    ? changes[field.fieldname]
    : (doc?.[field.fieldname] ?? null)
}

/** Required fields still empty, by label («Cliente», «Fecha»). */
export function missingRequired(fields, changes, doc) {
  return fields
    .filter((f) => f.reqd && dependsOk(f.depends_on, { ...doc, ...changes }))
    .filter((f) => {
      const v = valueOf(f, changes, doc)
      return v === null || v === undefined || v === ''
    })
    .map((f) => f.label)
}

const ROW_KEYS = ['qty', 'rate', 'uom', 'discount_percentage', 'warehouse']

/** Item rows for save: kept rows by `_idx` with their changes, new rows by `item_code`. */
export function rowsForSave(rows) {
  return (rows || []).map((row) => {
    const out = row._idx ? { _idx: row._idx } : { item_code: row.item_code }
    for (const key of ROW_KEYS) if (key in row && row[key] !== undefined) out[key] = row[key]
    return out
  })
}

/** True when the rows differ from the document's (order, quantities, prices, added, removed). */
export function rowsChanged(before, after) {
  const a = rowsForSave(before)
  const b = rowsForSave(after)
  return JSON.stringify(a) !== JSON.stringify(b)
}

// Query keys of /nuevo that are not field prefills.
const RESERVED = new Set(['origen', 'desde', 'con', 'duplicar', 'modificar'])

/** /nuevo?origen=Quotation&desde=SAL-QTN-…&con=sales_order → the server's `source`. */
export function sourceFromQuery(query = {}, doctype = '') {
  const one = (v) => (Array.isArray(v) ? v[0] : v) || ''
  if (one(query.con) && one(query.origen) && one(query.desde))
    return { make: one(query.con), doctype: one(query.origen), name: one(query.desde) }
  if (one(query.duplicar)) return { duplicate: one(query.duplicar), doctype }
  if (one(query.modificar)) return { amend: one(query.modificar), doctype }
  return null
}

/** Field prefills from the query (`?customer=…`), only for fields the form shows. */
export function prefillFromQuery(query = {}, fields = []) {
  const names = new Set(fields.map((f) => f.fieldname))
  const out = {}
  for (const [key, value] of Object.entries(query))
    if (!RESERVED.has(key) && names.has(key) && typeof value === 'string')
      out[key] = value
  return out
}

// Mapper keys (crm/api/documentos.py MAKERS) → the doctype they create.
export const MAKE_TARGETS = Object.freeze({
  sales_order: 'Sales Order',
  sales_invoice: 'Sales Invoice',
  delivery_note: 'Delivery Note',
  payment: 'Payment Entry',
  purchase_order: 'Purchase Order',
  purchase_receipt: 'Purchase Receipt',
  purchase_invoice: 'Purchase Invoice',
  request_for_quotation: 'Request for Quotation',
})
const PAYS_OUT = new Set(['Purchase Order', 'Purchase Invoice'])

/** What a mapper creates from `doctype`, and the hint that picks its list (cobros · pagos). */
export function makeTarget(doctype, key) {
  const target = key === 'return' ? doctype : MAKE_TARGETS[key] || ''
  const hint =
    target === 'Payment Entry'
      ? { payment_type: PAYS_OUT.has(doctype) ? 'Pay' : 'Receive' }
      : null
  return { doctype: target, hint }
}
