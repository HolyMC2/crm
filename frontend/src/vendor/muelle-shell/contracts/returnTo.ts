// Vendored from muelle/workspace/packages/shell-contracts@0.1.0 (af7f823620cb). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Cross-app return protocol (spec-muelle-shell §8.3).
//
// The caller opens `…?return_to=<local path>&return_label=<≤40 chars>`. The
// receiver validates `return_to` with `safeReturn`, shows «Volver a {label}» in
// place of its own back target, and on completion navigates to the return
// target with `done=<doctype>:<name>`. Cancel returns without `done`.
// Business IDs in a query are routing hints only; the server re-authorizes them.

/** Path prefixes of the Muelle SPAs. A return target must sit under one of them. */
export const RETURN_PREFIXES = Object.freeze([
  '/crm/',
  '/taller/',
  '/posapp/',
  '/clinica/',
  '/mercado/',
  '/scan/',
] as const)

export const RETURN_MAX_LENGTH = 2048
export const RETURN_LABEL_MAX = 40

export const RETURN_TO_PARAM = 'return_to'
export const RETURN_LABEL_PARAM = 'return_label'
export const DONE_PARAM = 'done'
/** Taller's intake used `?return=`; accepted for one release, then removed (§8.3). */
export const LEGACY_RETURN_PARAM = 'return'

const ORIGIN = 'https://muelle.invalid'
// Printable ASCII only: callers percent-encode names, so raw whitespace,
// control characters, backslashes and non-ASCII look-alikes are never valid.
const UNSAFE_RAW = /[^\x21-\x7e]|\\/
const UNSAFE_DECODED = /[\u0000-\u001f\u007f-\u009f\\]|\/\/|%(?:2e|2f|5c|25)/i

function pathOf(value: string): string {
  const cut = value.search(/[?#]/)
  return cut < 0 ? value : value.slice(0, cut)
}

function underPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    const bare = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
    return path === bare || path.startsWith(bare + '/')
  })
}

/**
 * The validated local return target, or `null`.
 *
 * Accepts only a same-origin absolute path (`/…`, never `//host`, a scheme or
 * a relative path) of at most 2048 printable ASCII characters, whose path lies
 * under an allowed prefix both as written and once percent-decoded, with no
 * `.`/`..` segment, empty segment, backslash or control character in either
 * form, and that a URL parser leaves exactly as written (no normalization).
 * Generalizes taller's `safeCRMPath` and crm's `safeIntendedRoute`.
 */
export function safeReturn(
  value: unknown,
  allowedPrefixes: readonly string[] = RETURN_PREFIXES,
): string | null {
  if (typeof value !== 'string' || !value || value.length > RETURN_MAX_LENGTH) return null
  if (!value.startsWith('/') || value.startsWith('//') || UNSAFE_RAW.test(value)) return null
  const path = pathOf(value)
  if (!underPrefix(path, allowedPrefixes)) return null
  let parsed: URL
  let decoded: string
  try {
    parsed = new URL(value, ORIGIN)
    decoded = decodeURIComponent(path)
  } catch {
    return null
  }
  if (parsed.origin !== ORIGIN || parsed.pathname !== path) return null
  if (UNSAFE_DECODED.test(decoded) || !underPrefix(decoded, allowedPrefixes)) return null
  const segments = decoded.split('/').slice(1)
  if (segments.some((segment, i) => segment === '.' || segment === '..' || (segment === '' && i < segments.length - 1)))
    return null
  return value
}

/** Trim, collapse whitespace, drop control characters and cap at 40 characters. */
export function sanitizeReturnLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  const chars = Array.from(clean)
  return chars.length <= RETURN_LABEL_MAX ? clean : chars.slice(0, RETURN_LABEL_MAX - 1).join('').trimEnd() + '…'
}

/** Product nouns for a return target when the caller sent no label. Never translated. */
const DEFAULT_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/crm/hoy', 'Hoy'],
  ['/crm/contactos', 'Contactos'],
  ['/crm/pendientes', 'Pendientes'],
  ['/crm/agenda', 'Agenda'],
  ['/crm/archivos', 'Archivos'],
  ['/crm/compras', 'Compras'],
  ['/crm/ventas', 'Ventas'],
  ['/crm/avisos', 'Avisos'],
  ['/crm', 'Muelle'],
  ['/taller', 'Taller'],
  ['/posapp', 'POS'],
  ['/clinica', 'Clínica'],
  ['/mercado', 'Mercado'],
  ['/scan', 'Escáner'],
]

