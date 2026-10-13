// «Más datos»: the shop's own extra fields on clientes (doco «Personalizar», fields
// named `pz_…`). Pure helpers shared by the record panel, the add-field form, the
// list filters and the Personalizar settings block.
import { formatDay } from './contactos.js'

const t = (text, replace, context) =>
  typeof globalThis.window?.__ === 'function'
    ? globalThis.window.__(text, replace, context)
    : text

export const EXTRA_PREFIX = 'pz_'
export const LABEL_MAX = 60
export const OPTION_MAX = 60
export const OPTIONS_MAX = 30

export function extraKinds() {
  return [
    { value: 'text', label: t('Text') },
    { value: 'number', label: t('Number') },
    { value: 'date', label: t('Date') },
    { value: 'check', label: t('Yes/No') },
    { value: 'list', label: t('List') },
  ]
}

export function kindLabel(kind) {
  return extraKinds().find((item) => item.value === kind)?.label || ''
}

/** Editor meta fields «Datos» shows: everything but the shop's extra fields. */
export function coreFields(fields) {
  return (fields || []).filter((field) => field?.group !== 'extra')
}

/** Editor meta fields «Más datos» shows, in the order the shop added them. */
export function extraFields(fields) {
  return (fields || []).filter((field) => field?.group === 'extra')
}

/** A list's options without the stored blank first line (meta sends text, boot a list). */
export function extraOptions(field) {
  if (Array.isArray(field?.options)) return field.options
  return String(field?.options || '')
    .split('\n')
    .filter((value) => value.trim())
}

export function extraDisplay(field, value, lang = globalThis.window?.lang) {
  if (field?.kind === 'check')
    return value ? t('Yes', null, 'Extra field value') : t('No')
  if (value === '' || value === null || value === undefined) return t('No data')
  if (field?.kind === 'date') return formatDay(value, { lang })
  if (field?.kind === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return String(value)
    try {
      return new Intl.NumberFormat(lang || undefined).format(number)
    } catch {
      return String(number)
    }
  }
  return String(value)
}

/** The value save_record sends: what the native type stores (Número and Sí/No are never empty). */
export function extraPayloadValue(field, value) {
  switch (field?.kind) {
    case 'check':
      return value ? 1 : 0
    case 'number': {
      if (value === '' || value === null || value === undefined) return 0
      const number = Number(value)
      // A value that is not a number goes as typed: the native refusal explains it.
      return Number.isFinite(number) ? number : value
    }
    case 'date':
      return value || null
    case 'list':
      return value || ''
    default:
      return String(value ?? '').trim()
  }
}

const escapeLike = (value) => value.replace(/[%_\\]/g, (ch) => `\\${ch}`)
const unescapeLike = (value) =>
  String(value)
    .replace(/^%|%$/g, '')
    .replace(/\\([%_\\])/g, '$1')
const present = (value) => value !== '' && value !== null && value !== undefined

/** One «Más datos» filter row as Contactos search clauses (=, like, >=, <=). */
export function extraClauses(field, { value, from, to } = {}) {
  if (!field?.fieldname) return []
  const name = field.fieldname
  switch (field.kind) {
    case 'list':
      return present(value) ? [[name, '=', value]] : []
    case 'check':
      return present(value) ? [[name, '=', Number(value) ? 1 : 0]] : []
    case 'text': {
      const text = String(value ?? '').trim()
      return text ? [[name, 'like', `%${escapeLike(text)}%`]] : []
    }
    case 'number':
      return [
        ...(present(from) ? [[name, '>=', Number(from)]] : []),
        ...(present(to) ? [[name, '<=', Number(to)]] : []),
      ]
    case 'date':
      return [
        ...(present(from) ? [[name, '>=', from]] : []),
        ...(present(to) ? [[name, '<=', to]] : []),
      ]
    default:
      return []
  }
}

export function isExtraClause(clause) {
  return (
    Array.isArray(clause) && String(clause[0] || '').startsWith(EXTRA_PREFIX)
  )
}

/** A readable chip for one clause on an extra field («Talla: M», «Visitas desde 10»). */
export function clauseLabel(clause, fields, lang = globalThis.window?.lang) {
  const [fieldname, operator, value] = clause
  const field = (fields || []).find((item) => item.fieldname === fieldname)
  const label = field?.label || t('Retired field')
  if (operator === 'like')
    return t('{0} contains «{1}»', [label, unescapeLike(value)])
  const shown = extraDisplay(field || {}, value, lang)
  if (operator === '>=') return t('{0} from {1}', [label, shown])
  if (operator === '<=') return t('{0} up to {1}', [label, shown])
  return `${label}: ${shown}`
}

/** A section's place on the record: keys a saved order does not list yet go last. */
export function sectionPosition(order, key) {
  const list = Array.isArray(order) ? order : []
  const index = list.indexOf(key)
  return index < 0 ? list.length + 1 : index
}

/**
 * A person's record whose client account holds the shop's extra details: open
 * that account, and its «Volver» brings the worker back to this person.
 */
export function accountExtraRoute(record, customer, extraFieldCount) {
  if (record?.source !== 'contact' || !record?.name || !customer) return null
  if (!extraFieldCount) return null
  return {
    name: 'Contacto',
    params: { source: 'customer', name: customer },
    query: {
      return_to: `/crm/contactos/contact/${encodeURIComponent(record.name)}`,
      return_label: record.title || record.name,
    },
  }
}

/** Text the person can paste to the owner when nobody can be asked from here. */
export function requestText({ label, kind, record } = {}) {
  if (!label)
    return t(
      'Please add the extra details we need for clientes, from Contactos (Personalize).',
    )
  const what = [label, kindLabel(kind)].filter(Boolean).join(' · ')
  return record
    ? t('Please add the extra field «{0}» for clientes. I need it for {1}.', [
        what,
        record,
      ])
    : t('Please add the extra field «{0}» for clientes.', [what])
}
