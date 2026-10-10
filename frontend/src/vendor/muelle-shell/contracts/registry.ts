// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Module registry types and the shell's fixed module catalog (spec §1.1, §2.1, §4.7).
// Framework-agnostic: the crm shell instantiates `ShellModule<RouteRecordRaw, …>`.
import type { PaletteProvider } from './palette'

export type ShellModuleKey =
  | 'hoy'
  | 'contactos'
  | 'pendientes'
  | 'agenda'
  | 'archivos'
  | 'compras'
  | 'ventas'
  | 'cobranza'
  | 'gastos'
  | 'productos'
  | 'garantias'
  | 'equipo'
  | 'avisos'

export type LucideIcon = `lucide-${string}`

export interface ShellModuleMeta {
  key: ShellModuleKey
  /** es-MX product noun, never translated (§4.8). */
  label: string
  icon: LucideIcon
  /** Path under the router base (`/crm`). */
  basePath: string
  /** Second key of the `g` sequence (§3.3). */
  go: string
}

/** Rail order: Hoy, Pendientes, Agenda, Contactos, Ventas, Cobranza, Compras, Gastos, Productos, Garantías, Equipo, Archivos; Avisos pinned last. */
export const SHELL_MODULES: readonly ShellModuleMeta[] = Object.freeze([
  { key: 'hoy', label: 'Hoy', icon: 'lucide-sun', basePath: '/hoy', go: 'h' },
  { key: 'pendientes', label: 'Pendientes', icon: 'lucide-square-check-big', basePath: '/pendientes', go: 'p' },
  { key: 'agenda', label: 'Agenda', icon: 'lucide-calendar-days', basePath: '/agenda', go: 'a' },
  { key: 'contactos', label: 'Contactos', icon: 'lucide-users', basePath: '/contactos', go: 'c' },
  { key: 'ventas', label: 'Ventas', icon: 'lucide-handshake', basePath: '/ventas', go: 'v' },
  { key: 'cobranza', label: 'Cobranza', icon: 'lucide-hand-coins', basePath: '/cobranza', go: 'b' },
  { key: 'compras', label: 'Compras', icon: 'lucide-shopping-cart', basePath: '/compras', go: 'o' },
  { key: 'gastos', label: 'Gastos', icon: 'lucide-receipt', basePath: '/gastos', go: 'e' },
  { key: 'productos', label: 'Productos', icon: 'lucide-package', basePath: '/productos', go: 'i' },
  { key: 'garantias', label: 'Garantías', icon: 'lucide-shield-check', basePath: '/garantias', go: 'r' },
  { key: 'equipo', label: 'Equipo', icon: 'lucide-id-card', basePath: '/equipo', go: 'q' },
  { key: 'archivos', label: 'Archivos', icon: 'lucide-folder', basePath: '/archivos', go: 'f' },
  { key: 'avisos', label: 'Avisos', icon: 'lucide-bell', basePath: '/avisos', go: '' },
] as const satisfies readonly ShellModuleMeta[])

export const SHELL_MODULE_KEYS: readonly ShellModuleKey[] = SHELL_MODULES.map((m) => m.key)

export function moduleMeta(key: ShellModuleKey): ShellModuleMeta {
  return SHELL_MODULES.find((m) => m.key === key) as ShellModuleMeta
}

export interface ShellModuleBadge {
  /** Badge source key the boot/badge endpoint reports counts for. */
  source: string
  tone: 'count' | 'dot'
  /** Accessible label, e.g. «Pendientes vencidos». */
  label: string
}

/** One registry entry. `TRoute` is the router's record type, `TSection` the sidebar section type. */
export interface ShellModule<TRoute = unknown, TBoot = unknown, TSection = unknown> extends ShellModuleMeta {
  /** Boot capability key: `boot.modules[capability].enabled`. Usually the module key. */
  capability: string
  /** Lazy route records only. */
  routes: TRoute[]
  sidebar?: (boot: TBoot) => TSection[]
  palette?: PaletteProvider
  badge?: ShellModuleBadge
  /** Preferred bottom-nav priority (lower = earlier). */
  mobileSlot?: number
}

