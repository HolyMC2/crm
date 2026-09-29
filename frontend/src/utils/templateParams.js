// WhatsApp template variables on campaign steps. A send_whatsapp step maps its
// template's {{1}},{{2}}… to context keys served by
// doco_marketing.api.campaigns.template_variables (template_params, comma-separated,
// placeholder order). The server validates the same rule at activation.

// Distinct {{n}} placeholders in a template body (a repeated {{1}} counts once).
export function templateVarCount(body) {
  const nums = String(body || '').match(/\{\{\s*\d+\s*\}\}/g) || []
  return new Set(nums.map((t) => t.replace(/\D/g, ''))).size
}

export function parseParams(raw) {
  return String(raw || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

// Why a mapping does not fit, as { unknown: [...] } or { need, have }; null when it fits.
export function paramsProblem(body, raw, knownKeys) {
  const keys = parseParams(raw)
  const known = new Set(knownKeys || [])
  const unknown = known.size ? keys.filter((k) => !known.has(k)) : []
  if (unknown.length) return { unknown }
  const need = templateVarCount(body)
  if (keys.length !== need) return { need, have: keys.length }
  return null
}
