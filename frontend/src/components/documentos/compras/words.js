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

/**
 * A requisition's title short enough for a line: without the English prefix and,
 * when ERPNext joined several items («A, B, C, D…» cut at 140), the first and «y más».
 */
export function requestShort(title) {
  const text = requestTitle(title)
  // Only ERPNext's own joined title is cut; the chain's «A y 18 más» stays as is.
  if (!MR_PREFIX.test(String(title || '').trim())) return text
  const parts = text.split(/,\s+/)
  return parts.length > 1 ? `${parts[0]} y más` : text
}
