// «Activar plan» with the plan and cycle chosen inside the sheet (capability
// «activation_choice»): Boat's plans for this trial (`options` of its
// activation quote) as cards the owner reads at 305 px, and the cycle with
// Boat's yearly price and saving. Every figure is Boat's; this only words it.
// Pure.
import { money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, [n]))

export const CYCLES = ['Mensual', 'Anual']

/** Two choices are the same plan in the same cycle. */
export function sameChoice(a, b) {
  return Boolean(a && b && a.plan === b.plan && a.cycle === b.cycle)
}

// «5 usuarios, 3 cajas y 15 GB»; 0 is a plan without a cap.
function includes(option) {
  const users = Number(option.users) || 0
  const cajas = Number(option.cajas) || 0
  const gb = Number(option.storage_gb) || 0
  const parts = [
    users ? plural(users, '1 user', '{0} users') : t('Unlimited users'),
    cajas
      ? plural(cajas, '1 register', '{0} registers')
      : t('Unlimited registers'),
  ]
  return gb
    ? t('{0}, {1} and {2} GB', [parts[0], parts[1], gb])
    : t('{0} and {1}', parts)
}

/** The plan cards, cheapest first as Boat sends them; every price with IVA. */
export function planCards(options, choice) {
  return (Array.isArray(options) ? options : [])
    .filter((option) => option && typeof option.plan === 'string')
    .map((option) => ({
      plan: option.plan,
      name: option.plan_name || option.plan,
      price: money(option.monthly_price_mxn),
      per: t('a month, IVA included'),
      includes: includes(option),
      apps:
        Array.isArray(option.apps) && option.apps.length
          ? t('Includes {0}', [option.apps.join(', ')])
          : '',
      current: option.current === true,
      available: option.available === true,
      // Boat's sentence: what to remove before this plan fits.
      reason:
        option.available === true
          ? ''
          : option.message || t('This plan is not available for your system.'),
      yearly: Number(option.yearly_price_mxn) > 0,
      selected: option.plan === choice?.plan,
    }))
}

/** The chosen plan's option, or null. */
export function chosenOption(options, choice) {
  return (
    (Array.isArray(options) ? options : []).find(
      (option) => option?.plan === choice?.plan,
    ) || null
  )
}

/** The cycle segments: both when the plan is paid yearly, else none. */
export function cycleChoices(option) {
  if (!option || !(Number(option.yearly_price_mxn) > 0)) return []
  return [
    { value: 'Mensual', label: t('Monthly') },
    { value: 'Anual', label: t('Yearly') },
  ]
}

/** What the chosen cycle costs over a year, and what yearly saves. */
export function cycleNote(option, cycle) {
  if (!option) return ''
  const yearly = Number(option.yearly_price_mxn) || 0
  const saving = Number(option.yearly_saving_mxn) || 0
  if (!(yearly > 0)) return t('This plan is paid monthly only.')
  if (cycle === 'Anual')
    return saving > 0
      ? t(
          '{0} a year, IVA included. You save {1} compared with paying monthly.',
          [money(yearly), money(saving)],
        )
      : t('{0} a year, IVA included.', [money(yearly)])
  return saving > 0
    ? t('Paying yearly: {0}, IVA included; you save {1}.', [
        money(yearly),
        money(saving),
      ])
    : t('Paying yearly: {0}, IVA included.', [money(yearly)])
}

/** «Se activó tu plan Pro anual» once Boat converted the site on the choice. */
export function activatedText(option, choice) {
  const name = option?.plan_name || choice?.plan || ''
  return choice?.cycle === 'Anual'
    ? t('Your plan {0} is active, paid yearly.', [name])
    : t('Your plan {0} is active, paid monthly.', [name])
}