const ORDER = new Map(SHELL_MODULE_KEYS.map((key, index) => [key, index]))

/** Registry order with Avisos last, keeping only modules `enabled` admits. Disabled modules are absent. */
export function railModules<M extends Pick<ShellModuleMeta, 'key'>>(modules: readonly M[], enabled: (module: M) => boolean): M[] {
  return modules
    .filter(enabled)
    .slice()
    .sort((a, b) => (ORDER.get(a.key) ?? 99) - (ORDER.get(b.key) ?? 99))
}

/** The module owning a path under the router base (`/contactos/contact/X` → contactos). */
export function moduleForPath<M extends Pick<ShellModuleMeta, 'basePath'>>(path: string, modules: readonly M[]): M | null {
  const clean = path.split(/[?#]/)[0] ?? ''
  let best: M | null = null
  for (const module of modules) {
    if (clean === module.basePath || clean.startsWith(module.basePath + '/')) {
      if (!best || module.basePath.length > best.basePath.length) best = module
    }
  }
  return best
}

/** Puesto classes for the phone bottom nav (§2.1). S1 maps Doco puesto keys onto these. */
export type NavRole = 'vendedor' | 'recepcion' | 'compras' | 'dueno' | 'fallback'

export const MOBILE_SLOT_DEFAULTS: Readonly<Record<NavRole, readonly ShellModuleKey[]>> = Object.freeze({
  vendedor: ['pendientes', 'contactos', 'ventas'],
  recepcion: ['agenda', 'contactos', 'pendientes'],
  compras: ['compras', 'pendientes', 'contactos'],
  dueno: ['pendientes', 'ventas', 'contactos'],
  fallback: ['pendientes', 'agenda', 'contactos'],
})

export const MOBILE_SLOTS = 4

/**
 * Bottom-nav slots (Más is extra): Hoy first, then the user's saved order,
 * else the role defaults, then registry order — enabled modules only, Avisos
 * never (it is the header bell), no duplicates, at most four.
 */
export function mobileSlots(
  role: NavRole | null | undefined,
  enabled: readonly ShellModuleKey[],
  override?: readonly string[] | null,
): ShellModuleKey[] {
  const allowed = new Set<ShellModuleKey>(enabled.filter((key) => key !== 'avisos'))
  const out: ShellModuleKey[] = []
  const add = (key: string) => {
    if (out.length < MOBILE_SLOTS && allowed.has(key as ShellModuleKey) && !out.includes(key as ShellModuleKey))
      out.push(key as ShellModuleKey)
  }
  add('hoy')
  const preferred = override && override.length ? override : MOBILE_SLOT_DEFAULTS[role ?? 'fallback'] ?? MOBILE_SLOT_DEFAULTS.fallback
  preferred.forEach(add)
  SHELL_MODULE_KEYS.forEach(add)
  return out
}

export type SiblingAppKey = 'pos' | 'taller' | 'clinica' | 'mercado' | 'scan'

export interface SiblingApp {
  key: SiblingAppKey
  label: string
  icon: LucideIcon
  /** Entry path; also its return-protocol prefix. */
  path: string
}

/** Sibling SPAs shown under «Otras apps» in Más, gated by installed app and capability. */
export const SIBLING_APPS: readonly SiblingApp[] = Object.freeze([
  { key: 'pos', label: 'POS', icon: 'lucide-receipt', path: '/posapp/' },
  { key: 'taller', label: 'Taller', icon: 'lucide-wrench', path: '/taller/' },
  { key: 'clinica', label: 'Clínica', icon: 'lucide-stethoscope', path: '/clinica/' },
  { key: 'mercado', label: 'Mercado', icon: 'lucide-store', path: '/mercado/' },
  { key: 'scan', label: 'Escáner', icon: 'lucide-scan-barcode', path: '/scan/' },
] as const satisfies readonly SiblingApp[])
