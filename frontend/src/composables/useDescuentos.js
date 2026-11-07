import { comprasApi, money, qty } from '@/composables/useCompras'
import { formatDay } from '@/utils/contactos'

// Compras «Descuentos de proveedor»: native buying Pricing Rules that ERPNext
// applies to every purchase save (doco.workspaces.descuentos owns reads and
// writes). Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.descuentos'

export function descuentosApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

// `label` names the scope (es «Activos», context Descuentos), `chip` one rule
// (es «Activo», context Descuento), `title` the list in that scope.
export const STATES = Object.freeze([
  {
    value: 'activo',
    label: 'Active',
    chip: 'Active',
    title: 'Active discounts',
  },
  {
    value: 'programado',
    label: 'Scheduled',
    chip: 'Scheduled',
    title: 'Scheduled discounts',
  },
  {
    value: 'vencido',
    label: 'Ended',
    chip: 'Ended',
    title: 'Ended discounts',
  },
  {
    value: 'desactivado',
    label: 'Turned off',
    chip: 'Turned off',
    title: 'Turned-off discounts',
  },
  { value: '', label: 'All', chip: '', title: 'All discounts' },
])
const STATE_TONES = {
  activo: 'success',
  programado: 'info',
  vencido: 'neutral',
  desactivado: 'neutral',
}
export function stateChip(state) {
  const found = STATES.find((s) => s.value === state && s.chip)
  return {
    label: tr(found?.chip || 'Active', null, 'Descuento'),
    tone: STATE_TONES[state] || 'neutral',
  }
}
/** The list's title in a state: «Descuentos activos», «Todos los descuentos». */
export function stateTitle(state) {
  const found = STATES.find((s) => s.value === state) || STATES.at(-1)
  return tr(found.title, null, 'Descuentos')
}
export function normalizeState(value) {
  return STATES.some((s) => s.value === value) ? value : 'activo'
}

/** «10 % de descuento», «$50.00 menos», «a precio de $90.00», «Artículos de regalo». */
export function discountText(discount, currency) {
  const value = Number(discount?.value) || 0
  if (discount?.kind === 'product') return tr('Free items')
  if (discount?.kind === 'amount')
    return tr('{0} off', [money(value, currency)])
  if (discount?.kind === 'price')
    return tr('priced at {0}', [money(value, currency)])
  return tr('{0} % off', [qty(value)])
}

/** «en Pantalla Moto G15», «en 3 artículos», «en la marca Samsung», «en toda la compra». */
export function whatText(what) {
  const targets = what?.targets || []
  const first = targets[0]?.label || ''
  const count = targets.length
  if (what?.kind === 'order') return tr('on the whole purchase')
  const one = {
    items: 'on {0}',
    groups: 'on the group {0}',
    brands: 'on the brand {0}',
  }
  const many = {
    items: 'on {0} items',
    groups: 'on {0} groups',
    brands: 'on {0} brands',
  }
  const kind = what?.kind in one ? what.kind : 'items'
  if (count === 1) return tr(one[kind], [first])
  return tr(many[kind], [count])
}

/** «Para todos los proveedores», «Para Tecnomaxx», «Para el grupo Mayoristas». */
export function whoText(who) {
  if (!who || who.kind === 'all') return tr('For every supplier')
  if (who.kind === 'group')
    return tr('For the supplier group {0}', [who.label || ''])
  return tr('For {0}', [who.label || ''])
}

/** The rule in one line: what it takes off, on what, from when on, until when. */
export function ruleSummary(rule, currency = 'MXN') {
  const parts = [
    `${discountText(rule.discount, currency)} ${whatText(rule.what)}`,
  ]
  if (Number(rule.min_qty) > 0)
    parts.push(tr('from {0} pieces', [qty(rule.min_qty)]))
  if (Number(rule.min_amt) > 0)
    parts.push(tr('from {0}', [money(rule.min_amt, currency)]))
  if (rule.valid_upto) parts.push(tr('until {0}', [formatDay(rule.valid_upto)]))
  else if (rule.state === 'programado' && rule.valid_from)
    parts.push(tr('starts {0}', [formatDay(rule.valid_from)]))
  return parts.join(', ')
}

/** A new rule's form; from a purchase it starts with that supplier. */
export function blankRule({ supplier = null, company = '' } = {}) {
  return {
    name: '',
    modified: '',
    title: '',
    disabled: false,
    who_kind: supplier ? 'supplier' : 'all',
    who_name: supplier?.name || '',
    who_label: supplier?.label || '',
    what_kind: 'items',
    targets: [],
    discount_kind: 'percent',
    discount_value: '',
    apply_discount_on: 'Grand Total',
    min_qty: '',
    max_qty: '',
    min_amt: '',
    max_amt: '',
    valid_from: '',
    valid_upto: '',
    company: company || '',
    warehouse: '',
    priority: '',
  }
}

