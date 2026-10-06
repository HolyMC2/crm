// Vendored from muelle/workspace/packages/shell-contracts@0.2.0 (cd63cbd0639f). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Command palette contract (spec §1.4). Providers search independently; one
// slow or failing provider never blocks another. Clínica and Taller implement
// the same provider shape so their palettes can federate later.
import type { IdentityRef } from './identity'

export type PaletteGroup = 'acciones' | 'registros' | 'ir_a' | 'recientes'

/** Display order of groups. */
export const PALETTE_GROUPS: readonly PaletteGroup[] = Object.freeze(['acciones', 'registros', 'ir_a', 'recientes'])

/** English source labels for `__()`; es-MX: Acciones, Registros, Ir a, Recientes. */
export const PALETTE_GROUP_LABELS: Readonly<Record<PaletteGroup, string>> = Object.freeze({
  acciones: 'Actions',
  registros: 'Records',
  ir_a: 'Go to',
  recientes: 'Recent',
})

export interface PaletteItem {
  /** Unique within its provider. */
  id: string
  group: PaletteGroup
  title: string
  subtitle?: string
  icon?: `lucide-${string}`
  /** Local path to open (validated by the shell before navigating). */
  href?: string
  /** Named action the shell or module dispatches (e.g. `contactos.create`). */
  action?: string
  /** Arguments for `action`, e.g. the typed text to prefill. */
  args?: Record<string, unknown>
  /** The record behind a Registros result. */
  ref?: Pick<IdentityRef, 'doctype' | 'name'>
  /** Display hint such as `c` or `⌘K`. */
  shortcut?: string
  /** Provider key, filled by `federatedSearch`. */
  source?: string
}

export type PaletteScope = 'all' | 'actions' | 'people' | 'documents' | 'refacciones'

export interface PaletteProvider {
  key: string
  /** Provider label for its Registros subgroup («Contactos», «Ventas»). */
  label: string
  /** Prefixed scopes this provider also answers; every provider answers unprefixed queries. */
  scopes?: PaletteScope[]
  search(query: PaletteQuery, signal: AbortSignal): Promise<PaletteItem[]>
}

export const PALETTE_DEBOUNCE_MS = 150
export const PALETTE_SLOW_MS = 400
export const PALETTE_PER_GROUP = 5
export const PALETTE_RECENT_LIMIT = 8

/** `>` actions, `@` people and companies, `#` documents by number, `%` Taller refacciones. */
export const PALETTE_PREFIXES: Readonly<Record<string, PaletteScope>> = Object.freeze({
  '>': 'actions',
  '@': 'people',
  '#': 'documents',
  '%': 'refacciones',
})

export interface PaletteQuery {
  raw: string
  scope: PaletteScope
  /** Query text without the scope prefix, trimmed. */
  text: string
  /** Detected kind; phone and RFC queries search Contactos first. */
  kind: 'text' | 'phone' | 'rfc' | 'empty'
}

const PHONE = /^\+?[\d\s().-]{7,20}$/
// Persona moral (3 letters) or física (4), date, 3-character homoclave.
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i

export function parsePaletteQuery(raw: string): PaletteQuery {
  const trimmed = raw.trim()
  const first = trimmed.charAt(0)
  const scope = PALETTE_PREFIXES[first] ?? 'all'
  const text = scope === 'all' ? trimmed : trimmed.slice(1).trim()
  let kind: PaletteQuery['kind'] = 'text'
  if (!text) kind = 'empty'
  else if (PHONE.test(text) && text.replace(/\D/g, '').length >= 7) kind = 'phone'
  else if (RFC.test(text.replace(/[\s-]/g, ''))) kind = 'rfc'
  return { raw, scope, text, kind }
}

/** Providers that answer a query, in the order their results should appear. */
export function providersFor(
  providers: readonly PaletteProvider[],
  query: PaletteQuery,
  firstForIdentity = 'contactos',
): PaletteProvider[] {
  // An unprefixed query reaches every provider; a prefix only those declaring its scope.
  const scoped = query.scope === 'all' ? providers.slice() : providers.filter((p) => p.scopes?.includes(query.scope))
  if (query.kind !== 'phone' && query.kind !== 'rfc') return scoped
  return scoped.slice().sort((a, b) => Number(b.key === firstForIdentity) - Number(a.key === firstForIdentity))
}

export interface ProviderState {
  key: string
  label: string
  status: 'loading' | 'slow' | 'done' | 'error'
  items: PaletteItem[]
}

export interface FederatedSearchOptions {
  signal: AbortSignal
  /** Called whenever any provider's state changes; the map keeps provider order. */
  onUpdate: (states: ProviderState[]) => void
  slowMs?: number
  perGroup?: number
}

/**
 * Run every provider in parallel. Each gets the shared abort signal, shows
 * `slow` («Buscando…») after 400 ms, is capped at five results per group, and
 * fails alone. Resolves when all settle; after abort, no further updates fire.
 */
export async function federatedSearch(
  providers: readonly PaletteProvider[],
  query: PaletteQuery,
  options: FederatedSearchOptions,
): Promise<ProviderState[]> {
  const { signal, onUpdate } = options
  const slowMs = options.slowMs ?? PALETTE_SLOW_MS
  const perGroup = options.perGroup ?? PALETTE_PER_GROUP
  const states: ProviderState[] = providers.map((p) => ({ key: p.key, label: p.label, status: 'loading', items: [] }))
  const emit = () => {
    if (!signal.aborted) onUpdate(states.map((s) => ({ ...s, items: s.items.slice() })))
  }
  emit()
  await Promise.all(
    providers.map(async (provider, index) => {
      const state = states[index] as ProviderState
      const timer = setTimeout(() => {
        if (state.status === 'loading') {
          state.status = 'slow'
          emit()
        }
      }, slowMs)
      try {
        const items = await provider.search(query, signal)
        const counts = new Map<PaletteGroup, number>()
        state.items = (Array.isArray(items) ? items : []).filter((item) => {
          const n = counts.get(item.group) ?? 0
          counts.set(item.group, n + 1)
          return n < perGroup
        }).map((item) => ({ ...item, source: provider.key }))
        state.status = 'done'
      } catch {
        state.items = []
        state.status = 'error'
      } finally {
        clearTimeout(timer)
      }
      emit()
    }),
  )
  return states
}

/** Flatten provider states into display groups, in group order then provider order. */
export function groupPaletteItems(states: readonly ProviderState[]): Array<{ group: PaletteGroup; items: PaletteItem[] }> {
  return PALETTE_GROUPS.map((group) => ({
    group,
    items: states.flatMap((s) => s.items.filter((item) => item.group === group)),
  })).filter((g) => g.items.length > 0)
}

/** Most-recent-first list of opened records, deduplicated, capped at eight. */
export function pushRecent(recent: readonly PaletteItem[], item: PaletteItem, limit = PALETTE_RECENT_LIMIT): PaletteItem[] {
  const key = (i: PaletteItem) => (i.ref ? `${i.ref.doctype}:${i.ref.name}` : i.href ?? `${i.source}:${i.id}`)
  const next = { ...item, group: 'recientes' as const }
  return [next, ...recent.filter((i) => key(i) !== key(next))].slice(0, limit)
}
