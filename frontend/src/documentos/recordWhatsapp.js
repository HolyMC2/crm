// A record's WhatsApp icon (DocumentoRecord, the Resultados ticket): the
// server's record_whatsapp decides. Manual mode: the composer with the shop's
// texts and a logged intent. Official account: this document's PDF through the
// send sheet (doco's «Enviar por WhatsApp»), else the customer's thread in the
// Bandeja. The page renders ChannelComposer and the send sheet on these flags.
import { ref } from 'vue'
import { call, toast } from 'frappe-ui'
import { errorText } from '@/documentos/api'

/**
 * Getters: `doctype`, `name`, `phone` (header.reach.phone), `title` (whose
 * record, the Bandeja's way back) and `returnTo` (this page's path).
 */
export function useRecordWhatsapp({
  doctype,
  name,
  phone,
  title,
  returnTo,
  router,
}) {
  const composerOpen = ref(false)
  const sendSheet = ref(false)
  const sendOpen = ref(false)
  let asking = false

  async function open() {
    if (asking) return
    asking = true
    try {
      const next = await call('crm.api.whatsapp_channel.record_whatsapp', {
        doctype: doctype(),
        name: name(),
        phone: phone() || '',
      })
      if (next?.action === 'composer') composerOpen.value = true
      else if (next?.action === 'send') {
        sendSheet.value = true
        sendOpen.value = true
      } else if (next?.action === 'thread')
        router.push({
          name: 'Inbox',
          query: {
            deal: next.name,
            doctype: next.doctype,
            return_to: returnTo(),
            return_label: title() || undefined,
          },
        })
      else if (next?.action === 'conversation')
        router.push({
          name: 'Inbox',
          query: { workspace: 'conversations', conversation: next.name },
        })
      else toast.error(next?.message || 'No se puede abrir WhatsApp aquí.')
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      asking = false
    }
  }

  return { composerOpen, sendSheet, sendOpen, open }
}
