// Mi cuenta's Tienda in the owner's words: the plans (the current one marked,
// a change is a request Muelle confirms) and the add-ons with what each costs
// and when the charge starts, from the bootstrap's `store` (Boat
// portal_store._store_options_core). Pure. Prices include IVA.
import { formatMoney } from '@/utils/display'

const t = (text, replace) => __(text, replace, 'Cuenta')
const MXN = 'MXN'

/** «$499» for a whole amount, «$12.50» otherwise. */
export function price(value) {
  const n = Number(value) || 0
  return formatMoney(n, MXN, { decimals: Number.isInteger(n) ? 0 : 2 })
}

const norm = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const PLAN_NAMES = {
  basico: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  corporativo: 'Corporativo',
}

// What each catalog plan includes (Mi plan's plan table); another plan shows its bundle.
function planFeatures(key, bundle) {
  if (key === 'basico')
    return [
      t('1 register and 2 users'),
      t('Point of sale for the counter'),
      t('Catalog, inventory and cash control'),
      t('5 GB of storage'),
    ]
  if (key === 'pro')
    return [
      t('Everything in Básico'),
      t('3 registers and 5 users'),
      t('Each person with their own user and cash count'),
      t('15 GB of storage'),
    ]
  if (key === 'premium')
    return [
      t('Everything in Pro'),
      t('5 registers and 10 users'),
      t('Ready for an online store and CFDI'),
      t('40 GB of storage'),
    ]
  if (key === 'corporativo')
    return [
      t('Everything in Premium'),
      t('10 registers and 15 users'),
      t('Cheaper extra users and registers'),
      t('100 GB of storage'),
    ]
  return bundle ? [t('Bundle {0}', [bundle])] : []
}

/**
 * The plans in Boat's order (cheapest first), priced in the cycle the site
 * pays. The yearly figure is the plan's yearly price, else 10 months (Boat
 * billing_engine.base_fee).
 */
export function planRows(store, { annual = false } = {}) {
  return (store?.plans || []).map((plan) => {
    const key = norm(plan.plan_name || plan.name)
    const monthly = Number(plan.monthly_price_mxn) || 0
    const yearly = Number(plan.yearly_price_mxn) || monthly * 10
    const tenMonths = yearly === monthly * 10
    const current = plan.name === store.current_plan
    // The plan this site pays monthly offers its yearly cycle once, beside the
    // way to ask for it; the other plans keep the yearly figure as a note.
    const ask = current && !annual
    const yearlyText = tenMonths
      ? t('or {0} a year, 2 months free', [price(yearly)])
      : t('or {0} a year', [price(yearly)])
    return {
      name: plan.name,
      display: PLAN_NAMES[key] || plan.plan_name || plan.name,
      current,
      requested: plan.name === store.requested_plan,
      popular: !current && key === 'pro',
      amount: annual ? yearly : monthly,
      price: price(annual ? yearly : monthly),
      per: annual ? t('a year, IVA included') : t('a month, IVA included'),
      note: annual
        ? tenMonths
          ? t('You pay 10 months and get 12.')
          : ''
        : ask
          ? ''
          : yearlyText,
      yearly: ask
        ? tenMonths
          ? t('Switch to the yearly cycle: {0} a year, 2 months free.', [
              price(yearly),
            ])
          : t('Switch to the yearly cycle: {0} a year.', [price(yearly)])
        : '',
      features: planFeatures(key, plan.bundle),
    }
  })
}

/** The plan a pending request names, as the owner reads it. */
export function requestedName(store) {
  const key = store?.requested_plan
  if (!key) return ''
  const plan = (store.plans || []).find((p) => p.name === key)
  const name = norm(plan?.plan_name || key)
  return PLAN_NAMES[name] || plan?.plan_name || key
}

// The catalog's meter units are English keys; [one, many] in the owner's words.
function unitWord(unit, n = 1) {
  const one = n === 1
  if (unit === 'stamp') return one ? t('stamp') : t('stamps')
  if (unit === 'email') return one ? t('email') : t('emails')
  if (unit === 'message') return one ? t('message') : t('messages')
  if (unit === 'month') return one ? t('month') : t('months')
  if (unit === 'GB-month') return t('GB a month')
  if (unit === 'user-month') return one ? t('user a month') : t('users a month')
  if (unit === 'sucursal-month')
    return one ? t('branch a month') : t('branches a month')
  if (unit === '100 documents/month') return t('100 documents a month')
  return String(unit || '')
}
const monthly = (unit) => !unit || unit === 'month'

