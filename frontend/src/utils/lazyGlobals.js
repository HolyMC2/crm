import { defineAsyncComponent } from 'vue'

// Globally registered frappe-ui widgets the first screen does not render.
// Each loads on first use (and is warmed at idle by prefetchGlobals), keeping
// FormControl's date/time pickers, comboboxes and their reka-ui primitives
// out of the entry chunk.
const loaders = {
  TextInput: () => import('frappe-ui-components/TextInput/TextInput.vue'),
  Input: () => import('frappe-ui-components/Input.vue'),
  FormControl: () => import('frappe-ui-components/FormControl/FormControl.vue'),
  ErrorMessage: () =>
    import('frappe-ui-components/ErrorMessage/ErrorMessage.vue'),
  Dialog: () => import('frappe-ui-components/Dialog/Dialog.vue'),
  Alert: () => import('frappe-ui-components/Alert/Alert.vue'),
  Badge: () => import('frappe-ui-components/Badge/Badge.vue'),
  FeatherIcon: () => import('frappe-ui-components/FeatherIcon.vue'),
}

export const lazyGlobalComponents = Object.fromEntries(
  Object.entries(loaders).map(([name, loader]) => [
    name,
    defineAsyncComponent(loader),
  ]),
)

export function prefetchGlobals() {
  for (const loader of Object.values(loaders)) loader().catch(() => {})
}
