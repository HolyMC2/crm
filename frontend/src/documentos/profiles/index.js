// Profile loader (Shell SPEC §6 DD1): a curated profile per doctype, loaded lazily
// and merged over the generic one; any other readable doctype gets the generic
// profile with its registry entry, or a bare one on the generic floor.
import { profileBySlug, profileFor } from '../registry'
import { genericProfile } from './_generic'

// doctype → lazy module. Add a line here with your profile file (README.md).
// Keys may carry a slug when one doctype has several lists: 'Payment Entry:cobros'.
const CURATED = {
  'Sales Invoice': () => import('./sales_invoice.js'),
  Quotation: () => import('./quotation.js'),
}

/** The merged profile for a registry entry (or a bare doctype on the floor). */
export async function loadProfile({ doctype, entry = null }) {
  const base = entry || profileFor(doctype) || { doctype, slug: null }
  const slugKey = `${base.doctype}:${base.slug}`
  const loader = (base.slug && CURATED[slugKey]) || CURATED[base.doctype]
  const own = loader ? (await loader()).default : {}
  return { ...genericProfile, ...base, ...own, doctype: base.doctype }
}

export function loadProfileBySlug(slug, base) {
  const entry = profileBySlug(slug, base)
  return entry ? loadProfile({ doctype: entry.doctype, entry }) : null
}

export function hasCuratedProfile(doctype) {
  return Object.keys(CURATED).some((key) => key.split(':')[0] === doctype)
}
