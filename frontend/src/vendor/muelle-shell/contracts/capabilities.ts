// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Capability flags and the boot payload (spec §7). Providers compute flags from
// native permissions and never grant anything; module flags gate presence in
// the rail, nav, palette and Hoy, action flags gate buttons, and the server
// rechecks every request.
import type { GuardAction, GuardDTO } from './guard'
import { sanitizeGuard } from './guard'
import { format, type Translate } from './messages'
import { moduleMeta, type ShellModuleKey } from './registry'

export type CapabilityAction = 'read' | 'create' | 'write' | 'delete' | 'export' | (string & {})

/** One module provider's answer (`muelle_shell_modules` hook). */
export interface CapabilityDTO {
  key: string
  enabled: boolean
  /** Why it is disabled, as one plain sentence. */
  reason?: string
  /** How to resolve a disabled module (request access, open setup, …). */
  resolve?: GuardAction[]
  capabilities: Partial<Record<CapabilityAction, boolean>>
  badge?: { count?: number; dot?: boolean }
}

export type ShellTheme = 'light' | 'dark' | 'system'
export type ShellDensity = 'comfortable' | 'compact'

/** The resolved palette Doco's `erp_experience.appearance.resolve()` returns. */
export interface ShellPalette {
  accent: string
  accent_light?: string
  accent_light_ink?: string
  accent_dark?: string
  accent_dark_ink?: string
  tone?: string
  density?: string
  adjusted?: boolean
}

export interface ShellBoot {
  user: { name: string; full_name?: string; image?: string | null; puesto?: string | null }
  company?: string | null
  companies?: string[]
  locale: string
  time_zone: string
  currency: string
  theme?: ShellTheme
  density?: ShellDensity
  palette?: ShellPalette
  /** Front-door landing path for this user. */
  landing?: string
  mobile_slots?: string[]
  /** Running build id, compared by the bundle watcher. */
  build?: string
  modules: Partial<Record<string, CapabilityDTO>>
}

/** Light theme is the v1 default (Q3); the user's choice wins. */
export const DEFAULT_THEME: ShellTheme = 'light'

export function moduleEnabled(boot: Pick<ShellBoot, 'modules'> | null | undefined, capability: string): boolean {
  return boot?.modules?.[capability]?.enabled === true
}

/** True only when the module is enabled and its provider granted `action`. */
export function can(boot: Pick<ShellBoot, 'modules'> | null | undefined, capability: string, action: CapabilityAction): boolean {
  const dto = boot?.modules?.[capability]
  return dto?.enabled === true && dto.capabilities?.[action] === true
}

/** Show the company switch only to users who can read two or more Companies. */
export function showsCompanySwitch(boot: Pick<ShellBoot, 'companies'> | null | undefined): boolean {
  return (boot?.companies?.length ?? 0) >= 2
}

/**
 * The guard a deep link into a disabled or unknown module renders, never a
 * blank page or a silent redirect: the provider's reason and resolve actions,
 * else «Pedir acceso» plus «Ir a Hoy».
 */
export function moduleGuard(
  boot: Pick<ShellBoot, 'modules'> | null | undefined,
  key: ShellModuleKey,
  options: { t?: Translate; home?: string } = {},
): GuardDTO | null {
  const t = options.t ?? format
  const dto = boot?.modules?.[key]
  if (dto?.enabled) return null
  const label = moduleMeta(key).label
  const actions: GuardAction[] = dto?.resolve?.length
    ? dto.resolve
    : [{ label: t('Request access'), kind: 'request_access', target: key }]
  if (key !== 'hoy' && !actions.some((a) => a.kind === 'route'))
    actions.push({ label: t('Go to Hoy'), kind: 'route', target: options.home ?? '/crm/hoy' })
  return sanitizeGuard(
    {
      code: 'module_unavailable',
      message: dto?.reason || t('{0} is not available for your role.', [label]),
      helper: t('Ask a manager for access, or go back to Hoy.'),
      actions,
      retry_context: { module: key },
    },
    { t },
  )
}

/** Boot cache scope (§7): data never crosses site, user or company. */
export function bootScope(site: string, user: string, company?: string | null): string {
  return [site, user, company ?? ''].map((part) => encodeURIComponent(part)).join(':')
}
