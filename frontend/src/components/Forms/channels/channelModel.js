// Pure view logic for the form channel sections (tests/unit/formChannels.test.js).

// The WhatsApp Flow block from get_channels → what the Share panel shows.
// step: 'unavailable' (no WhatsApp API) | 'none' (not built) | 'draft' (built,
// not on WhatsApp yet) | 'outdated' (the form changed since it was built) |
// 'published' | 'other' (a Meta status such as Blocked/Deprecated)
export function flowView(whatsapp) {
  const mode = whatsapp?.mode || 'off'
  const flow = whatsapp?.flow || null
  const unsupported = flow?.unsupported || []
  const blocking = unsupported.filter((u) => u.required)
  const base = { mode, flow, unsupported, blocking }
  if (mode !== 'api')
    return {
      ...base,
      step: 'unavailable',
      canBuild: !!flow || mode !== 'off',
      canPublish: false,
    }
  if (!flow) return { ...base, step: 'none', canBuild: true, canPublish: false }
  const status = flow.status || 'Draft'
  if (flow.out_of_date)
    return {
      ...base,
      step: 'outdated',
      canBuild: true,
      canPublish: false,
    }
  if (status === 'Published')
    return { ...base, step: 'published', canBuild: true, canPublish: false }
  if (status === 'Draft')
    return {
      ...base,
      step: 'draft',
      canBuild: true,
      canPublish: blocking.length === 0,
    }
  return { ...base, step: 'other', canBuild: true, canPublish: false }
}

// Email readiness → whether the email options can be used and what to say.
export function mailView(mail) {
  const readiness = mail?.readiness || {}
  return {
    ready: !!readiness.ready,
    sender: readiness.sender || '',
    hint: readiness.fix_hint || '',
    reason: readiness.reason || '',
  }
}

// WhatsApp confirmation: why the chosen setup cannot send yet (first reason), or ''.
export function followupProblem({
  mode,
  template,
  templates,
  consentEnabled,
  whatsappMode,
}) {
  if (mode !== 'template') return ''
  if (!template) return __('Choose an approved template.')
  const t = (templates || []).find((x) => x.name === template)
  if (t && t.status !== 'APPROVED')
    return __('This template is not approved by WhatsApp yet ({0}).', [
      t.status || '—',
    ])
  if (!consentEnabled)
    return __(
      'Turn on "Ask for WhatsApp consent": confirmations only go to people who tick it.',
    )
  if (whatsappMode !== 'api')
    return __(
      'WhatsApp is not connected to the API, so confirmations wait until it is.',
    )
  return ''
}
