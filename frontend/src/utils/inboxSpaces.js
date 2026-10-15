// Inbox spaces: «Conversaciones», «Negocios y actividad» and «Por aprobar» (CRM-S3.4).
// Default space is «Negocios y actividad» (Marco 2026-09-15). The native conversation
// queue opens only when asked for (?workspace=conversations) or for a conversation deep
// link; the WhatsApp approval queue with ?workspace=review. Without the marketing add-on
// only the native conversations exist.
export function inboxSpace(query = {}, addon = true) {
  if (!addon) return 'conversations'
  if (query.workspace === 'review') return 'review'
  if (query.workspace === 'conversations') return 'conversations'
  if (!query.deal && typeof query.conversation === 'string')
    return 'conversations'
  return 'activity'
}

/** The query that opens `space`, keeping the rest (return_to…) and dropping deep links. */
export function inboxSpaceQuery(query = {}, space) {
  const next = { ...query, deal: undefined }
  next.workspace =
    space === 'conversations' || space === 'review' ? space : undefined
  next.conversation = space === 'conversations' ? query.conversation : undefined
  return next
}
