// Small purchase words shared by the profiles and the richer pages (D3).

// ERPNext's English auto-titles of a Material Request («Purchase Request for …»).
const MR_PREFIX =
  /^(purchase request|material transfer|material issue|manufacture|customer provided|request)\s+for\s+/i

/** A requisition's title in words: what it asks for, without ERPNext's English prefix. */
export function requestTitle(title) {
  return String(title || '')
    .trim()
    .replace(MR_PREFIX, '')
    .trim()
}
