// What the assistant's log and state need of a decision card (asistente S41c):
// which card a message carries, its key, and the card closed by an inline
// answer. No imports: useAssistant loads it on every door, so it stays tiny;
// the card's own helpers live in decisionCards.js.

/** The kinds the panel draws; any other card stays the message's text and buttons. */
export const CARD_TYPES = ['cap_item', 'cap_supplier', 'cap_warehouse']

/** The card a message carries, or null (an unknown kind, an old server). */
export function cardOf(message) {
  const card = message?.card
  if (!card || typeof card !== 'object') return null
  if (!CARD_TYPES.includes(card.type)) return null
  if (typeof card.sid !== 'string' || !Number.isInteger(card.di)) return null
  return card
}

/** One card per question of a session, whatever message shows it. */
export function cardKey(card) {
  return `${card.sid}:${card.di}`
}

export function isPending(card) {
  return card?.status === 'pending'
}

/**
 * The text before a card's own question: what the questions are about
 * («🧾 Factura de Compra de «X» · $49,222.67 · 14 renglones»), which doco puts
 * on the first card only, a blank line before the question.
 */
export function leadOf(message) {
  const text = String(message?.text || '')
  const at = text.indexOf('\n\n')
  return at > 0 ? text.slice(0, at).trim() : ''
}

/** The live card patched with an inline answer, until doco's edit arrives. */
export function answeredLocally(card, row) {
  const action = row?.action || ''
  return {
    ...card,
    status: action === 'skip' ? 'skipped' : 'resolved',
    result: {
      action,
      summary: row?.summary || card.subject,
      doctype: row?.doctype || null,
      name: row?.name || null,
    },
  }
}
