// «App de tus clientes»: the owner's calls to the cell
// (doco.docoutils.storefront_customer_app_admin). Reading is GET for System
// Manager and Sales Manager; saving is POST and needs Storefront Profile write
// (System Manager). Every answer is the whole screen's state.
import { call, frappeRequest } from 'frappe-ui'

const API = 'doco.docoutils.storefront_customer_app_admin.'

const only = (storefront) => (storefront ? { storefront } : undefined)

/** {profile, profiles, can_change, login, enabled, sections, tabs, store_url, kpis} */
export const readState = (storefront) =>
  frappeRequest({ url: API + 'state', method: 'GET', params: only(storefront) })

/** changes = {enabled?, sections?: {key: bool}, params?: {key: {param: value}}} -> state */
export const saveState = (storefront, changes) =>
  call(API + 'save', { storefront, changes })

/** {terms_text, returns_policy_text, warranty_policy_text, privacy_notice, return_window_days, builtin} */
export const readLegal = (storefront) =>
  frappeRequest({
    url: API + 'legal_texts',
    method: 'GET',
    params: only(storefront),
  })

/** texts = the four texts and return_window_days -> the same shape */
export const saveLegal = (storefront, texts) =>
  call(API + 'save_legal_texts', { storefront, texts })

// The shop's default answer, kept for the doors (Fidelidad): the page refreshes
// it whenever it reads or saves that shop, so a door never asks twice.
let remembered = null

export function rememberState(state, { asDefault = false } = {}) {
  if (!state?.profile) return
  if (asDefault || remembered?.profile === state.profile) remembered = state
}

/** The default shop's state, read once per visit to the app. */
export async function defaultState() {
  if (remembered) return remembered
  const state = await readState()
  remembered = state || null
  return remembered
}

/** Tests start clean. */
export function forgetState() {
  remembered = null
}