/** The editor form for a rule the service read. */
export function ruleForm(rule) {
  const number = (value) => (Number(value) ? Number(value) : '')
  return {
    name: rule.name,
    modified: rule.modified,
    title: rule.title || '',
    disabled: Boolean(rule.disabled),
    who_kind: rule.who?.kind || 'all',
    who_name: rule.who?.name || '',
    who_label: rule.who?.label || '',
    what_kind: rule.what?.kind || 'items',
    targets: (rule.what?.targets || []).map((t) => ({ ...t })),
    discount_kind: rule.discount?.kind || 'percent',
    discount_value: number(rule.discount?.value),
    apply_discount_on: rule.apply_discount_on || 'Grand Total',
    min_qty: number(rule.min_qty),
    max_qty: number(rule.max_qty),
    min_amt: number(rule.min_amt),
    max_amt: number(rule.max_amt),
    valid_from: rule.valid_from || '',
    valid_upto: rule.valid_upto || '',
    company: rule.company || '',
    warehouse: rule.warehouse || '',
    priority: number(rule.priority),
  }
}

/** A name for a new rule when the worker gives none: «Tecnomaxx 10 %». */
export function suggestedTitle(form, currency = 'MXN') {
  const who =
    form.who_kind === 'all' ? tr('Every supplier') : form.who_label || ''
  const value = Number(form.discount_value) || 0
  if (!value && form.discount_kind !== 'price') return who
  const off =
    form.discount_kind === 'amount'
      ? money(value, currency)
      : form.discount_kind === 'price'
        ? tr('priced at {0}', [money(value, currency)])
        : `${qty(value)} %`
  return `${who} ${off}`.trim()
}

/** The editor form → the allowlisted payload `save_rule` accepts. */
export function rulePayload(form, currency = 'MXN') {
  const number = (value) => (value === '' || value === null ? 0 : Number(value))
  return {
    ...(form.name ? { name: form.name, modified: form.modified } : {}),
    title: (form.title || '').trim() || suggestedTitle(form, currency),
    disabled: Boolean(form.disabled),
    who:
      form.who_kind === 'all'
        ? { kind: 'all' }
        : { kind: form.who_kind, name: form.who_name },
    what:
      form.what_kind === 'order'
        ? { kind: 'order' }
        : { kind: form.what_kind, targets: form.targets.map((t) => t.name) },
    discount: { kind: form.discount_kind, value: number(form.discount_value) },
    ...(form.what_kind === 'order'
      ? { apply_discount_on: form.apply_discount_on }
      : {}),
    min_qty: number(form.min_qty),
    max_qty: number(form.max_qty),
    min_amt: number(form.min_amt),
    max_amt: number(form.max_amt),
    valid_from: form.valid_from || null,
    valid_upto: form.valid_upto || null,
    company: form.company || null,
    warehouse: form.what_kind === 'order' ? null : form.warehouse || null,
    priority: number(form.priority),
  }
}

/** What still blocks a save, in the worker's words. */
export function ruleMissing(form) {
  const missing = []
  if (form.who_kind !== 'all' && !form.who_name)
    missing.push(
      form.who_kind === 'group'
        ? tr('the supplier group')
        : tr('the supplier', null, 'Descuentos'),
    )
  if (form.what_kind !== 'order' && !form.targets.length)
    missing.push(
      {
        items: tr('at least one item'),
        groups: tr('at least one item group'),
        brands: tr('at least one brand'),
      }[form.what_kind] || tr('at least one item'),
    )
  const value = Number(form.discount_value)
  if (form.discount_kind === 'price' && form.what_kind === 'order')
    missing.push(tr('a % or an amount for the whole purchase'))
  else if (form.discount_kind === 'percent' && !(value > 0 && value <= 100))
    missing.push(tr('a discount above 0 and up to 100 %'))
  else if (form.discount_kind === 'amount' && !(value > 0))
    missing.push(tr('an amount off above zero'))
  else if (
    form.discount_kind === 'price' &&
    !(value >= 0 && form.discount_value !== '')
  )
    missing.push(tr('the price'))
  if (form.valid_from && form.valid_upto && form.valid_upto < form.valid_from)
    missing.push(tr('an end date after the start'))
  return missing
}

/** Where a rule opens, with the way back to where the worker was. */
export function ruleRoute(name, query = {}) {
  return {
    name: 'CompraDescuento',
    params: { name: name || 'nuevo' },
    query,
  }
}
