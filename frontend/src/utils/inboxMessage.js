// A conversation row's last line in the worker's words. Some providers store
// a system event as the message text in English (frappe_whatsapp writes
// «Flow completed» when a WhatsApp Flow returns no answers); that app is not
// ours to change, so the inbox names those events at render time.
const SYSTEM_EVENTS = {
  'Flow completed': 'Flow completed',
  'New Order Received via WhatsApp': 'New Order Received via WhatsApp',
  '[131052] Media file size too big': 'Media file too big to receive',
}

export function lastMessageText(text) {
  const raw = String(text || '').trim()
  const key = SYSTEM_EVENTS[raw]
  if (!key) return text || ''
  return globalThis.__ ? globalThis.__(key) : key
}
