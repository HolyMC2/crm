// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Identity picker contract (spec §8.2, spec-contactos §7). Each SPA renders its
// own picker UI against `doco.contactos` search/candidates/create; the DTOs are
// shared so a pick made in one app can be handed to another.
//
// Phone display formatting is NOT reimplemented here: `@muelle/form-core`'s
// `normalizePhone` is the single platform implementation (its `display`).

export type IdentityKind = 'person' | 'company'

/** Party roles shown as badges. Derived from permitted linked records, never stored flags. */
export type IdentityRole = 'cliente' | 'proveedor' | 'paciente' | 'prospecto' | 'empleado' | (string & {})

export interface IdentityRef {
  doctype: string
  name: string
  label: string
  kind: IdentityKind
  roles: IdentityRole[]
  /** Channel the pick came through (phone, whatsapp, email), when relevant. */
  channel?: string
  /** `modified` of the source record; writes carry it for conflict detection. */
  modified: string
}

export interface IdentityPick {
  party: IdentityRef
  contact?: IdentityRef
  address?: { doctype: 'Address'; name: string }
}

/** Stable key `<doctype>:<name>` for maps, selection and `done=` matching. */
export function identityKey(ref: Pick<IdentityRef, 'doctype' | 'name'>): string {
  return `${ref.doctype}:${ref.name}`
}

export function sameIdentity(a: Pick<IdentityRef, 'doctype' | 'name'> | null | undefined, b: Pick<IdentityRef, 'doctype' | 'name'> | null | undefined): boolean {
  return !!a && !!b && a.doctype === b.doctype && a.name === b.name
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value.length <= 140

export function isIdentityRef(value: unknown): value is IdentityRef {
  return (
    isRecord(value) &&
    nonEmpty(value.doctype) &&
    nonEmpty(value.name) &&
    typeof value.label === 'string' &&
    (value.kind === 'person' || value.kind === 'company') &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === 'string') &&
    typeof value.modified === 'string' &&
    (value.channel === undefined || typeof value.channel === 'string')
  )
}

/** Validates a pick from another app or a picker callback; drops a malformed contact/address. */
export function parseIdentityPick(value: unknown): IdentityPick | null {
  if (!isRecord(value) || !isIdentityRef(value.party)) return null
  const pick: IdentityPick = { party: value.party }
  if (isIdentityRef(value.contact)) pick.contact = value.contact
  if (isRecord(value.address) && value.address.doctype === 'Address' && nonEmpty(value.address.name))
    pick.address = { doctype: 'Address', name: value.address.name }
  return pick
}
