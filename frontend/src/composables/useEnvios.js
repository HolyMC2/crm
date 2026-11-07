import { comprasApi, money, qty } from '@/composables/useCompras'

// Compras «Reglas de envío»: native buying Shipping Rules. A purchase that
// picks one gets its charge in the taxes on every save (doco.workspaces.envios
// owns reads and writes). Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.envios'

export function enviosApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

// `label` names the scope (es «Activas», context Envios), `chip` one rule
// (es «Activa», context Envio), `title` the list in that scope.
export const STATES = Object.freeze([
  {
    value: 'activo',
    label: 'Active',
    chip: 'Active',
    title: 'Active shipping rules',
  },
  {
    value: 'desactivado',
    label: 'Turned off',
    chip: 'Turned off',
    title: 'Turned-off shipping rules',
  },
  { value: '', label: 'All', chip: '', title: 'All shipping rules' },
])
export function stateChip(state) {
  const found = STATES.find((s) => s.value === state && s.chip)
  return {
    label: tr(found?.chip || 'Active', null, 'Envio'),
    tone: state === 'activo' ? 'success' : 'neutral',
  }
}
export function stateTitle(state) {
  const found = STATES.find((s) => s.value === state) || STATES.at(-1)
  return tr(found.title, null, 'Envios')
}
export function normalizeState(value) {
  return STATES.some((s) => s.value === value) ? value : 'activo'
}

/** What a range is measured in: the purchase's subtotal, or its net weight. */
function measure(value, basedOn, currency) {
  return basedOn === 'net_weight' ? qty(value) : money(value, currency)
}
function charge(amount, currency) {
  return Number(amount) > 0 ? money(amount, currency) : tr('no charge')
}

/** Each range in the worker's words: «Hasta $1,000.00: $150.00»,
 *  «De $1,000.00 a $3,000.00: $80.00», «Más de $3,000.00: sin cargo». */
export function stepLines(steps = [], basedOn = 'net_total', currency = 'MXN') {
  return steps.map((step, index) => {
    const from = index ? steps[index - 1].to : 0
    const cost = charge(step.amount, currency)
    if (step.to === null || step.to === undefined || step.to === '')
      return index
        ? tr('More than {0}: {1}', [measure(from, basedOn, currency), cost])
        : tr('Any purchase: {0}', [cost])
    return index
      ? tr('From {0} to {1}: {2}', [
          measure(from, basedOn, currency),
          measure(step.to, basedOn, currency),
          cost,
        ])
      : tr('Up to {0}: {1}', [measure(step.to, basedOn, currency), cost])
  })
}

/** «Según el monto de la compra», «Según el peso neto de la compra». */
export function basisText(basedOn) {
  return basedOn === 'net_weight'
    ? tr('By the purchase’s net weight')
    : tr('By the purchase amount')
}

/** What the rule charges, in one line: «$150.00 por compra», or its ranges. */
export function chargeSummary(rule, currency = rule?.currency || 'MXN') {
  if (!rule) return ''
  if (rule.based_on === 'fixed')
    return tr('{0} per purchase', [money(rule.amount, currency)])
  if (rule.steps?.length)
    return `${basisText(rule.based_on)}: ${stepLines(rule.steps, rule.based_on, currency).join('; ')}`
  return `${basisText(rule.based_on)}: ${tr('ranges set in the full form')}`
}

/** A rule as the purchase picker lists it: its charge as the hint. */
export function pickHint(option) {
  if (option.based_on === 'fixed')
    return tr('{0} per purchase', [money(option.amount, option.currency)])
  return basisText(option.based_on)
}

const OPEN = Object.freeze({ to: null, amount: '' })

/** A new rule's form. */
export function blankRule({ company = '' } = {}) {
  return {
    name: '',
    modified: '',
    label: '',
    disabled: false,
    company: company || '',
    account: '',
    account_label: '',
    cost_center: '',
    cost_center_label: '',
    based_on: 'fixed',
    amount: '',
    steps: [{ to: '', amount: '' }, { ...OPEN }],
  }
}

/** The editor form for a rule the service read. */
export function ruleForm(rule) {
  const number = (value) => (Number(value) ? Number(value) : '')
  const steps = (rule.steps || []).map((step) => ({
    to: step.to === null || step.to === undefined ? null : number(step.to),
    amount: Number(step.amount) || 0,
  }))
  return {
    name: rule.name,
    modified: rule.modified,
    label: rule.label || '',
    disabled: Boolean(rule.disabled),
    company: rule.company || '',
    account: rule.account?.name || '',
    account_label: rule.account?.label || '',
    cost_center: rule.cost_center?.name || '',
    cost_center_label: rule.cost_center?.label || '',
    based_on: rule.based_on || 'fixed',
    amount: number(rule.amount),
    steps: steps.length ? steps : blankRule().steps,
  }
}

/** A range more, just before the open one at the end. */
export function addStep(steps) {
  const open = steps.at(-1)
  return [...steps.slice(0, -1), { to: '', amount: '' }, open || { ...OPEN }]
}
/** One range less; the open one at the end stays. */
export function removeStep(steps, index) {
  if (steps.length < 2 || index === steps.length - 1) return steps
  return steps.filter((_step, i) => i !== index)
}

/** What still blocks a save, in the worker's words. */
export function ruleMissing(form) {
  const missing = []
  if (!String(form.label || '').trim()) missing.push(tr('the name'))
  if (!form.company) missing.push(tr('the company', null, 'Envios'))
  if (!form.account) missing.push(tr('the account it charges to'))
  if (form.based_on === 'fixed') {
    if (!(Number(form.amount) > 0)) missing.push(tr('what it charges'))
    return missing
  }
  let low = 0
  let ordered = true
  for (const step of form.steps.slice(0, -1)) {
    const high = Number(step.to)
    if (step.to === '' || !(high > low)) ordered = false
    low = high
  }
  if (!ordered) missing.push(tr('where each range ends, from low to high'))
  if (
    form.steps.some(
      (step) =>
        step.amount === '' ||
        step.amount === null ||
        !(Number(step.amount) >= 0),
    )
  )
    missing.push(tr('what each range charges'))
  return missing
}

/** The editor form → the allowlisted payload `save_rule` accepts. */
export function rulePayload(form) {
  const ranged = form.based_on !== 'fixed'
  return {
    ...(form.name ? { name: form.name, modified: form.modified } : {}),
    label: String(form.label || '').trim(),
    disabled: Boolean(form.disabled),
    company: form.company || null,
    account: form.account || null,
    cost_center: form.cost_center || null,
    based_on: form.based_on,
    amount: ranged ? 0 : Number(form.amount) || 0,
    ...(ranged
      ? {
          conditions: form.steps.map((step, index) =>
            index === form.steps.length - 1
              ? { amount: Number(step.amount) || 0 }
              : { to: Number(step.to), amount: Number(step.amount) || 0 },
          ),
        }
      : {}),
  }
}

/** Where a rule opens, with the way back to where the worker was. */
export function ruleRoute(name, query = {}) {
  return { name: 'CompraEnvio', params: { name: name || 'nuevo' }, query }
}
