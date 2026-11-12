import { createResource } from 'frappe-ui'
import { computed, ref } from 'vue'

// The site's one WhatsApp channel (frappe_whatsapp.channel.get_channel):
// 'api' sends through the connected account, 'manual' opens wa.me on the
// worker's device, 'off' hides WhatsApp. A surface renders its mode's action only.
// A reload starts from the mode this browser last saw on this site, so an open
// conversation asks for its messages at once instead of after two lookups
// (is_whatsapp_installed, then get_channel); the server's answer corrects it.
const MODE_KEY = 'muelle:whatsapp-mode'
const MODES = ['api', 'manual', 'off']
function rememberedMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY)
    return MODES.includes(mode) ? mode : null
  } catch {
    return null
  }
}
const lastMode = rememberedMode()
export const whatsappMode = ref(lastMode || 'off')
/** The mode is known: remembered from an earlier visit or answered by the server. */
export const whatsappModeKnown = ref(!!lastMode)
function setMode(mode) {
  whatsappMode.value = mode
  whatsappModeKnown.value = true
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* the next reload asks the server again */
  }
}
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
    setMode(MODES.includes(data?.mode) ? data.mode : 'off')
    whatsappShopNumber.value = data?.shop_number || ''
    whatsappSenderHint.value = data?.sender_hint || ''
  },
  // A frappe_whatsapp without the channel module: keep the API-only behaviour.
  onError: () => legacyEnabled.fetch(),
})

const legacyEnabled = createResource({
  url: 'crm.api.whatsapp.is_whatsapp_enabled',
  onSuccess: (data) => setMode(data ? 'api' : 'off'),
})

createResource({
  url: 'crm.api.whatsapp.is_whatsapp_installed',
  cache: 'Is Whatsapp Installed',
  auto: true,
  onSuccess: (data) => {
    isWhatsappInstalled.value = Boolean(data)
    if (isWhatsappInstalled.value) channel.fetch()
    else setMode('off')
  },
})
