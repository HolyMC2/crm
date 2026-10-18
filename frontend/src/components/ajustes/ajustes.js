// «Todos los ajustes» (Shell SPEC DD13, SHELL-D6): the field guide of one
// record from doco (assistant/record_fields.py), searched and filtered here,
// with the worker's pending edits kept as one change set until «Guardar».
import { h } from 'vue'
import { call } from 'frappe-ui'

/**
 * A plain <button>. `<component :is="'button'">` resolves to frappe-ui's
 * globally registered `Button` (Vue matches `button` → `Button`), which
 * forces its own height, centring and grey fill onto a multi-line row.
 */
export function NativeButton(_, { slots, attrs }) {
  return h('button', { type: 'button', ...attrs }, slots.default?.())
}
NativeButton.inheritAttrs = false

export const RECORD_FIELDS = 'doco.docoutils.assistant.record_fields'

export function loadGuide(doctype, name) {
  return call(`${RECORD_FIELDS}.guide`, { doctype, name })
}

export function saveChanges(doctype, name, changes, modified) {
  return call(`${RECORD_FIELDS}.save`, {
    doctype,
    name,
    changes: JSON.stringify(changes),
    modified,
  })
}

export function undoChanges(token) {
  return call(`${RECORD_FIELDS}.undo`, { token })
}

// Spanish slugs for the curated doctypes; anything else travels as its name.
export const SLUGS = {
  producto: 'Item',
  cliente: 'Customer',
  proveedor: 'Supplier',
  almacen: 'Warehouse',
}

export function doctypeFromSlug(slug) {
  return SLUGS[slug] || decodeURIComponent(slug || '')
}

export function ajustesRoute(doctype, name) {
  if (doctype === 'Item')
    return { name: 'ProductoAjustes', params: { item: name } }
  const slug = Object.keys(SLUGS).find((key) => SLUGS[key] === doctype)
  return { name: 'Ajustes', params: { slug: slug || doctype, name } }
}

/** Lower case without accents: «Número» matches «numero». */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function haystack(section, field) {
  return fold(
    [
      field.label,
      field.help,
      field.keywords,
      field.display,
      field.fieldname,
      section.title,
    ].join(' '),
  )
}

/**
 * The sections to show for a search query and the «Solo lo activado» chip.
 * Every word of the query must appear (label, help, keywords, value, section).
 * `isSet(field)` lets pending edits count as on.
 */
export function filterSections(sections, query, onlySet, isSet = (f) => f.set) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const out = []
  for (const section of sections || []) {
    const fields = section.fields.filter((field) => {
      if (onlySet && !isSet(field)) return false
      if (!words.length) return true
      const text = haystack(section, field)
      return words.every((word) => text.includes(word))
    })
    if (fields.length) out.push({ ...section, fields })
  }
  return out
}

let tempId = 0

/**
 * The worker's edits before «Guardar»: scalar values by field and row
 * operations by table. `changes()` is the change set doco plans and saves.
 */
