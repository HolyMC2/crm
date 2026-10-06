import { createResource } from 'frappe-ui'
import { computed, ref } from 'vue'

// The site's one WhatsApp channel (frappe_whatsapp.channel.get_channel):
// 'api' sends through the connected account, 'manual' opens wa.me on the
// worker's device, 'off' hides WhatsApp. A surface renders its mode's action only.
export const whatsappMode = ref('off')
export const whatsappShopNumber = ref('')
export const whatsappSenderHint = ref('')
// API sends (composer, templates, message history) exist only in 'api' mode.
export const whatsappEnabled = computed(() => whatsappMode.value === 'api')
export const whatsappManual = computed(() => whatsappMode.value === 'manual')
export const whatsappTabEnabled = computed(() => whatsappMode.value !== 'off')
export const isWhatsappInstalled = ref(false)

// Asked only once frappe_whatsapp is known to be installed: on sites without it the
// method does not exist and every page load would log a failed request.
const channel = createResource({
  url: 'frappe_whatsapp.channel.get_channel',
  method: 'GET',
  cache: 'WhatsApp Channel',
  onSuccess: (data) => {
    whatsappMode.value = data?.mode || 'off'
    whatsappShopNumber.value = data?.shop_number || ''
    whatsappSenderHint.value = data?.sender_hint || ''
  },
  // A frappe_whatsapp without the channel module: keep the API-only behaviour.
  onError: () => legacyEnabled.fetch(),
})

const legacyEnabled = createResource({
  url: 'crm.api.whatsapp.is_whatsapp_enabled',
  onSuccess: (data) => {
    whatsappMode.value = data ? 'api' : 'off'
  },
})

createResource({
  url: 'crm.api.whatsapp.is_whatsapp_installed',
  cache: 'Is Whatsapp Installed',
  auto: true,
  onSuccess: (data) => {
    isWhatsappInstalled.value = Boolean(data)
    if (isWhatsappInstalled.value) channel.fetch()
    else whatsappMode.value = 'off'
  },
})
