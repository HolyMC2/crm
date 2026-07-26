// Pure helpers for the score-explain popover (ScoreExplainPopover.vue, spec 5.4).
// Dependency-free so they unit-test without frappe-ui / a clock / an i18n catalog.
// The component formats user-facing copy through __(); these return the es-MX
// source strings that the catalog keys off (same convention as summaryStaleness.js).

// Signed point contribution → "+20" / "−5" / "0". Uses the true minus sign
// (U+2212) so a negative contribution reads cleanly next to the "+"; callers that
// need a plain hyphen can post-process, but the badge wants the typographic form.
export function signedPoints(n) {
  const v = Math.trunc(Number(n) || 0)
  if (v > 0) return `+${v}`
  if (v < 0) return `−${Math.abs(v)}`
  return '0'
}

// Compact criterion phrasing used as the secondary line when a rule has no
// manager-written description. `field` is the raw CRM Lead fieldname, `operator`
// and `value` come straight off Lead Scoring Rule. Deliberately terse — the rule
// NAME (author-written, es-MX) is the primary label; this is only a hint.
export function criterionText(field, operator, value) {
  const f = field || ''
  const v = value == null ? '' : String(value)
  switch (operator) {
    case 'equals':
      return `${f} = ${v}`.trim()
    case 'not equals':
      return `${f} ≠ ${v}`.trim()
    case 'is set':
      return `${f} definido`.trim()
    case 'is not set':
      return `${f} sin definir`.trim()
    case 'contains':
      return `${f} contiene «${v}»`.trim()
    case 'in':
      return `${f} ∈ ${v}`.trim()
    case 'greater than':
      return `${f} > ${v}`.trim()
    case 'less than':
      return `${f} < ${v}`.trim()
    default:
      return [f, operator, v].filter(Boolean).join(' ').trim()
  }
}

// Popover header: "por qué B · 62". Falls back to a plain score line when the
// lead has no grade yet (score present but ungraded).
export function gradeHeadline(grade, score) {
  const s = score == null || score === '' ? '' : score
  if (grade) return `por qué ${grade}${s === '' ? '' : ` · ${s}`}`
  return s === '' ? 'Puntaje' : `Puntaje ${s}`
}

// Desktop placement for the floating card: given the trigger's viewport rect, the
// card's measured size, and the viewport size, return {top, left} clamped so the
// card stays fully on screen. Prefers dropping BELOW the trigger; flips above when
// it would overflow the bottom. Purely arithmetic → unit-tested without a DOM.
export function popoverPosition(rect, card, vp, gap = 6) {
  let top = rect.bottom + gap
  if (top + card.h > vp.h - gap) {
    const above = rect.top - gap - card.h
    top = above >= gap ? above : Math.max(gap, vp.h - gap - card.h)
  }
  let left = rect.left
  if (left + card.w > vp.w - gap) left = vp.w - gap - card.w
  if (left < gap) left = gap
  return { top: Math.round(top), left: Math.round(left) }
}
