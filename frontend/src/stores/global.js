import { defineStore } from 'pinia'
import { getCurrentInstance } from 'vue'
import { toast } from 'frappe-ui'

export const globalStore = defineStore('crm-global', () => {
  const app = getCurrentInstance()
  const { $dialog, $socket } = app.appContext.config.globalProperties

  // Set by the telephony UI (CallUI) when the shop has Twilio or Exotel. Without
  // one, «Llamar» used to do nothing at all (Deal 360's header, its context
  // pane and the phone hero): it dials through the device instead. A shop
  // with a line never dials around it: until CallUI is ready the worker is
  // told to try again.
  let callMethod = null

  function setMakeCall(value) {
    callMethod = value
  }

  async function makeCall(number) {
    if (callMethod) return callMethod(number)
    const { callEnabled, integrationsKnown } = await import(
      '@/composables/telephony'
    )
    await integrationsKnown
    if (callMethod) return callMethod(number)
    if (callEnabled.value) {
      toast.info(
        __(
          'La línea del negocio se está preparando. Intenta de nuevo en un momento.',
        ),
      )
      return
    }
    const digits = String(number || '').replace(/[^+\d]/g, '')
    if (digits) window.location.href = `tel:${digits}`
  }

  return {
    $dialog,
    $socket,
    makeCall,
    setMakeCall,
  }
})
