import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { archivosApi, archivosHref, problem } from '@/composables/useArchivos'

// «Guardar en Archivos» / «Vincular a…» on conversation attachments (ARC-S2.3).
// Pure helpers live here so WhatsAppArea, EmailArea and MessengerArea (via
// ConversationWorkspace) share the same save/link/saved-state logic and tests
// exercise it without mounting a component.

const CHANNELS_SERVICE = 'doco.docoutils.documents.channels'

/** `save_attachment` args for a WhatsApp Message attachment (by file_url). */
export function whatsappSaveArgs(message, company) {
  const args = {
    source_doctype: 'WhatsApp Message',
    source_name: message?.name,
    file_url: message?.attach,
  }
  if (company) args.company = company
  return args
}

/** `save_attachment` args for an email (Communication) attachment (by File docname). */
export function emailSaveArgs(activity, attachment, company) {
  const args = {
    source_doctype: 'Communication',
    source_name: activity?.name,
    file: attachment?.name,
  }
  if (company) args.company = company
  return args
}

/** Whether a WhatsApp message is a media attachment eligible for the actions. */
export function isWhatsappAttachment(message) {
  return (
    !!message?.attach &&
    ['image', 'document', 'audio', 'video'].includes(message?.content_type)
  )
}

/** Whether a unified-inbox message is a WhatsApp Message the server can save
 * («Guardar en Archivos» only works for a true WhatsApp Message name; a
 * Webchat or Messenger row's `id` is a different doctype's name). */
export function isWhatsappInboxMessage(message, conversation) {
  return (
    conversation?.provider === 'WhatsApp' &&
    !!message?.attach &&
    ['image', 'document', 'audio', 'video'].includes(message?.content_type)
  )
}

/** Collect the attach URLs worth asking `saved_attachments` about, deduped. */
export function collectFileUrls(messages, pick = isWhatsappAttachment) {
  const seen = new Set()
  for (const m of messages || []) if (pick(m)) seen.add(m.attach)
  return [...seen]
}

/** Collect the File docnames (email attachments) worth asking about, deduped. */
export function collectFileNames(attachments) {
  const seen = new Set()
  for (const a of attachments || []) if (a?.name) seen.add(a.name)
  return [...seen]
}

/** `saved_attachments` args: only the keys the server accepts, only when non-empty. */
export function savedAttachmentsArgs({ fileUrls = [], files = [] } = {}) {
  const args = {}
  if (fileUrls.length) args.file_urls = JSON.stringify(fileUrls)
  if (files.length) args.files = JSON.stringify(files)
  return args
}

/** Map the server's `{<key>: <Doco Document name>}` into the reactive saved-state map. */
export function mergeSavedMap(target, result) {
  for (const [key, document] of Object.entries(result || {}))
    if (document) target[key] = document
  return target
}

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message
}

/**
 * One composable instance per conversation/thread area. `saved` is a reactive
 * map keyed by file_url (WhatsApp/Messenger) or File name (email) → Doco
 * Document name, so a save updates every bubble's badge immediately.
 */
export function useConversationArchivos() {
  const saved = reactive({})
  const busy = reactive({})
  let refreshTimer = null

  function isSaved(key) {
    return !!saved[key]
  }

  function isBusy(key) {
    return !!busy[key]
  }

  /** Batch-check which of these attachments are already filed. Debounced: call
   * on every messages-changed tick; only the last call in a 300ms window runs. */
  function refreshSaved(collect) {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(async () => {
      const args = savedAttachmentsArgs(collect())
      if (!args.file_urls && !args.files) return
      try {
        const result = await archivosApi(
          `${CHANNELS_SERVICE}.saved_attachments`,
          args,
        )
        mergeSavedMap(saved, result)
      } catch {
        // Silent: the badge simply does not show yet; saving still works.
      }
    }, 300)
  }

  /** Save one attachment. `key` is the file_url or File name used for the
   * saved-state map. Returns the Doco Document name, or null on failure
   * (after showing the server's reason). */
  async function save(key, args, { successToast = true } = {}) {
    if (busy[key]) return saved[key] || null
    busy[key] = true
    try {
      const result = await archivosApi(
        `${CHANNELS_SERVICE}.save_attachment`,
        args,
      )
      saved[key] = result?.document
      if (successToast) toast.success(tr('Saved to Files'))
      return result?.document || null
    } catch (error) {
      const found = problem(error)
      toast.error(found.message)
      return null
    } finally {
      busy[key] = false
    }
  }

  /** Save (idempotent) then build the Archivos «Vincular a…» URL and navigate. */
  async function linkTo(key, args, { target, returnLabel } = {}) {
    const document = await save(key, args, { successToast: false })
    if (!document) return false
    const returnTo =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : ''
    window.location.href = archivosHref({
      document,
      target,
      returnTo,
      returnLabel,
    })
    return true
  }

  return { saved, isSaved, isBusy, refreshSaved, save, linkTo }
}
