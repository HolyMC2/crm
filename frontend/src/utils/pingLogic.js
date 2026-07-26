// Notification-ping decisions (extracted from Inbox.vue for testability —
// audit-front named this as an untested risky path).

// Suppress pings for a moment after WE sent something: outbound status echoes
// arrive as socket events and must not sound like a customer reply.
export const SELF_SEND_WINDOW_MS = 3000

export function recentSelfSend(lastSendAt, now = Date.now()) {
  return now - lastSendAt <= SELF_SEND_WINDOW_MS
}

// WhatsApp: ping only when the unread-dot count actually ROSE (a genuinely new
// inbound) and we didn't just send ourselves.
export function shouldPingWa(unreadNow, unreadPrev, lastSendAt, now = Date.now()) {
  return unreadNow > unreadPrev && !recentSelfSend(lastSendAt, now)
}

// Messenger: the webhook tags direction — ping on Incoming unless self-send echo.
export function shouldPingMessenger(direction, lastSendAt, now = Date.now()) {
  return direction === 'Incoming' && !recentSelfSend(lastSendAt, now)
}
