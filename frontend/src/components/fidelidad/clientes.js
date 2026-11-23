// «Mostrar a clientes»: what a promotion's sheet says and sends about the shop's
// customer app (doco.fidelidad.api.set_customer_view). A promotion reaches the
// app only when the owner switches it on; it may carry its own title and
// picture for customers, and a coupon promotion may let customers switch their
// coupon on themselves. Pure words and payloads here, tested without a browser.
import { prepareImage } from '@/components/ui/imageFiles'
import { uploadAttachment } from '@/documentos/tools'
import { fidelidadApi } from '@/composables/fidelidad'

export const CTX = 'AppClientes'
export const TITLE_MAX = 80
export const APP_ROUTE = '/negocio/app-clientes'

/** The promotion's record: a price rule travels as `rule:<name>`. */
export function recordOf(name = '') {
  const value = String(name || '')
  return value.startsWith('rule:')
    ? { doctype: 'Pricing Rule', name: value.slice(5) }
    : { doctype: 'POS Offer', name: value }
}

/**
 * Where a promotion shows, in the owner's words: «En la app y en la tienda».
 * `app` is the shop's customer app ({promos, coupons, online}); while its
 * «Promociones» is off the line says what turns it on.
 */
export function whereLine(offer, app = null) {
  const view = offer?.customers
  if (!view) return ''
  if (!view.show) return __('Only your team sees it', null, CTX)
  // the app's Promos tab lists them (a coupon is switched on from there too)
  if (!app?.promos)
    return __(
      'Customers see it once «Promotions» is on in your customer app',
      null,
      CTX,
    )
  if (view.where === 'both')
    return __('In the app, at the register and in the online store', null, CTX)
  if (offer.coupon_based && app?.online)
    return __(
      'In the app and at the register; its coupon also works online',
      null,
      CTX,
    )
  return __('In the app and at the register', null, CTX)
}

/** The row's short mark on the board: shown to customers or not. */
export function shownLabel(offer) {
  return offer?.customers?.show ? __('In the app', null, CTX) : ''
}

/** What a typed title is, trimmed; '' clears it. */
export function cleanTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Why the title cannot be saved, or ''. */
export function titleProblem(value) {
  return cleanTitle(value).length > TITLE_MAX
    ? __('Keep it to {0} characters.', [TITLE_MAX], CTX)
    : ''
}

/** Only what changed, as set_customer_view takes it. */
export function viewChange(view, patch) {
  const out = {}
  if ('show' in patch && !!patch.show !== !!view?.show) out.show = !!patch.show
  if ('title' in patch && cleanTitle(patch.title) !== (view?.title || ''))
    out.title = cleanTitle(patch.title)
  if ('image' in patch && (patch.image || null) !== (view?.image || null))
    out.image = patch.image || ''
  if ('activatable' in patch && !!patch.activatable !== !!view?.activatable)
    out.activatable = !!patch.activatable
  return out
}

export function setCustomerView(name, data) {
  return fidelidadApi('set_customer_view', { name, data })
}

/** A picture for customers: cut to size on the device, filed as a public file
 * of the promotion (a customer's phone cannot open a private one). */
export async function uploadPicture(
  offerName,
  file,
  { prepare = prepareImage, upload = uploadAttachment } = {},
) {
  const ready = await prepare(file, { maxSide: 1600 })
  const record = recordOf(offerName)
  const answer = await upload({
    doctype: record.doctype,
    name: record.name,
    file: ready,
    isPrivate: false,
  })
  return answer?.file_url || ''
}

/**
 * The toast after «Show to customers» changes: it only promises they see it
 * when the app's «Promotions» is on.
 */
export function shownToast(show, app = null) {
  if (!show) return __('Customers no longer see it', null, CTX)
  if (!app?.promos)
    return __(
      'Saved. Customers see it once «Promotions» is on in your customer app',
      null,
      CTX,
    )
  return __('Customers see it now', null, CTX)
}
