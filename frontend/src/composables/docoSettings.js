import { createResource } from 'frappe-ui'

const settings = createResource({
  url: 'doco.doco.api.get_settings',
  cache: 'doco-settings',
  auto: true,
})

export function useDocoSettings() {
  return { settings }
}
