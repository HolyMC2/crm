// The sheet's file rules, kept pure so the composer and its tests read the same
// answers. The accept list is the Desk's receipt picker (assistant_bubble.js,
// PICK_ACCEPT): photos, PDFs and the XML of a CFDI invoice.
export const ASSISTANT_FILE_ACCEPT =
  'image/*,application/pdf,.pdf,text/xml,application/xml,.xml'

export function isImageFile(file) {
  return String(file?.type || '').startsWith('image/')
}

/** «340 KB», «2.4 MB»: the size a person can match against the file on their phone. */
export function fileSizeText(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** A message goes with a note, a file, or both; an empty note with no file does not go. */
export function canSendDraft(draft, file) {
  return Boolean(String(draft || '').trim() || file)
}
