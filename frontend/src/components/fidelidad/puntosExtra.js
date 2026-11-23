// «Puntos extra» in «Nueva promoción»: bonus points on a qualifying sale (the
// register's Loyalty Point offer). The chips and the sentence the sheet reads
// back before starting; the payload is offerPayload's with discount_type
// «Loyalty Point» (doco.fidelidad.service create_offer).
import { formatDate, formatMoney } from '@/utils/display'

const CTX = 'AppClientes'

export const POINTS_CHIPS = [10, 20, 50, 100, 200]

/** «+50 points on Fundas, until 30 Nov, at the register.» */
export function pointsPreview(draft, currency = 'MXN') {
  const points = Math.round(Number(draft?.value) || 0)
  if (points <= 0) return ''
  const target =
    draft.target === 'ticket'
      ? Number(draft.minimum)
        ? __(
            'a ticket from {0}',
            [formatMoney(draft.minimum, currency, { decimals: 0 })],
            CTX,
          )
        : __('any ticket', null, CTX)
      : draft.pick?.title || draft.pick?.name || '…'
  const how =
    draft.how === 'coupon'
      ? __('with a coupon')
      : __('at the register', null, CTX)
  // no end chosen yet: nothing about the end (the sheet still asks for one)
  if (!draft.until)
    return __('+{0} points on {1}, {2}.', [points, target, how], CTX)
  const until =
    draft.until === 'none'
      ? __('with no end date')
      : __('until {0}', [formatDate(draft.until)])
  return __('+{0} points on {1}, {2}, {3}.', [points, target, until, how], CTX)
}
