// Bandeja › Llamadas: the words for who a call would ring right now
// (crm.api.calls.ring_now) and the areas the owner took off the line. Pure.

/** The stored areas off the line (a JSON list) as a Set. */
export function skippedAreas(value) {
  try {
    const list = value ? JSON.parse(value) : []
    return new Set(
      Array.isArray(list) ? list.filter((a) => typeof a === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

/** The line over the people: what happens to a call right now. */
export function nowTitleOf(now) {
  if (!now) return ''
  if (now.closed) return __('Closed now: callers hear the after-hours message.')
  const anyone = now.people?.length > 0
  if (now.mode === 'fallback' && now.because === 'no_shifts')
    return anyone
      ? __('This shop keeps no shifts: the list rings.')
      : __(
          'This shop keeps no shifts and nobody rings: callers go to the message.',
        )
  if (now.mode === 'fallback') {
    if (now.fallback === 'message')
      return anyone
        ? __(
            'Nobody who sells is on shift: who always rings, then the message.',
          )
        : __('Nobody who sells is on shift: callers go to the message.')
    return anyone
      ? __('Nobody who sells is on shift: the list rings.')
      : __('Nobody who sells is on shift and the list is empty.')
  }
  if (!anyone) return __('Nobody rings now: add the people at the counter.')
  return __('A call rings now')
}

/** Why this person rings: their shift, their check-in, «always», the list. */
export function whyLineOf(person) {
  if (person.kind === 'always') return __('always rings')
  if (person.kind === 'list') return __('on the list')
  return [
    person.shift && __('shift {0}', [person.shift]),
    person.checked_in && __('checked in {0}', [person.checked_in]),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Where the call finds them; «Muelle closed» means it can't. */
export function reachLineOf(person) {
  if (person.reach === 'phone')
    return person.mobile_end
      ? __('on their phone ···{0}', [person.mobile_end])
      : __('on their phone')
  if (person.reach === 'sip') return __('on the softphone')
  if (person.reach === 'muelle_off') return __('Muelle is closed')
  return __('in Muelle')
}
