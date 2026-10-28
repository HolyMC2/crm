// «Archivos, enlaces y docs» of a conversation, the WhatsApp contact-info view:
// photos and videos, documents, and the links anyone wrote, newest first.
// Built from the thread's WhatsApp messages plus the files attached to the
// record, so it needs no endpoint of its own.
import { computed, watch } from 'vue'
import { createResource, getCachedResource } from 'frappe-ui'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|avif|bmp)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|3gp|m4v)$/i
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

function ext(name) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '').split('?')[0])
  return m ? m[1].toUpperCase() : ''
}

function fileName(url) {
  const last = String(url || '')
    .split('?')[0]
    .split('/')
    .pop()
  try {
    return decodeURIComponent(last || '')
  } catch {
    return last || ''
  }
}

/** Every http(s) link in a text, without the punctuation that ends a sentence. */
export function linksIn(text) {
  return (String(text || '').match(URL_RE) || []).map((url) =>
    url.replace(/[).,;:!?»”'"]+$/u, ''),
  )
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Split a thread and the record's files into the three tabs.
 * messages: WhatsApp Message rows ({ name, content_type, attach, message, creation, type })
 * files: File rows ({ name, file_url, file_name, file_size, creation })
 */
export function splitConversationMedia(messages = [], files = []) {
  const media = []
  const docs = []
  const links = []
  const seen = new Set()
  for (const m of messages || []) {
    if (!m) continue
    const at = m.creation || ''
    const kind = m.content_type
    if (m.attach && (kind === 'image' || kind === 'video')) {
      seen.add(m.attach)
      media.push({
        key: m.name,
        url: m.attach,
        kind,
        at,
        mine: m.type === 'Outgoing',
      })
    } else if (m.attach && kind === 'document') {
      seen.add(m.attach)
      const name = fileName(m.attach)
      docs.push({ key: m.name, url: m.attach, name, ext: ext(name), at })
    }
    if (kind === 'text' || kind === 'image' || kind === 'video') {
      for (const url of linksIn(m.message)) {
        links.push({
          key: `${m.name}:${url}`,
          url,
          host: host(url),
          text: m.message,
          at,
        })
      }
    }
  }
  for (const f of files || []) {
    if (!f?.file_url || seen.has(f.file_url)) continue
    const name = f.file_name || fileName(f.file_url)
    const at = f.creation || f.modified || ''
    if (IMAGE_EXT.test(name) || VIDEO_EXT.test(name)) {
      const kind = VIDEO_EXT.test(name) ? 'video' : 'image'
      media.push({ key: f.name, url: f.file_url, kind, at })
    } else {
      docs.push({
        key: f.name,
        url: f.file_url,
        name,
        ext: ext(name),
        size: f.file_size,
        at,
      })
    }
  }
  const newest = (a, b) => String(b.at).localeCompare(String(a.at))
  return {
    media: media.sort(newest),
    docs: docs.sort(newest),
    links: links.sort(newest),
  }
}

/**
 * The media of one conversation. Reuses the thread's messages when the chat
 * already loaded them (cache key of Activities), else fetches its own copy:
 * sharing the key would hand the thread this resource's options.
 */
export function useConversationMedia(doctype, name) {
  const threadKey = () => ['whatsapp_messages', doctype.value, name.value]
  const own = createResource({ url: 'crm.api.whatsapp.get_whatsapp_messages' })
  const files = createResource({
    url: 'crm.api.activities.get_activities',
    transform: (data) => (Array.isArray(data) ? data[4] || [] : []),
  })
  function load() {
    if (!doctype.value || !name.value) return
    if (!getCachedResource(threadKey())?.data) {
      own.submit({
        reference_doctype: doctype.value,
        reference_name: name.value,
      })
    }
    files.submit({ doctype: doctype.value, name: name.value })
  }
  watch([doctype, name], load, { immediate: true })
  const messages = computed(
    () => getCachedResource(threadKey())?.data || own.data || [],
  )
  const split = computed(() =>
    splitConversationMedia(messages.value, files.data || []),
  )
  const loading = computed(() => own.loading || files.loading)
  return { split, loading, reload: load }
}
