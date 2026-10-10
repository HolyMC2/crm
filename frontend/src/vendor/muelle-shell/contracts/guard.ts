// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Blocked-state contract (spec §5.6, spec-contactos «structured guard»).
//
// A guard explains why something cannot happen *and* how to resolve it. The
// server sends the DTO; every SPA renders it (GuardNotice in the shell) and
// turns each action into an effect with `resolveGuardAction`. Product rule:
// no dead-end refusals, so a sanitized guard always carries at least one
// action. UI hiding is presentation; the server rechecks every request.
import { format, type Translate } from './messages'
import { safeReturn, RETURN_PREFIXES } from './returnTo'

export type GuardActionKind = 'route' | 'call' | 'request_access' | 'retry' | 'copy'

export interface GuardAction {
  label: string
  kind: GuardActionKind
  /**
   * route: local path under a Muelle SPA prefix · call: whitelisted method ·
   * request_access: capability key · copy: text to copy · retry: unused.
   */
  target?: string
  /** Arguments for a `call` action. Hints only; the server re-authorizes. */
  args?: Record<string, unknown>
}

export interface GuardDTO {
  /** Stable machine code, e.g. `permission`, `missing_fiscal_data`, `shift_closed`. */
  code: string
  /** One plain-language reason sentence, already translated by the server. */
  message: string
  /** Optional helper sentence under the reason. */
  helper?: string
  /** Fields the guard is about, for the inline variant. */
  fields?: string[]
  actions: GuardAction[]
  /** What a retry or a granted request needs to resume where the worker was. */
  retry_context?: Record<string, unknown>
  /** Request id for «Detalles para soporte». Never shown as the reason. */
  request_id?: string
}

const KINDS: ReadonlySet<string> = new Set(['route', 'call', 'request_access', 'retry', 'copy'])
const METHOD = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$/i
const CAPABILITY = /^[a-z][a-z0-9_.:-]{0,79}$/i
const MAX_ACTIONS = 4

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

/** Shape check for an untrusted payload. Use `sanitizeGuard` before rendering. */
export function isGuardDTO(value: unknown): value is GuardDTO {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    Array.isArray(value.actions)
  )
}

function sanitizeAction(value: unknown, prefixes: readonly string[]): GuardAction | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !KINDS.has(value.kind)) return null
  const label = cleanText(value.label, 60)
  if (!label) return null
  const kind = value.kind as GuardActionKind
  const action: GuardAction = { label, kind }
  if (kind === 'route') {
    const target = safeReturn(value.target, prefixes)
    if (!target) return null
    action.target = target
  } else if (kind === 'call') {
    if (typeof value.target !== 'string' || !METHOD.test(value.target)) return null
    action.target = value.target
    if (isRecord(value.args)) action.args = value.args
  } else if (kind === 'request_access') {
    if (typeof value.target !== 'string' || !CAPABILITY.test(value.target)) return null
    action.target = value.target
  } else if (kind === 'copy') {
    const text = typeof value.target === 'string' ? value.target.slice(0, 2000) : ''
    if (!text.trim()) return null
    action.target = text
  }
  return action
}

export interface SanitizeOptions {
  t?: Translate
  /** Prefixes a `route` action may target. Default: every Muelle SPA. */
  allowedPrefixes?: readonly string[]
}

/**
 * A render-safe copy: HTML stripped, lengths capped, unknown kinds and unsafe
 * targets dropped, at most four actions, and at least one (Reintentar) so the
 * worker is never left without a way forward.
 */
export function sanitizeGuard(guard: GuardDTO, options: SanitizeOptions = {}): GuardDTO {
  const t = options.t ?? format
  const prefixes = options.allowedPrefixes ?? RETURN_PREFIXES
  const actions = (Array.isArray(guard.actions) ? guard.actions : [])
    .map((action) => sanitizeAction(action, prefixes))
    .filter((action): action is GuardAction => action !== null)
    .slice(0, MAX_ACTIONS)
  if (actions.length === 0) actions.push({ label: t('Try again'), kind: 'retry' })
  const out: GuardDTO = {
    code: cleanText(guard.code, 80) ?? 'blocked',
    message: cleanText(guard.message, 300) ?? t("We couldn't complete this."),
    actions,
  }
  const helper = cleanText(guard.helper, 300)
  if (helper) out.helper = helper
  if (Array.isArray(guard.fields)) {
    const fields = guard.fields.filter((f): f is string => typeof f === 'string' && /^[a-z0-9_]{1,140}$/i.test(f))
    if (fields.length) out.fields = fields
  }
  if (isRecord(guard.retry_context)) out.retry_context = guard.retry_context
  const requestId = cleanText(guard.request_id, 120)
  if (requestId) out.request_id = requestId
  return out
}