export function createPending() {
  return {
    values: {},
    rows: {},
    setValue(field, value, original) {
      if (same(value, original)) delete this.values[field.fieldname]
      else this.values[field.fieldname] = value
    },
    has(fieldname) {
      return fieldname in this.values || (this.rows[fieldname]?.length ?? 0) > 0
    },
    addRow(table, rowValues) {
      ;(this.rows[table] ||= []).push({
        op: 'add',
        temp: `nuevo-${++tempId}`,
        values: { ...rowValues },
      })
    },
    setRow(table, row, rowValues) {
      const ops = (this.rows[table] ||= [])
      const added = ops.find((op) => op.op === 'add' && op.temp === row.name)
      if (added) {
        added.values = { ...added.values, ...rowValues }
        return
      }
      const existing = ops.find((op) => op.op === 'set' && op.row === row.name)
      const changed = {}
      for (const [key, value] of Object.entries(rowValues))
        if (!same(value, row.original?.[key] ?? row.values[key]))
          changed[key] = value
      if (existing) existing.values = { ...existing.values, ...changed }
      else if (Object.keys(changed).length)
        ops.push({ op: 'set', row: row.name, values: changed })
    },
    removeRow(table, row) {
      const ops = (this.rows[table] ||= [])
      const added = ops.findIndex(
        (op) => op.op === 'add' && op.temp === row.name,
      )
      if (added >= 0) {
        ops.splice(added, 1)
        return
      }
      for (let i = ops.length - 1; i >= 0; i--)
        if (ops[i].row === row.name) ops.splice(i, 1)
      ops.push({ op: 'remove', row: row.name })
    },
    /** A table's rows with the pending operations applied, for display. */
    tableRows(table, saved) {
      const ops = this.rows[table] || []
      const out = []
      for (const row of saved || []) {
        if (ops.some((op) => op.op === 'remove' && op.row === row.name))
          continue
        const set = ops.find((op) => op.op === 'set' && op.row === row.name)
        out.push(
          set
            ? {
                ...row,
                original: row.values,
                values: { ...row.values, ...set.values },
                pending: true,
              }
            : row,
        )
      }
      for (const op of ops)
        if (op.op === 'add')
          out.push({
            name: op.temp,
            values: op.values,
            pending: true,
            added: true,
          })
      return out
    },
    changes() {
      const out = Object.entries(this.values).map(([field, value]) => ({
        field,
        value,
      }))
      for (const [table, ops] of Object.entries(this.rows))
        for (const op of ops) {
          if (op.op === 'add')
            out.push({ table, op: 'add', values: { ...op.values } })
          else if (op.op === 'set')
            out.push({
              table,
              op: 'set',
              row: op.row,
              values: { ...op.values },
            })
          else out.push({ table, op: 'remove', row: op.row })
        }
      return out
    },
    count() {
      return (
        Object.keys(this.values).length +
        Object.values(this.rows).reduce((n, ops) => n + ops.length, 0)
      )
    },
    clear() {
      for (const key of Object.keys(this.values)) delete this.values[key]
      for (const key of Object.keys(this.rows)) delete this.rows[key]
    },
  }
}

export function same(a, b) {
  const empty = (v) => v === null || v === undefined || v === ''
  if (empty(a) && empty(b)) return true
  if (typeof a === 'number' || typeof b === 'number')
    return Number(a || 0) === Number(b || 0)
  return a === b
}

/** The value of a field as the control edits it (pending edit first). */
export function currentValue(field, pending) {
  if (field.fieldname in pending.values) return pending.values[field.fieldname]
  return field.value
}

const NUMBER = new Set(['Int', 'Float', 'Currency', 'Percent'])

// ERPNext ships UOM names in English (doco's record_fields.UOM_ES, same list).
export const UOM_ES = {
  Nos: 'Pieza',
  Unit: 'Unidad',
  Box: 'Caja',
  Pair: 'Par',
  Set: 'Juego',
  Dozen: 'Docena',
  Kg: 'Kilogramo',
  Gram: 'Gramo',
  Litre: 'Litro',
  Millilitre: 'Mililitro',
  Meter: 'Metro',
  Centimeter: 'Centímetro',
  Hour: 'Hora',
  Day: 'Día',
  Pack: 'Paquete',
  Roll: 'Rollo',
  Bag: 'Bolsa',
  Bottle: 'Botella',
  Carton: 'Cartón',
}

export function linkLabel(doctype, value) {
  if (doctype === 'UOM' && UOM_ES[value]) return UOM_ES[value]
  return value
}

/** How a pending value reads in the row before it is saved. */
export function pendingDisplay(field, value) {
  if (field.fieldtype === 'Check') return value ? 'Sí' : 'No'
  if (value === null || value === undefined || value === '')
    return 'Sin definir'
  if (field.fieldtype === 'Select')
    return (
      field.options?.find((option) => option.value === value)?.label ?? value
    )
  if (field.fieldtype === 'Link') return linkLabel(field.link, value)
  if (field.fieldtype === 'Currency')
    return `$${Number(value).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  if (NUMBER.has(field.fieldtype)) return Number(value).toLocaleString('es-MX')
  return String(value)
}

/** The control a fieldtype gets in «Todos los ajustes». */
export function controlKind(fieldtype) {
  if (fieldtype === 'Check') return 'switch'
  if (fieldtype === 'Select') return 'select'
  if (fieldtype === 'Link') return 'link'
  if (NUMBER.has(fieldtype)) return 'number'
  if (fieldtype === 'Date') return 'date'
  if (fieldtype === 'Datetime') return 'datetime'
  if (['Small Text', 'Text', 'Long Text', 'Text Editor'].includes(fieldtype))
    return 'text'
  if (['Table', 'Table MultiSelect'].includes(fieldtype)) return 'table'
  if (['Data', 'Phone', 'Int', 'Read Only'].includes(fieldtype)) return 'line'
  return 'line'
}
