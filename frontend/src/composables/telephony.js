import { createResource } from 'frappe-ui'
import { computed, ref } from 'vue'

const integrations = ref({})
export const defaultCallingMedium = ref('')
export const callEnabled = ref(false)
// Settles once the shop's phone integrations are known (or the read failed):
// «Llamar» waits for it before falling back to the device's dialler.
let settle
export const integrationsKnown = new Promise((resolve) => (settle = resolve))

createResource({
  url: 'crm.integrations.api.is_call_integration_enabled',
  cache: 'Is Call Integration Enabled',
  auto: true,
  onSuccess: (data) => {
    integrations.value = data.integrations || {}
    defaultCallingMedium.value = data.default_calling_medium
    callEnabled.value = Object.values(integrations.value).some(Boolean)
    settle()
  },
  onError: () => settle(),
})

export function setEnabled(name, value) {
  integrations.value[name] = value
  callEnabled.value = Object.values(integrations.value).some(Boolean)
}

export function useTelephony() {
  const allIntegrations = computed(() =>
    Object.entries(integrations.value).map(([name, enabled]) => ({
      name,
      enabled,
    })),
  )

  function isEnabled(name) {
    return Boolean(integrations.value[name])
  }

  const isAnyEnabled = computed(() =>
    Object.values(integrations.value).some(Boolean),
  )

  return { integrations: allIntegrations, isEnabled, isAnyEnabled }
}
