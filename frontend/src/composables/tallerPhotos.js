import { errorText } from '@/utils/errorText'
import { call } from 'frappe-ui'

// «Fotos del taller»: the technician uploads an order's photos once in Taller;
// the seller sends them from the conversation already open with the customer.
// Taller lists them (conversation_photos) and keeps each photo to its own
// order's conversation; the send is the composer's ordinary WhatsApp reply.
// Only the photo sheet imports this; the handoff that opens it lives in inbox.js.
const PHOTOS =
  'taller.repair.repair_orders.conversation_photos.get_conversation_photos'
const SEND = 'crm.api.whatsapp.create_whatsapp_message'
export const MAX_PHOTOS = 10

export async function loadConversationPhotos(doctype, name) {
  const res = await call(PHOTOS, {
    reference_doctype: doctype,
    reference_name: name,
  })
  return Array.isArray(res?.orders) ? res.orders : []
}

// One media message per photo, in the order picked; the text rides the first.
// Stops at the first refusal: the rest stay picked so the seller can retry.
export async function sendTallerPhotos(
  { doctype, name, to, account, caption = '' },
  photos,
  onProgress = () => {},
) {
  const sent = []
  for (const [i, photo] of photos.entries()) {
    onProgress(i)
    try {
      await call(SEND, {
        reference_doctype: doctype,
        reference_name: name,
        message: i === 0 ? caption.trim() : '',
        to,
        attach: photo.attach,
        reply_to: '',
        content_type: 'image',
        canned: '',
        whatsapp_account: account || '',
      })
      sent.push(photo.name)
    } catch (error) {
      return {
        sent,
        failed: photo.name,
        error: errorText(error, __('No se pudo enviar la foto.')),
      }
    }
  }
  return { sent, failed: null, error: '' }
}
