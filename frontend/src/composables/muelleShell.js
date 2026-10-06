import { computed, ref } from 'vue'
import { call } from 'frappe-ui'
import {
  SHELL_MODULES,
  bootScope,
  mobileSlots,
  moduleEnabled,
  moduleForPath,
  railModules,
} from '@/vendor/muelle-shell/contracts'

// One boot call (crm.api.shell.boot → ShellBoot) for every shell route; the
// cache never crosses site or user.
export const shellBoot = ref(null)
export const shellError = ref('')
export const shellLoading = ref(false)
let pending
let scope

function currentScope() {
  const cookieUser =
    document.cookie
      .split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || ''
  return bootScope(
    window.site_name || location.host,
    decodeURIComponent(cookieUser),
  )
}

export function loadShell({ refresh = false } = {}) {
  const key = currentScope()
  if (key !== scope) {
    shellBoot.value = null
    scope = key
  }
  if (shellBoot.value && !refresh) return Promise.resolve(shellBoot.value)
  if (pending) return pending
  shellLoading.value = true
  shellError.value = ''
  pending = call('crm.api.shell.boot')
    .then((data) => {
      if (scope === key) shellBoot.value = data
      return data
    })
    .catch((error) => {
      shellError.value =
        error.messages?.[0] ||
        error.message ||
        'No pudimos cargar tus permisos. Reintenta o pide acceso al encargado.'
      throw error
    })
    .finally(() => {
      pending = null
      shellLoading.value = false
    })
  return pending
}

// Modules this frontend hosts, in contracts order. Each adds its key here and
// its routes in router.js; the boot decides whether it is enabled.
const HOSTED = [
  'pendientes',
  'contactos',
  'ventas',
  'compras',
  'archivos',
  'avisos',
]
const ROUTE_HOME = { contactos: '/contactos', ventas: '/ventas' }

export const hostedModules = SHELL_MODULES.filter((meta) =>
  HOSTED.includes(meta.key),
).map((meta) => ({ ...meta, to: ROUTE_HOME[meta.key] || meta.basePath }))

export const shellModules = computed(() =>
  railModules(hostedModules, (module) =>
    moduleEnabled(shellBoot.value, module.key),
  ),
)

/**
 * Shell modules other than Ventas boot without the CRM runtime (sales stores,
 * Ventas chrome): their routes carry meta.app, a hard refresh window.muelle_module.
 */
export function isNeutralModule(key) {
  return key !== 'ventas' && SHELL_MODULES.some((meta) => meta.key === key)
}

/**
 * Where a worker keeps working: the first hosted module (contracts order) the
 * boot enables, other than `except`; null when there is none.
 */
export function firstModuleRoute(boot, except = null) {
  const module = hostedModules.find(
    (meta) => meta.key !== except && moduleEnabled(boot, meta.key),
  )
  return module ? { key: module.key, label: module.label, to: module.to } : null
}

/** The module owning a route: its meta.app or path, every other CRM page is Ventas. */
export function moduleKeyFor(route) {
  if (route?.meta?.app) return route.meta.app
  return moduleForPath(route?.path || '', hostedModules)?.key || 'ventas'
}

export const navSlots = computed(() => {
  const enabled = shellModules.value.map((module) => module.key)
  return mobileSlots(
    shellBoot.value?.user?.nav_role,
    enabled,
    shellBoot.value?.mobile_slots,
  )
    .map((key) => shellModules.value.find((module) => module.key === key))
    .filter(Boolean)
})

export async function saveNavSlots(keys) {
  const saved = await call('crm.api.shell.save_mobile_slots', {
    slots: JSON.stringify(keys),
  })
  if (shellBoot.value)
    shellBoot.value = { ...shellBoot.value, mobile_slots: saved }
  return saved
}

// The settings modal lives in the Ventas runtime: enter Ventas first when the
// worker opens it from another module (desktop account menu or phone Más).
export async function openSalesSettings(router) {
  if (moduleKeyFor(router.currentRoute.value) !== 'ventas')
    await router.push('/ventas')
  // Lazy: a static import pulls the settings chunk into the entry bundle.
  const { showSettings } = await import('@/composables/settings')
  showSettings.value = true
}