/**
 * Find a guard in what a Frappe call returned or threw: the DTO itself,
 * `{guard}`, `{message: DTO}` (whitelisted return), `{exc_guard}`, or a JSON
 * entry of `_server_messages`. Returns the raw DTO or `null`.
 */
export function findGuard(payload: unknown): GuardDTO | null {
  if (isGuardDTO(payload)) return payload
  if (!isRecord(payload)) return null
  for (const key of ['guard', 'message', 'exc_guard', 'data'] as const) {
    if (isGuardDTO(payload[key])) return payload[key] as GuardDTO
  }
  const serverMessages = payload._server_messages
  if (typeof serverMessages === 'string') {
    try {
      const entries: unknown = JSON.parse(serverMessages)
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const parsed: unknown = typeof entry === 'string' ? JSON.parse(entry) : entry
          const found = isRecord(parsed) ? findGuard(parsed) : null
          if (found) return found
        }
      }
    } catch {
      return null
    }
  }
  return null
}

const TECHNICAL =
  /traceback|exception|stack trace|\berror\s*:|\berror \d{3}\b|\b(?:http|status|c[oó]digo)\s*[45]\d\d\b|^\s*[45]\d\d\b|frappe\.|\.py\b|\bsql\b|\bundefined\b|\bnull\b/i

/** A server message worth showing as the reason: one short, human sentence. */
function humanMessage(error: unknown): string | null {
  if (!isRecord(error) && !(error instanceof Error)) return null
  const record = error as unknown as Record<string, unknown>
  const candidates: unknown[] = []
  if (Array.isArray(record.messages)) candidates.push(...record.messages)
  candidates.push(record.message)
  for (const candidate of candidates) {
    const text = cleanText(candidate, 300)
    if (text && !TECHNICAL.test(text)) return text
  }
  return null
}

/**
 * Always a guard: the server's DTO when present, otherwise a generic one that
 * keeps a human server message (never a traceback or HTTP code) and offers
 * Reintentar plus a copyable support detail when a request id is known.
 */
export function guardFromError(error: unknown, options: SanitizeOptions & { requestId?: string } = {}): GuardDTO {
  const t = options.t ?? format
  const found = findGuard(error) ?? (isRecord(error) ? findGuard(error.response) : null)
  if (found) return sanitizeGuard(found, options)
  const actions: GuardAction[] = [{ label: t('Try again'), kind: 'retry' }]
  if (options.requestId) actions.push({ label: t('Copy details for support'), kind: 'copy', target: options.requestId })
  const guard: GuardDTO = {
    code: 'unknown',
    message: humanMessage(error) ?? t("We couldn't complete this."),
    helper: t('Try again. If it keeps happening, copy the details for support.'),
    actions,
  }
  if (options.requestId) guard.request_id = options.requestId
  return sanitizeGuard(guard, options)
}

/** The action GuardNotice renders as the solid button: the first that resolves, else retry. */
export function primaryGuardAction(guard: GuardDTO): GuardAction | null {
  return guard.actions.find((a) => a.kind !== 'retry' && a.kind !== 'copy') ?? guard.actions[0] ?? null
}

export type GuardEffect =
  | { type: 'navigate'; href: string }
  | { type: 'call'; method: string; args: Record<string, unknown> }
  | { type: 'request_access'; capability: string; context: Record<string, unknown> }
  | { type: 'retry'; context: Record<string, unknown> }
  | { type: 'copy'; text: string }

/**
 * What the UI should do for an action, or `null` for an action that fails
 * validation (render it disabled with the guard's reason; never execute it).
 */
export function resolveGuardAction(
  action: GuardAction,
  guard: Pick<GuardDTO, 'retry_context'> = {},
  allowedPrefixes: readonly string[] = RETURN_PREFIXES,
): GuardEffect | null {
  const context = guard.retry_context ?? {}
  const safe = sanitizeAction(action, allowedPrefixes)
  if (!safe) return null
  switch (safe.kind) {
    case 'route':
      return { type: 'navigate', href: safe.target as string }
    case 'call':
      return { type: 'call', method: safe.target as string, args: { ...(safe.args ?? {}) } }
    case 'request_access':
      return { type: 'request_access', capability: safe.target as string, context }
    case 'copy':
      return { type: 'copy', text: safe.target as string }
    case 'retry':
      return { type: 'retry', context }
  }
}