/** Boat marks an add-on it cannot deliver yet (`status`, `unavailable_reason`). */
export function addonAvailable(addon) {
  return (
    Boolean(addon?.active) || !addon?.status || addon.status === 'disponible'
  )
}

// What it costs, also while Boat cannot deliver it yet: the reason under the
// row says when it opens.
function addonPrice(addon) {
  if (addon.active) return t('Active')
  const pkg = addon.packages?.[0]
  if (pkg?.price) return t('from {0} a month', [price(pkg.price)])
  if (addon.unit_price_mxn)
    return monthly(addon.meter_unit)
      ? t('{0} a month', [price(addon.unit_price_mxn)])
      : t('from {0} per {1}', [
          price(addon.unit_price_mxn),
          unitWord(addon.meter_unit),
        ])
  return t('Included')
}

// How it is charged; a monthly fee already says it in its price.
function addonMeter(addon) {
  if (!addon.meter_unit) return t('Platform service')
  if (addon.meter_unit === 'month') return ''
  return t('Measured per {0}', [unitWord(addon.meter_unit)])
}

/** The add-ons Boat offers this site, each with its switch and why it is off. */
export function addonRows(store) {
  return (store?.addons || [])
    .filter((addon) => addon?.service_key)
    .map((addon) => {
      const available = addonAvailable(addon)
      return {
        key: addon.service_key,
        addon,
        name: addon.service_name || '',
        meter: addonMeter(addon),
        price: addonPrice(addon),
        active: Boolean(addon.active),
        available,
        reason: available
          ? ''
          : addon.unavailable_reason ||
            t('It will be available on your site soon.'),
        switchLabel: addon.active
          ? t('Turn off {0}', [addon.service_name])
          : t('Turn on {0}', [addon.service_name]),
      }
    })
}

/**
 * The confirm sheet before an add-on changes (Mi plan's askToggle): price,
 * cycle and when the charge starts. Boat bills a flat add-on once it is
 * delivered, prorated for the rest of that month, then monthly
 * (billing_engine.on_service_delivered); on a trial it rides the plan's first
 * invoice.
 */
export function addonConfirm(addon, { isTrial = false } = {}) {
  if (addon.active)
    return {
      kind: 'addon',
      action: 'cancel',
      addon,
      title: t('Turn off {0}', [addon.service_name]),
      amount: '',
      per: '',
      lines: [
        t(
          'It turns off at the end of the period already paid; the period in progress is not refunded.',
        ),
      ],
      verb: t('Turn off'),
      danger: true,
    }
  const pkg = addon.packages?.[0]
  const cost = pkg?.price || addon.unit_price_mxn || 0
  const lines = []
  if (pkg?.qty && pkg?.price)
    lines.push(t('Includes {0} stamps a month.', [pkg.qty]))
  if (!cost) lines.push(t('No additional cost on record.'))
  else if (isTrial)
    lines.push(t('It is added to your plan when you activate it.'))
  else if (addon.pricing_mode && addon.pricing_mode !== 'flat')
    lines.push(t('What you use is charged from the moment it is ready.'))
  else
    lines.push(
      t(
        'It is charged from the moment it is ready, prorated for the days left in the month.',
      ),
    )
  return {
    kind: 'addon',
    action: 'activate',
    addon,
    title: t('Turn on {0}', [addon.service_name]),
    amount: cost ? price(cost) : '',
    per: !cost
      ? ''
      : pkg?.price || monthly(addon.meter_unit)
        ? t('a month, IVA included')
        : t('per {0}, IVA included', [unitWord(addon.meter_unit)]),
    lines,
    verb: t('Turn on'),
    danger: false,
  }
}

/** The confirm sheet before a plan request: price, cycle, and who decides. */
export function planConfirm(row) {
  const lines = [
    t(
      'Muelle confirms the change and lets you know; until then you keep your plan. Nothing is charged now.',
    ),
  ]
  return {
    kind: 'plan',
    target: row.name,
    title: t('Change to {0}', [row.display]),
    amount: row.price,
    per: row.per,
    lines,
    verb: t('Request the change'),
    danger: false,
  }
}
