// Pure input guard for the coaching-note composer (CoachingPanel.vue, spec 7.4).
// Kept dependency-free so it unit-tests without Vue/i18n. The SERVER is the
// authority (it escapes on write and enforces the manager gate + perms); this only
// stops an empty or oversized submit before it leaves the browser, so the button
// disables and no pointless round-trip happens.

// Generous cap for a private coaching note — a couple of paragraphs. Purely a
// client-side sanity bound; the backend accepts any non-empty text.
export const MAX_NOTE_LEN = 2000

// True when `text` is a submittable note: non-empty after trimming and within the
// length cap. The composer binds the send button's :disabled to !canSubmitNote().
export function canSubmitNote(text) {
  const t = String(text ?? '').trim()
  return t.length > 0 && t.length <= MAX_NOTE_LEN
}
