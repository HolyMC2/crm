// Quick-entry adapter registry (F3). Doctypes listed here render their quick
// entry through DocoFormRenderer (descriptor from doco.forms.api) instead of
// the upstream FieldLayout path. EMPTY on purpose: the measured upstream
// call-site diff lands together with the first registered doctype, once its
// descriptor form reaches parity — infra first, swap per-form later
// (boat/docs/forms/04-ADOPTION.md, F3).
export const DOCO_QUICK_ENTRY_DOCTYPES = new Set([])

export function hasDocoQuickEntry(doctype) {
  return DOCO_QUICK_ENTRY_DOCTYPES.has(doctype)
}

export async function fetchDescriptor(call, doctype, variant, mode = 'create') {
  // `call` = frappe-ui call/createResource fetcher injected by the caller so
  // this module stays framework-light. null → caller keeps its legacy markup.
  try {
    const d = await call('doco.forms.api.get_descriptor', {
      doctype,
      surface: 'crm',
      variant,
      mode,
    })
    if (d?.contract !== 'muelle-forms/1' || !Array.isArray(d.sections)) return null
    return d
  } catch {
    return null
  }
}
