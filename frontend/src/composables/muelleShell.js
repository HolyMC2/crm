import { computed, ref } from 'vue'
import { call } from 'frappe-ui'

export const shellBoot = ref(null)
export const shellError = ref('')
export const shellLoading = ref(false)
let pending
let scope
export function loadShell({ refresh = false } = {}) {
  const key = `${window.site_name || location.host}:${document.cookie.split('; ').find((x) => x.startsWith('user_id=')) || ''}`
  if (key !== scope) {
    shellBoot.value = null
    scope = key
  }
  if (shellBoot.value && !refresh) return Promise.resolve(shellBoot.value)
  if (pending) return pending
  shellLoading.value = true
  shellError.value = ''
  pending = call('crm.api.contactos.get_capabilities')
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
// Future modules register in this one shell; only delivered, authorized modules launch.
export const shellModules = computed(() =>
  [
    {
      key: 'contactos',
      label: 'Contactos',
      icon: 'users',
      to: '/contactos',
      enabled: Boolean(shellBoot.value?.capabilities?.directory),
    },
    {
      key: 'ventas',
      label: 'Ventas',
      icon: 'briefcase',
      to: '/',
      enabled: Boolean(shellBoot.value?.sales_access),
    },
  ].filter((module) => module.enabled),
)