export function defaultReturnLabel(target: string): string {
  const path = pathOf(target)
  for (const [prefix, label] of DEFAULT_LABELS) {
    if (path === prefix || path.startsWith(prefix + '/')) return label
  }
  return 'Muelle'
}

export interface ReturnTarget {
  /** Validated local path with query and hash, ready for `location.assign` or the router. */
  to: string
  /** Sanitized caller label, or the product noun of the target app/module. */
  label: string
  /** True when it came from a legacy parameter (`?return=`) that is going away. */
  legacy: boolean
}

export interface ReadReturnOptions {
  allowedPrefixes?: readonly string[]
  /** Accept Taller's `?return=` for one release. Default true. */
  acceptLegacy?: boolean
}

function params(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search
}

function single(query: URLSearchParams, key: string): string | null | undefined {
  const all = query.getAll(key)
  if (all.length === 0) return undefined
  // A repeated parameter is ambiguous between parsers: refuse rather than guess.
  return all.length === 1 ? (all[0] as string) : null
}

/** The validated return target of the current page, or `null` when absent or unsafe. */
export function readReturn(search: string | URLSearchParams, options: ReadReturnOptions = {}): ReturnTarget | null {
  const query = params(search)
  const prefixes = options.allowedPrefixes ?? RETURN_PREFIXES
  let raw = single(query, RETURN_TO_PARAM)
  let legacy = false
  if (raw === undefined && options.acceptLegacy !== false) {
    raw = single(query, LEGACY_RETURN_PARAM)
    legacy = raw !== undefined
  }
  const to = safeReturn(raw, prefixes)
  if (!to) return null
  const label = sanitizeReturnLabel(single(query, RETURN_LABEL_PARAM)) ?? defaultReturnLabel(to)
  return { to, label, legacy }
}

function withQuery(target: string, edit: (query: URLSearchParams) => void): string {
  const url = new URL(target, ORIGIN)
  edit(url.searchParams)
  return url.pathname + url.search + url.hash
}

/**
 * `href` (a local path) with `return_to`/`return_label` set for the receiver.
 * An unsafe return target is dropped rather than forwarded; an unsafe `href`
 * throws, because the caller built it.
 */
export function withReturn(
  href: string,
  back: { to: string; label?: string },
  allowedPrefixes: readonly string[] = RETURN_PREFIXES,
): string {
  if (!safeReturn(href, allowedPrefixes)) throw new Error(`withReturn: unsafe href ${JSON.stringify(href)}`)
  const to = safeReturn(back.to, allowedPrefixes)
  const label = sanitizeReturnLabel(back.label)
  return withQuery(href, (query) => {
    query.delete(RETURN_TO_PARAM)
    query.delete(RETURN_LABEL_PARAM)
    query.delete(LEGACY_RETURN_PARAM)
    if (!to) return
    query.set(RETURN_TO_PARAM, to)
    if (label) query.set(RETURN_LABEL_PARAM, label)
  })
}

export interface DoneRef {
  doctype: string
  name: string
}

const DONE_PART = /^[^\u0000-\u001f\u007f]{1,140}$/

/**
 * Where to go when the receiving flow finishes: the return target with
 * `done=<doctype>:<name>` (replacing any earlier `done`), or without `done`
 * on cancel. The target is validated again; an unsafe one throws.
 */
export function completeReturn(
  target: ReturnTarget | string,
  done?: DoneRef | null,
  allowedPrefixes: readonly string[] = RETURN_PREFIXES,
): string {
  const to = safeReturn(typeof target === 'string' ? target : target.to, allowedPrefixes)
  if (!to) throw new Error('completeReturn: unsafe return target')
  return withQuery(to, (query) => {
    query.delete(DONE_PARAM)
    if (!done) return
    if (!DONE_PART.test(done.doctype) || !DONE_PART.test(done.name) || done.doctype.includes(':'))
      throw new Error('completeReturn: invalid done reference')
    query.set(DONE_PARAM, `${done.doctype}:${done.name}`)
  })
}

/** The record the receiver completed, read by the caller on return. */
export function readDone(search: string | URLSearchParams): DoneRef | null {
  const raw = single(params(search), DONE_PARAM)
  if (!raw) return null
  const at = raw.indexOf(':')
  if (at <= 0) return null
  const doctype = raw.slice(0, at)
  const name = raw.slice(at + 1)
  return DONE_PART.test(doctype) && DONE_PART.test(name) ? { doctype, name } : null
}

/** The current URL with `done` removed, for `router.replace` after the caller consumed it. */
export function withoutDone(href: string): string {
  return withQuery(href, (query) => query.delete(DONE_PARAM))
}
